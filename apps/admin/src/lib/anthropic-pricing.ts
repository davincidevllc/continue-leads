/**
 * anthropic-pricing — per-model price table for Claude API cost computation.
 *
 * All prices are USD per million tokens. Verify against
 * https://www.anthropic.com/pricing before relying on these for budgeting —
 * prices change and a forgotten table here would silently misreport spend.
 *
 * Prompt caching pricing pattern (per Anthropic's published model):
 *   - cache_write (writing to cache): 1.25x the input price
 *   - cache_read  (reading from cache): 0.1x the input price
 *
 * Spec: docs/phase-0-plan.md (Burst 0f, COST-2)
 */

export interface ModelPrice {
  /** USD per million input tokens (uncached) */
  input: number;
  /** USD per million output tokens */
  output: number;
  /** USD per million tokens written to prompt cache (typically 1.25x input) */
  cacheWrite: number;
  /** USD per million tokens read from prompt cache (typically 0.1x input) */
  cacheRead: number;
}

/**
 * Pricing as of 2026-Q2. **VERIFY before use.**
 *
 * Order: newest → oldest within each tier. The fallback in
 * `computeAnthropicCost` is `claude-sonnet-4-6` if the model isn't found.
 */
export const ANTHROPIC_PRICING: Record<string, ModelPrice> = {
  // Opus tier — highest quality, highest cost
  'claude-opus-4-8': { input: 15, output: 75, cacheWrite: 18.75, cacheRead: 1.5 },
  'claude-opus-4-7': { input: 15, output: 75, cacheWrite: 18.75, cacheRead: 1.5 },

  // Sonnet tier — workhorse for ~80% of content generation
  'claude-sonnet-4-6': { input: 3, output: 15, cacheWrite: 3.75, cacheRead: 0.3 },

  // Haiku tier — bulk / repetitive content
  'claude-haiku-4-5-20251001': { input: 0.8, output: 4, cacheWrite: 1.0, cacheRead: 0.08 },

  // Fable (creative tier) — pricing TBD; using a placeholder.
  // TODO(thiago): verify and update.
  'claude-fable-5': { input: 5, output: 25, cacheWrite: 6.25, cacheRead: 0.5 },
};

const FALLBACK_MODEL = 'claude-sonnet-4-6';

export interface AnthropicUsageLike {
  input_tokens?: number;
  output_tokens?: number;
  cache_creation_input_tokens?: number | null;
  cache_read_input_tokens?: number | null;
}

export function computeAnthropicCost(model: string, usage: AnthropicUsageLike): number {
  const pricing = ANTHROPIC_PRICING[model] ?? ANTHROPIC_PRICING[FALLBACK_MODEL];

  const inputCost = ((usage.input_tokens ?? 0) / 1_000_000) * pricing.input;
  const outputCost = ((usage.output_tokens ?? 0) / 1_000_000) * pricing.output;
  const cacheWriteCost =
    ((usage.cache_creation_input_tokens ?? 0) / 1_000_000) * pricing.cacheWrite;
  const cacheReadCost =
    ((usage.cache_read_input_tokens ?? 0) / 1_000_000) * pricing.cacheRead;

  // Round to 6 decimals to match the DB column precision (NUMERIC(12,6))
  // and avoid float rounding drift on aggregation.
  return Math.round((inputCost + outputCost + cacheWriteCost + cacheReadCost) * 1_000_000) / 1_000_000;
}
