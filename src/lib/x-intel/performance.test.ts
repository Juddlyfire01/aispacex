import { describe, it, expect } from 'vitest'
import { makePost, makeProfile } from '../intel-library/test-fixtures'
import {
  filterPostsByWindow,
  postEngagementRate,
  postAmplification,
  scorePost,
  buildTopPosts,
  medianOf,
  percentileAsc,
  likesFloor,
  PERF_TOP_LIST_CAP,
  formatWhy,
  amplifiersForPost,
  buildGlance,
  buildPatterns,
  MODE_LABEL,
  type PerformanceWindow,
} from './performance'
import type { Post } from './types'

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

describe('stats helpers', () => {
  it('median and p75', () => {
    expect(medianOf([1, 2, 3, 4])).toBe(2.5)
    expect(percentileAsc([1, 2, 3, 4], 75)).toBe(3)
  })
})

describe('likesFloor', () => {
  it('scales with followers and clamps', () => {
    expect(likesFloor(0)).toBe(5)
    expect(likesFloor(10_000)).toBe(10)
    expect(likesFloor(1_000_000)).toBe(50)
  })
})

describe('scorePost + eligibility + buildTopPosts', () => {
  const authorId = 'user-1'
  const profile = makeProfile('alice')
  profile.id = authorId
  profile.metrics.followers = 10_000

  function own(partial: Parameters<typeof makePost>[0]): Post {
    return makePost({ authorId, kind: 'original', ...partial })
  }

  it('excludes zero-impression posts from engagement_rate ranking set', () => {
    const posts = [
      own({ id: 'a', metrics: { impressions: 0, likes: 100 } }),
      own({ id: 'b', metrics: { impressions: 1000, likes: 50, reposts: 10, replies: 5, quotes: 5 } }),
    ]
    const result = buildTopPosts({
      posts,
      profile,
      window: 'all',
      mode: 'engagement_rate',
      nowMs: NOW,
    })
    expect(result.scored.map((s) => s.post.id)).toEqual(['b'])
  })

  it('marks eligible vs below-threshold fill when fewer than 3 clear tops', () => {
    const posts = [
      own({
        id: 'star',
        metrics: { impressions: 10_000, likes: 500, reposts: 80, replies: 40, quotes: 20 },
      }),
      own({
        id: 'ok',
        metrics: { impressions: 2000, likes: 20, reposts: 1, replies: 1, quotes: 0 },
      }),
      own({
        id: 'meh',
        metrics: { impressions: 1500, likes: 8, reposts: 0, replies: 0, quotes: 0 },
      }),
    ]
    const result = buildTopPosts({
      posts,
      profile,
      window: 'all',
      mode: 'likes',
      nowMs: NOW,
    })
    expect(result.items[0].post.id).toBe('star')
    expect(result.items.length).toBeGreaterThanOrEqual(1)
    expect(result.items.length).toBeLessThanOrEqual(PERF_TOP_LIST_CAP)
    const fills = result.items.filter((i) => i.belowThreshold)
    expect(fills.every((i) => i.post.id !== 'star')).toBe(true)
  })

  it('composite uses weighted normalized terms', () => {
    const posts = [
      own({ id: '1', metrics: { impressions: 1000, likes: 100, reposts: 10, quotes: 10, replies: 0 } }),
      own({ id: '2', metrics: { impressions: 1000, likes: 10, reposts: 1, quotes: 0, replies: 0 } }),
    ]
    const s1 = scorePost(posts[0], 'composite', { rateMed: 0.05, ampMed: 5, likesMed: 20 })
    const s2 = scorePost(posts[1], 'composite', { rateMed: 0.05, ampMed: 5, likesMed: 20 })
    expect(s1).toBeGreaterThan(s2)
  })
})

describe('formatWhy', () => {
  it('mentions multiple and floor for eligible likes mode', () => {
    const text = formatWhy({
      mode: 'likes',
      multipleOfMedian: 3.2,
      belowThreshold: false,
    })
    expect(text.toLowerCase()).toContain('3.2')
    expect(text.toLowerCase()).toMatch(/median|likes/)
  })

  it('marks below-threshold fills', () => {
    expect(formatWhy({ mode: 'likes', multipleOfMedian: 0.8, belowThreshold: true }).toLowerCase()).toMatch(
      /below|threshold|near/,
    )
  })
})

describe('amplifiersForPost', () => {
  it('returns up to 3 inbound quote/RT author handles for this post id', () => {
    const inbound = [
      makePost({
        id: 'in1',
        authorId: 'u2',
        authorUsername: 'bob',
        referenced: [{ id: 'star', type: 'quoted', authorId: 'user-1' }],
      }),
      makePost({
        id: 'in2',
        authorId: 'u3',
        authorUsername: 'cara',
        referenced: [{ id: 'star', type: 'retweeted', authorId: 'user-1' }],
      }),
      makePost({
        id: 'in3',
        authorId: 'u4',
        authorUsername: 'dan',
        referenced: [{ id: 'other', type: 'quoted', authorId: 'user-1' }],
      }),
    ]
    expect(amplifiersForPost('star', inbound)).toEqual(['bob', 'cara'])
  })
})

describe('glance + patterns', () => {
  it('builds glance KPIs and leading kind', () => {
    const profile = makeProfile('alice')
    profile.id = 'user-1'
    profile.metrics.followers = 10_000
    const posts = [
      makePost({
        id: '1',
        authorId: 'user-1',
        kind: 'original',
        metrics: { impressions: 5000, likes: 200, reposts: 40, replies: 10, quotes: 10 },
      }),
      makePost({
        id: '2',
        authorId: 'user-1',
        kind: 'reply',
        metrics: { impressions: 800, likes: 5, reposts: 0, replies: 1, quotes: 0 },
      }),
    ]
    const top = buildTopPosts({ posts, profile, window: 'all', mode: 'composite', nowMs: NOW })
    const glance = buildGlance(top)
    expect(glance.topPostCount).toBe(top.eligibleCount)
    expect(glance.engagementRate).toBeGreaterThan(0)
    expect(['original', 'reply', 'quote', 'retweet']).toContain(glance.leadingKind)

    const patterns = buildPatterns(top.candidates, top.mode, {
      rateMed: 0.05,
      ampMed: 5,
      likesMed: 20,
    })
    expect(patterns.byKind.length).toBe(4)
    expect(patterns.examples.length).toBeGreaterThanOrEqual(1)
    expect(patterns.caption.length).toBeGreaterThan(0)
  })
})
