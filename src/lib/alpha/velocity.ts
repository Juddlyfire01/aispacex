import type { CountBucket, VelocityResult } from './types'

function sumCounts(buckets: CountBucket[]): number {
  return buckets.reduce((n, b) => n + (b.tweet_count ?? 0), 0)
}

/**
 * Derive Radar-style velocity from hourly count buckets (newest last or any order).
 * Buckets from counts/recent are chronological; we sort by start ascending.
 */
export function computeVelocity(buckets: CountBucket[]): VelocityResult {
  const sorted = [...buckets].sort((a, b) => a.start.localeCompare(b.start))
  const empty: VelocityResult = {
    hourPct: null,
    dayPct: null,
    lastHourCount: 0,
    priorHourCount: 0,
    lastDayCount: 0,
    priorDayCount: 0,
  }
  if (sorted.length === 0) return empty

  const last = sorted[sorted.length - 1]!
  const prior = sorted.length >= 2 ? sorted[sorted.length - 2]! : undefined
  const lastHourCount = last.tweet_count ?? 0
  const priorHourCount = prior?.tweet_count ?? 0

  let hourPct: number | null = null
  if (prior && priorHourCount > 0) {
    hourPct = ((lastHourCount - priorHourCount) / priorHourCount) * 100
  } else if (prior && priorHourCount === 0 && lastHourCount > 0) {
    hourPct = 100
  }

  const last24 = sorted.slice(-24)
  const prior24 = sorted.slice(-48, -24)
  const lastDayCount = sumCounts(last24)
  const priorDayCount = sumCounts(prior24)

  let dayPct: number | null = null
  if (prior24.length > 0 && priorDayCount > 0) {
    dayPct = ((lastDayCount - priorDayCount) / priorDayCount) * 100
  } else if (prior24.length > 0 && priorDayCount === 0 && lastDayCount > 0) {
    dayPct = 100
  }

  return {
    hourPct,
    dayPct,
    lastHourCount,
    priorHourCount,
    lastDayCount,
    priorDayCount,
  }
}

export function formatVelocityPct(pct: number | null): string {
  if (pct == null || !Number.isFinite(pct)) return '—'
  const sign = pct > 0 ? '+' : ''
  return `${sign}${pct.toFixed(0)}%`
}
