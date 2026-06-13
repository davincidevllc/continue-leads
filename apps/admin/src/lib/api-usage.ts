/**
 * api-usage — generic recorder for external API spend (COST-1 consumer)
 *
 * Used by every external-API wrapper (Anthropic, Voyage, Flux, etc.) to
 * INSERT a row into `api_usage`. The dashboard later reads from this
 * single table to roll up spend per-tenant / per-brand / per-provider.
 *
 * Spec: docs/phase-0-plan.md (Burst 0f)
 */

import { withTenantContext } from './db-context';

export type Provider = 'anthropic' | 'voyage' | 'flux' | 'stability' | 'dalle';

export interface ApiUsageRecord {
  tenantId: string;
  brandId?: string;
  provider: Provider;
  model: string;
  inputTokens?: number;
  outputTokens?: number;
  cachedInputTokens?: number;
  cacheCreationInputTokens?: number;
  costUsd: number;
  requestId?: string;
  error?: string;
  latencyMs?: number;
  metadata?: Record<string, unknown>;
}

/**
 * Best-effort insert into api_usage. Failures are logged and swallowed —
 * never break the calling API request just because cost tracking is broken
 * (e.g., DB roles not yet installed, RLS misconfigured, network blip).
 */
export async function recordApiUsage(record: ApiUsageRecord): Promise<void> {
  try {
    await withTenantContext({ tenantId: record.tenantId }, async (client) => {
      await client.query(
        `INSERT INTO api_usage (
            tenant_id, brand_id, provider, model,
            input_tokens, output_tokens,
            cached_input_tokens, cache_creation_input_tokens,
            cost_usd, request_id, error, latency_ms, metadata
         ) VALUES (
            $1, $2, $3, $4,
            $5, $6,
            $7, $8,
            $9, $10, $11, $12, $13
         )`,
        [
          record.tenantId,
          record.brandId ?? null,
          record.provider,
          record.model,
          record.inputTokens ?? 0,
          record.outputTokens ?? 0,
          record.cachedInputTokens ?? null,
          record.cacheCreationInputTokens ?? null,
          record.costUsd,
          record.requestId ?? null,
          record.error ?? null,
          record.latencyMs ?? null,
          record.metadata ?? {},
        ]
      );
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'unknown';
    // Use console.warn so this surfaces in CloudWatch / Sentry breadcrumbs
    // without bubbling up to the caller.
    console.warn(
      `[api-usage] Failed to record ${record.provider}/${record.model} usage for tenant ${record.tenantId}:`,
      msg
    );
  }
}
