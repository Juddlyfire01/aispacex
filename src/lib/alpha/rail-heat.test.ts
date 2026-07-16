import { describe, expect, it } from 'vitest'
import { rankRailsByHeat } from './rail-heat'
import type { AlphaRail, RailCountsCache } from './types'

describe('rankRailsByHeat', () => {
  it('puts accelerating rails first', () => {
    const rails: AlphaRail[] = [
      {
        id: 'a',
        label: 'Slow',
        query: 'a',
        source: 'system',
        enabled: true,
      },
      {
        id: 'b',
        label: 'Fast',
        query: 'b',
        source: 'system',
        enabled: true,
      },
    ]
    const counts: Record<string, RailCountsCache> = {
      a: {
        railId: 'a',
        query: 'a',
        fetchedAt: 1,
        totalTweetCount: 9000,
        buckets: [
          { start: 't0', end: 't1', tweet_count: 100 },
          { start: 't1', end: 't2', tweet_count: 90 },
        ],
        cost: 0,
      },
      b: {
        railId: 'b',
        query: 'b',
        fetchedAt: 1,
        totalTweetCount: 200,
        buckets: [
          { start: 't0', end: 't1', tweet_count: 10 },
          { start: 't1', end: 't2', tweet_count: 40 },
        ],
        cost: 0,
      },
    }
    const ranked = rankRailsByHeat(rails, counts)
    expect(ranked[0]?.rail.id).toBe('b')
  })

  it('skips disabled rails', () => {
    const rails: AlphaRail[] = [
      { id: 'x', label: 'Off', query: 'x', source: 'user', enabled: false },
      { id: 'y', label: 'On', query: 'y', source: 'user', enabled: true },
    ]
    expect(rankRailsByHeat(rails, {})).toHaveLength(1)
    expect(rankRailsByHeat(rails, {})[0]?.rail.id).toBe('y')
  })
})
