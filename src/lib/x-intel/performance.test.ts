import { describe, it, expect } from 'vitest'
import { makePost } from '../intel-library/test-fixtures'
import {
  filterPostsByWindow,
  postEngagementRate,
  postAmplification,
  type PerformanceWindow,
} from './performance'

const NOW = Date.parse('2026-07-12T12:00:00.000Z')

describe('filterPostsByWindow', () => {
  const recent = makePost({ id: 'r', createdAt: '2026-07-10T12:00:00.000Z' })
  const mid = makePost({ id: 'm', createdAt: '2026-06-20T12:00:00.000Z' })
  const old = makePost({ id: 'o', createdAt: '2026-01-01T12:00:00.000Z' })

  it('keeps 7d / 30d / all correctly', () => {
    expect(filterPostsByWindow([recent, mid, old], '7d', NOW).map((p) => p.id)).toEqual(['r'])
    expect(filterPostsByWindow([recent, mid, old], '30d', NOW).map((p) => p.id).sort()).toEqual(['m', 'r'])
    expect(filterPostsByWindow([recent, mid, old], 'all', NOW)).toHaveLength(3)
  })

  it('drops invalid createdAt', () => {
    const bad = makePost({ id: 'b', createdAt: 'not-a-date' })
    expect(filterPostsByWindow([bad], 'all', NOW)).toEqual([])
  })
})

describe('per-post metrics', () => {
  it('computes engagement rate and amplification', () => {
    const p = makePost({
      metrics: { impressions: 1000, likes: 40, reposts: 5, replies: 3, quotes: 2, bookmarks: 1 },
    })
    expect(postEngagementRate(p)).toBeCloseTo(50 / 1000)
    expect(postAmplification(p)).toBe(7)
  })

  it('engagement rate is 0 when impressions are 0', () => {
    expect(postEngagementRate(makePost({ metrics: { impressions: 0, likes: 10 } }))).toBe(0)
  })
})
