import type { AlphaRail, RailCountsCache } from './types'
import { computeVelocity } from './velocity'
import { railHeatScore } from './grok-brief'

export interface RankedRail {
  rail: AlphaRail
  heat: number
  hourPct: number | null
  dayPct: number | null
  totalTweetCount: number
  lastHourCount: number
}

/** Rank enabled rails hottest-first for the Radar board. */
export function rankRailsByHeat(
  rails: AlphaRail[],
  countsByRail: Record<string, RailCountsCache>,
): RankedRail[] {
  return rails
    .filter((r) => r.enabled)
    .map((rail) => {
      const cache = countsByRail[rail.id]
      const match = cache && cache.query === rail.query ? cache : undefined
      const velocity = match ? computeVelocity(match.buckets) : null
      const totalTweetCount = match?.totalTweetCount ?? 0
      return {
        rail,
        heat: railHeatScore(velocity, totalTweetCount),
        hourPct: velocity?.hourPct ?? null,
        dayPct: velocity?.dayPct ?? null,
        totalTweetCount,
        lastHourCount: velocity?.lastHourCount ?? 0,
      }
    })
    .sort((a, b) => b.heat - a.heat)
}
