/**
 * anthropic — cost-tracking wrapper around the Anthropic SDK (COST-2)
 *
 * Every call to Claude in this codebase MUST go through `generateMessage`
 * (not directly via `new Anthropic().messages.create`). The wrapper:
 *   - Captures the response's usage block.
 *   - Computes cost via `computeAnthropicCost` against the per-model price table.
 *   - Writes a row to `api_usage` (best-effort — failures don't break the call).
 *   - Records failed calls too (cost = 0, error = message) so the dashboard
 *     can show API-error rate, not just spend.
 *
 * Future enforcement: an ESLint rule (MT-8 follow-up) will forbid raw
 * `@anthropic-ai/sdk` imports outside this file. For now, code review and
 * grep are the boundary.
 *
 * Spec: docs/phase-0-plan.md (Burst 0f, COST-2)
 */

import Anthropic from '@anthropic-ai/sdk';
import { recordApiUsage } from './api-usage';
import { computeAnthropicCost } from './anthropic-pricing';

/**
 * Lazily-instantiated singleton. Returns null if `ANTHROPIC_API_KEY` is
 * absent — useful for local dev without keys. Production deploys MUST
 * have the key set; calling generateMessage without it throws.
 */
let cachedClient: Anthropic | null = null;
function getClient(): Anthropic {
  if (cachedClient) return cachedClient;
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error(
      'ANTHROPIC_API_KEY is not set. Add it to the staging Secrets Manager entry and redeploy.'
    );
  }
  cachedClient = new Anthropic({ apiKey });
  return cachedClient;
}

export interface GenerateMessageOptions
  extends Anthropic.MessageCreateParamsNonStreaming {
  /** Required — tenant the API call belongs to. */
  tenantId: string;
  /** Optional — brand the API call is being made on behalf of. */
  brandId?: string;
  /** Optional — arbitrary context stored in api_usage.metadata. */
  metadata?: Record<string, unknown>;
}

/**
 * Single entry point for Claude calls. Tracking is automatic.
 *
 * Example:
 *   const message = await generateMessage({
 *     tenantId,
 *     brandId,
 *     metadata: { pageId, pageType: 'MONEY' },
 *     model: 'claude-sonnet-4-6',
 *     max_tokens: 2048,
 *     messages: [{ role: 'user', content: prompt }],
 *   });
 */
export async function generateMessage(
  options: GenerateMessageOptions
): Promise<Anthropic.Message> {
  const { tenantId, brandId, metadata, ...anthropicParams } = options;
  const startedAt = Date.now();
  const client = getClient();

  try {
    const message = await client.messages.create(anthropicParams);

    const latencyMs = Date.now() - startedAt;
    const cost = computeAnthropicCost(anthropicParams.model, message.usage);

    // Fire-and-forget tracking — never await on the tracking insert's
    // own failure path. recordApiUsage already swallows errors internally,
    // but adding .catch here is belt-and-suspenders.
    recordApiUsage({
      tenantId,
      brandId,
      provider: 'anthropic',
      model: anthropicParams.model,
      inputTokens: message.usage.input_tokens,
      outputTokens: message.usage.output_tokens,
      cachedInputTokens: message.usage.cache_read_input_tokens ?? undefined,
      cacheCreationInputTokens: message.usage.cache_creation_input_tokens ?? undefined,
      costUsd: cost,
      requestId: message.id,
      latencyMs,
      metadata,
    }).catch(() => {
      // Belt-and-suspenders — recordApiUsage already swallows but JS sometimes
      // surfaces unhandled rejections through the runtime if we forget this.
    });

    return message;
  } catch (err) {
    const latencyMs = Date.now() - startedAt;
    const errMessage = err instanceof Error ? err.message : 'Unknown Anthropic error';

    // Record the failed call so the dashboard sees error rate, not just spend.
    recordApiUsage({
      tenantId,
      brandId,
      provider: 'anthropic',
      model: anthropicParams.model,
      costUsd: 0,
      error: errMessage,
      latencyMs,
      metadata,
    }).catch(() => {});

    // Re-throw so the caller knows the call failed.
    throw err;
  }
}

/**
 * Re-export the SDK's types so callers can type their callbacks without
 * having to install @anthropic-ai/sdk themselves.
 */
export type { Anthropic };
