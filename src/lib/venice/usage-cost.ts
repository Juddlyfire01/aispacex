import type { VeniceModel } from '../../types/venice'

export interface TokenUsage {
  prompt_tokens?: number
  completion_tokens?: number
  total_tokens?: number
}

/**
 * Venice model_spec.pricing.input/output.usd is USD per 1M tokens
 * (same convention as the Models API). Falls back to 0 when pricing is missing.
 */
export function estimateUsageUsd(
  model: VeniceModel | undefined | null,
  usage: TokenUsage | undefined | null,
): number {
  if (!usage) return 0
  const inputRate = model?.model_spec?.pricing?.input?.usd
  const outputRate = model?.model_spec?.pricing?.output?.usd
  const prompt = typeof usage.prompt_tokens === 'number' ? Math.max(0, usage.prompt_tokens) : 0
  const completion =
    typeof usage.completion_tokens === 'number' ? Math.max(0, usage.completion_tokens) : 0

  // If only total_tokens is present, treat as input-priced (conservative lower bound).
  if (prompt === 0 && completion === 0) {
    const total = typeof usage.total_tokens === 'number' ? Math.max(0, usage.total_tokens) : 0
    if (total === 0) return 0
    const rate = typeof inputRate === 'number' && inputRate > 0 ? inputRate : 0
    return (total / 1_000_000) * rate
  }

  const inUsd =
    typeof inputRate === 'number' && inputRate > 0 ? (prompt / 1_000_000) * inputRate : 0
  const outUsd =
    typeof outputRate === 'number' && outputRate > 0
      ? (completion / 1_000_000) * outputRate
      : 0
  return inUsd + outUsd
}
