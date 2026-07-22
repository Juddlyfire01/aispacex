import type { VeniceModel } from '../../types/venice'

export interface TokenUsage {
  prompt_tokens?: number
  completion_tokens?: number
  total_tokens?: number
}

/** Media generation kinds that price off model_spec.pricing (not tokens). */
export type MediaKind = 'image' | 'video' | 'music' | 'tts'

export interface MediaCostParams {
  /** Number of image variants (image only). Defaults to 1. */
  variants?: number
  /** Duration in seconds (video / music). Used with per_second or durations. */
  seconds?: number
  /** Duration bucket key (video), matched against pricing.durations. */
  durationKey?: string
  /** Character count of the input text (tts). */
  characters?: number
}

/**
 * Estimate USD for a media generation call from the model's pricing block.
 *
 * Venice media models are NOT token-priced. Instead model_spec.pricing carries:
 *  - `generation.usd`            — flat per-image (image models)
 *  - `per_second.usd`            — per-second (video / music)
 *  - `durations[key].usd`        — per-duration-bucket (some video models)
 *  - `per_thousand_characters.usd` — per 1K chars (tts)
 *
 * Returns 0 when pricing for the kind is missing (so the meter degrades to
 * "unpriced" rather than guessing).
 */
export function estimateMediaUsd(
  model: VeniceModel | undefined | null,
  kind: MediaKind,
  params: MediaCostParams = {},
): number {
  const pricing = model?.model_spec?.pricing
  if (!pricing) return 0

  switch (kind) {
    case 'image': {
      const per = pricing.generation?.usd
      if (typeof per !== 'number' || per <= 0) return 0
      const variants = Math.max(1, Math.floor(params.variants ?? 1))
      return per * variants
    }
    case 'video': {
      // Prefer an explicit duration bucket when the model prices that way.
      if (params.durationKey && pricing.durations?.[params.durationKey]) {
        const bucket = pricing.durations[params.durationKey]
        if (typeof bucket.usd === 'number' && bucket.usd > 0) return bucket.usd
      }
      const perSec = pricing.per_second?.usd
      if (typeof perSec === 'number' && perSec > 0 && params.seconds != null) {
        return perSec * Math.max(0, params.seconds)
      }
      // Fall back to any single duration bucket if seconds unknown.
      const buckets = pricing.durations ? Object.values(pricing.durations) : []
      const firstPriced = buckets.find((b) => typeof b.usd === 'number' && b.usd > 0)
      return firstPriced?.usd ?? 0
    }
    case 'music': {
      const perSec = pricing.per_second?.usd
      if (typeof perSec === 'number' && perSec > 0 && params.seconds != null) {
        return perSec * Math.max(0, params.seconds)
      }
      const per = pricing.generation?.usd
      return typeof per === 'number' && per > 0 ? per : 0
    }
    case 'tts': {
      const perK = pricing.per_thousand_characters?.usd
      if (typeof perK !== 'number' || perK <= 0) return 0
      const chars = Math.max(0, params.characters ?? 0)
      return (chars / 1000) * perK
    }
    default:
      return 0
  }
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
