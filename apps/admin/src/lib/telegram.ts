/**
 * telegram — proactive alerts and inbound queries (TG-2)
 *
 * One platform-level bot serves ALL tenants. Each tenant configures their
 * own chat ID in `tenants.settings.alerts.telegram_chat_id`; platform-level
 * alerts (cross-tenant ops, deploy events, etc.) go to TELEGRAM_PLATFORM_CHAT_ID.
 *
 * Why Telegram and not WhatsApp:
 *   - WhatsApp Business API requires Meta verification (weeks of paperwork
 *     and often rejection). Telegram Bot API is free, instant, no review.
 *   - Telegram supports groups, inbound queries, rich formatting natively.
 *
 * Resilience contract — sendAlert MUST NEVER throw:
 *   - Missing bot token → returns { sent: false, reason: '...' }, doesn't throw.
 *   - Missing chat ID for tenant → returns { sent: false, reason: '...' }.
 *   - Telegram API failure → logged via console.warn, returns { sent: false }.
 *   - Rate-limited → returns { sent: false, reason: 'rate_limited' }.
 *
 * A request handler can `await sendAlert(...)` without try/catch and trust
 * the platform stays up even if Telegram is down. This is critical for
 * lead capture and other revenue-impacting paths.
 *
 * Spec: docs/phase-0-plan.md (Burst 0d) + CLAUDE.md "Telegram Bot" section.
 */

import { withPlatformContext } from './db-context';

// =====================================================================
// Types
// =====================================================================

export type AlertLevel = 'info' | 'warn' | 'error' | 'critical';

/**
 * Canonical event taxonomy. Extend here when new event types are needed.
 * Keep the list curated — every type added becomes part of the alert
 * surface and a potential source of noise.
 */
export type EventType =
  // Lead lifecycle (Phase 5+)
  | 'LEAD_CAPTURED'
  // Deploys
  | 'DEPLOY_STARTED'
  | 'DEPLOY_COMPLETED'
  | 'DEPLOY_FAILED'
  // Reliability
  | 'ERROR_RATE_SPIKE'
  | 'DB_UNHEALTHY'
  // Cost
  | 'COST_THRESHOLD_BREACHED'
  // Brand lifecycle
  | 'BRAND_CREATED'
  | 'BRAND_WENT_LIVE'
  // Content / QA (Phase 3-4)
  | 'GENERATION_FAILED'
  | 'CONTENT_BATCH_COMPLETED'
  | 'QA_FAILURE_DIGEST'
  // Image generation (per image-strategy spec)
  | 'IMAGE_BATCH_AWAITING_APPROVAL'
  // Testing the wiring (use freely)
  | 'PLATFORM_TEST';

export interface SendAlertOptions {
  /** Omit for platform-level alerts (goes to TELEGRAM_PLATFORM_CHAT_ID). */
  tenantId?: string;
  level: AlertLevel;
  eventType: EventType;
  /** Short human-readable headline; one line. */
  title: string;
  /** Optional body — supports multi-line. */
  body?: string;
  /** Optional structured context; rendered as a code block under the body. */
  metadata?: Record<string, unknown>;
}

export interface SendAlertResult {
  sent: boolean;
  reason?: string;
}

// =====================================================================
// Rate limiting
// =====================================================================

/**
 * Max sends of a given event type per chat per window. Tune per type if
 * something gets too chatty. The defaults err on the side of allowing
 * alerts through — for most event types we'd rather get a few duplicates
 * than miss a real one.
 *
 * Map<eventType, { windowMs, maxInWindow }>
 */
const RATE_LIMITS: Record<EventType, { windowMs: number; maxInWindow: number }> = {
  LEAD_CAPTURED:                 { windowMs: 60_000,  maxInWindow: 30 }, // high-volume by design
  DEPLOY_STARTED:                { windowMs: 300_000, maxInWindow: 3 },
  DEPLOY_COMPLETED:              { windowMs: 300_000, maxInWindow: 3 },
  DEPLOY_FAILED:                 { windowMs: 60_000,  maxInWindow: 5 },  // we want to see failures
  ERROR_RATE_SPIKE:              { windowMs: 300_000, maxInWindow: 2 },  // avoid spike-flooding
  DB_UNHEALTHY:                  { windowMs: 60_000,  maxInWindow: 1 },  // critical, no need to spam
  COST_THRESHOLD_BREACHED:       { windowMs: 3_600_000, maxInWindow: 1 }, // 1/hr — actionable
  BRAND_CREATED:                 { windowMs: 60_000,  maxInWindow: 10 },
  BRAND_WENT_LIVE:               { windowMs: 60_000,  maxInWindow: 10 },
  GENERATION_FAILED:             { windowMs: 300_000, maxInWindow: 5 },
  CONTENT_BATCH_COMPLETED:       { windowMs: 60_000,  maxInWindow: 10 },
  QA_FAILURE_DIGEST:             { windowMs: 86_400_000, maxInWindow: 1 }, // 1/day max
  IMAGE_BATCH_AWAITING_APPROVAL: { windowMs: 60_000,  maxInWindow: 10 },
  PLATFORM_TEST:                 { windowMs: 1_000,   maxInWindow: 100 }, // basically off
};

/**
 * In-memory rate-limit bucket. Per ECS task — a multi-task deploy will
 * have looser effective limits but that's acceptable for v1.
 *
 * Map<`${eventType}:${chatId}`, Array<timestampMs>>
 */
const rateLimitBuckets = new Map<string, number[]>();

function checkRateLimit(eventType: EventType, chatId: string): boolean {
  const cfg = RATE_LIMITS[eventType];
  const key = `${eventType}:${chatId}`;
  const now = Date.now();
  const cutoff = now - cfg.windowMs;

  const existing = rateLimitBuckets.get(key) ?? [];
  // Trim old entries
  const fresh = existing.filter((ts) => ts > cutoff);

  if (fresh.length >= cfg.maxInWindow) {
    rateLimitBuckets.set(key, fresh);
    return false;
  }

  fresh.push(now);
  rateLimitBuckets.set(key, fresh);
  return true;
}

// =====================================================================
// Chat ID resolution
// =====================================================================

async function resolveChatId(tenantId: string | undefined): Promise<{
  chatId: string | null;
  source: 'tenant' | 'platform' | 'missing';
}> {
  if (!tenantId) {
    const platformChatId = process.env.TELEGRAM_PLATFORM_CHAT_ID;
    return platformChatId
      ? { chatId: platformChatId, source: 'platform' }
      : { chatId: null, source: 'missing' };
  }

  try {
    return await withPlatformContext(async (client) => {
      const result = await client.query(
        `SELECT settings FROM tenants WHERE id = $1 LIMIT 1`,
        [tenantId]
      );
      const settings = (result.rows[0] as { settings?: Record<string, unknown> } | undefined)
        ?.settings as
        | { alerts?: { telegram_chat_id?: string } }
        | undefined;
      const chatId = settings?.alerts?.telegram_chat_id;
      return chatId
        ? { chatId, source: 'tenant' as const }
        : { chatId: null, source: 'missing' as const };
    });
  } catch (err) {
    console.warn('[telegram] Failed to resolve tenant chat ID:', err);
    return { chatId: null, source: 'missing' };
  }
}

// =====================================================================
// Message formatting
// =====================================================================

const LEVEL_PREFIX: Record<AlertLevel, string> = {
  info:     'ℹ️',
  warn:     '⚠️',
  error:    '❌',
  critical: '🚨',
};

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function formatMessage(opts: SendAlertOptions): string {
  const env = process.env.SENTRY_ENVIRONMENT || process.env.NODE_ENV || 'development';
  const prefix = LEVEL_PREFIX[opts.level];

  const lines: string[] = [];
  lines.push(`${prefix} <b>${escapeHtml(opts.eventType)}</b> [${escapeHtml(env)}]`);
  lines.push(`<b>${escapeHtml(opts.title)}</b>`);
  if (opts.body) {
    lines.push('');
    lines.push(escapeHtml(opts.body));
  }
  if (opts.metadata && Object.keys(opts.metadata).length > 0) {
    lines.push('');
    lines.push(`<pre>${escapeHtml(JSON.stringify(opts.metadata, null, 2))}</pre>`);
  }
  return lines.join('\n');
}

// =====================================================================
// Public API
// =====================================================================

/**
 * Send an alert via Telegram. NEVER throws — failures are returned in the
 * result object. Callers can fire-and-forget without try/catch.
 *
 * @example
 *   await sendAlert({
 *     tenantId,
 *     level: 'warn',
 *     eventType: 'COST_THRESHOLD_BREACHED',
 *     title: 'Claude API spend hit $25 today',
 *     body: 'Threshold was $10. See the cost dashboard for breakdown.',
 *     metadata: { tenant: 'leadsquad', model: 'claude-sonnet-4-6' },
 *   });
 */
export async function sendAlert(opts: SendAlertOptions): Promise<SendAlertResult> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    return { sent: false, reason: 'TELEGRAM_BOT_TOKEN_not_set' };
  }

  const { chatId, source } = await resolveChatId(opts.tenantId);
  if (!chatId) {
    return {
      sent: false,
      reason: opts.tenantId
        ? `tenant_${opts.tenantId}_has_no_telegram_chat_id_configured`
        : 'TELEGRAM_PLATFORM_CHAT_ID_not_set',
    };
  }

  if (!checkRateLimit(opts.eventType, chatId)) {
    return { sent: false, reason: 'rate_limited' };
  }

  const text = formatMessage(opts);

  try {
    const resp = await fetch(
      `https://api.telegram.org/bot${token}/sendMessage`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          text,
          parse_mode: 'HTML',
          disable_web_page_preview: true,
        }),
      }
    );

    if (!resp.ok) {
      const errBody = await resp.text().catch(() => '<no body>');
      console.warn(
        `[telegram] sendMessage failed (status=${resp.status}, source=${source}): ${errBody}`
      );
      return { sent: false, reason: `telegram_api_${resp.status}` };
    }

    return { sent: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'unknown';
    console.warn(`[telegram] sendMessage threw: ${msg}`);
    return { sent: false, reason: 'network_or_runtime_error' };
  }
}

// =====================================================================
// Test helper (lets the operator verify wiring after deploy)
// =====================================================================

/**
 * Trip-wire helper for verifying the bot is connected end-to-end. Sends a
 * PLATFORM_TEST event to whichever chat resolves for the given tenant
 * (or platform if no tenant given).
 *
 * Use from a one-off script or temporary route handler.
 */
export async function sendTestAlert(tenantId?: string): Promise<SendAlertResult> {
  return sendAlert({
    tenantId,
    level: 'info',
    eventType: 'PLATFORM_TEST',
    title: 'Continue Leads — Telegram wiring OK',
    body: 'If you can read this, the bot is configured and reachable.',
    metadata: {
      env: process.env.NODE_ENV || 'unknown',
      ts: new Date().toISOString(),
    },
  });
}
