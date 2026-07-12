import { describe, it, expect } from 'vitest'
import { makePost, makeProfile } from '../intel-library/test-fixtures'
import {
  filterPostsByWindow,
  xWeightedScore,
  X_ENGAGEMENT_WEIGHTS,
  buildTopPosts,
  comparePeriods,
  buildDailySeries,
  buildGlance,
  buildCatalysts,
  makeSnapshot,
  appendSnapshot,
  followersDeltaFromHistory,
  metricForMode,
  PERF_TOP_LIST_CAP,
} from './performance'
import type { Post } from './types'

const NOW = Date.parse('2026-07-12T12:00:00.000Z')

describe('filterPostsByWindow', () => {
  const recent = makePost({ id: 'r', createdAt: '2026-07-10T12:00:00.000Z' })
  const mid = makePost({ id: 'm', createdAt: '2026-06-20T12:00:00.000Z' })
  const old = makePost({ id: 'o', createdAt: '2026-01-01T12:00:00.000Z' })

  it('keeps 7d / 30d / all correctly', () => {
    expect(filterPostsByWindow([recent, mid, old], '7d', NOW).map((p) => p.id)).toEqual(['r'])
    expect(filterPostsByWindow([recent, mid, old], '30d', NOW).map((p) => p.id).sort()).toEqual([
      'm',
      'r',
    ])
    expect(filterPostsByWindow([recent, mid, old], 'all', NOW)).toHaveLength(3)
  })
})

describe('xWeightedScore', () => {
  it('uses 2023-style weights: replies beat likes heavily', () => {
    const manyLikes = makePost({
      metrics: { impressions: 1_000_000, likes: 1000, reposts: 0, replies: 0, quotes: 0, bookmarks: 0 },
    })
    const realConvo = makePost({
      metrics: { impressions: 100_000, likes: 50, reposts: 20, replies: 40, quotes: 10, bookmarks: 5 },
    })
    // Empty reach should not beat real engagement
    expect(xWeightedScore(realConvo)).toBeGreaterThan(xWeightedScore(manyLikes))
    expect(xWeightedScore(manyLikes)).toBe(X_ENGAGEMENT_WEIGHTS.likes * 1000)
  })

  it('ignores impressions in the weighted sum', () => {
    const a = makePost({
      metrics: { impressions: 9_000_000, likes: 10, reposts: 0, replies: 0, quotes: 0, bookmarks: 0 },
    })
    const b = makePost({
      metrics: { impressions: 1, likes: 10, reposts: 0, replies: 0, quotes: 0, bookmarks: 0 },
    })
    expect(xWeightedScore(a)).toBe(xWeightedScore(b))
  })
})

describe('buildTopPosts', () => {
  const authorId = 'user-1'
  const profile = makeProfile('alice')
  profile.id = authorId

  function own(partial: Parameters<typeof makePost>[0]): Post {
    return makePost({ authorId, kind: 'original', createdAt: '2026-07-01T12:00:00.000Z', ...partial })
  }

  it('ranks high to low by selected metric', () => {
    const posts = [
      own({ id: 'a', metrics: { impressions: 100, likes: 5, reposts: 0, replies: 0, quotes: 0, bookmarks: 0 } }),
      own({ id: 'b', metrics: { impressions: 50, likes: 200, reposts: 0, replies: 0, quotes: 0, bookmarks: 0 } }),
    ]
    const byLikes = buildTopPosts({ posts, profile, window: 'all', mode: 'likes', nowMs: NOW })
    expect(byLikes.items[0].post.id).toBe('b')
    const byImpr = buildTopPosts({ posts, profile, window: 'all', mode: 'impressions', nowMs: NOW })
    expect(byImpr.items[0].post.id).toBe('a')
  })

  it('composite prefers conversation over empty reach', () => {
    const posts = [
      own({
        id: 'empty',
        metrics: { impressions: 1_000_000, likes: 0, reposts: 0, replies: 0, quotes: 0, bookmarks: 0 },
      }),
      own({
        id: 'convo',
        metrics: { impressions: 50_000, likes: 20, reposts: 5, replies: 15, quotes: 3, bookmarks: 2 },
      }),
    ]
    const result = buildTopPosts({ posts, profile, window: 'all', mode: 'composite', nowMs: NOW })
    expect(result.items[0].post.id).toBe('convo')
    expect(result.items.length).toBeLessThanOrEqual(PERF_TOP_LIST_CAP)
  })

  it('metricForMode matches modes', () => {
    const p = own({
      metrics: { impressions: 10, likes: 2, reposts: 3, replies: 4, quotes: 5, bookmarks: 6 },
    })
    expect(metricForMode(p, 'impressions')).toBe(10)
    expect(metricForMode(p, 'bookmarks')).toBe(6)
    expect(metricForMode(p, 'composite')).toBe(xWeightedScore(p))
  })
})

describe('period compare + series + catalysts', () => {
  const authorId = 'user-1'

  function own(partial: Parameters<typeof makePost>[0]): Post {
    return makePost({ authorId, kind: 'original', ...partial })
  }

  it('comparePeriods sums current vs prior window', () => {
    const posts = [
      own({
        id: 'cur',
        createdAt: '2026-07-10T12:00:00.000Z',
        metrics: { impressions: 1000, likes: 100, reposts: 10, replies: 5, quotes: 2, bookmarks: 1 },
      }),
      own({
        id: 'prev',
        createdAt: '2026-06-28T12:00:00.000Z',
        metrics: { impressions: 200, likes: 10, reposts: 1, replies: 0, quotes: 0, bookmarks: 0 },
      }),
    ]
    const cmp = comparePeriods(posts, 7, NOW)
    expect(cmp.current.likes).toBe(100)
    expect(cmp.previous.likes).toBe(10)
    expect(cmp.delta.likes).toBe(90)
  })

  it('buildDailySeries buckets by day', () => {
    const posts = [
      own({
        id: 'a',
        createdAt: '2026-07-10T08:00:00.000Z',
        metrics: { impressions: 100, likes: 10, reposts: 0, replies: 0, quotes: 0, bookmarks: 0 },
      }),
      own({
        id: 'b',
        createdAt: '2026-07-10T20:00:00.000Z',
        metrics: { impressions: 50, likes: 5, reposts: 0, replies: 0, quotes: 0, bookmarks: 0 },
      }),
    ]
    const series = buildDailySeries(posts, '30d', 'likes', NOW)
    expect(series).toHaveLength(1)
    expect(series[0].v).toBe(15)
  })

  it('buildGlance and catalysts surface movement', () => {
    const posts = [
      own({
        id: 'star',
        createdAt: '2026-07-11T12:00:00.000Z',
        metrics: { impressions: 5000, likes: 200, reposts: 40, replies: 30, quotes: 10, bookmarks: 5 },
      }),
      own({
        id: 'old',
        createdAt: '2026-06-20T12:00:00.000Z',
        metrics: { impressions: 100, likes: 2, reposts: 0, replies: 0, quotes: 0, bookmarks: 0 },
      }),
    ]
    const glance = buildGlance({ posts, window: '7d', nowMs: NOW, followers: 1000, followersDelta: 50 })
    expect(glance.current.likes).toBeGreaterThan(0)
    expect(glance.followersDelta).toBe(50)

    const cat = buildCatalysts({ posts, window: '7d', nowMs: NOW, followersDelta: 50 })
    expect(cat).not.toBeNull()
    expect(cat!.posts.some((p) => p.id === 'star')).toBe(true)
  })
})

describe('metric snapshots', () => {
  it('appendSnapshot replaces within gap and caps length', () => {
    const posts = [makePost({ metrics: { impressions: 10, likes: 1, reposts: 0, replies: 0, quotes: 0, bookmarks: 0 } })]
    const a = makeSnapshot({ at: '2026-07-01T00:00:00.000Z', followers: 100, posts })
    const b = makeSnapshot({ at: '2026-07-01T01:00:00.000Z', followers: 101, posts })
    const c = makeSnapshot({ at: '2026-07-10T00:00:00.000Z', followers: 150, posts })
    let h = appendSnapshot([], a)
    h = appendSnapshot(h, b) // within 6h → replace
    expect(h).toHaveLength(1)
    expect(h[0].followers).toBe(101)
    h = appendSnapshot(h, c)
    expect(h).toHaveLength(2)
  })

  it('followersDeltaFromHistory computes change over window', () => {
    const posts: Post[] = []
    const history = [
      makeSnapshot({ at: '2026-07-01T00:00:00.000Z', followers: 1000, posts }),
      makeSnapshot({ at: '2026-07-12T00:00:00.000Z', followers: 2000, posts }),
    ]
    const d = followersDeltaFromHistory(history, 11, NOW)
    expect(d).toBe(1000)
  })
})
