import { describe, it, expect } from 'vitest'
import { computeAnalytics, computeDelta, postDateRange } from './analytics'
import type { Profile, Post, Edge } from './types'

function makeProfile(over: Partial<Profile> = {}): Profile {
  return {
    id: '1',
    username: 'test',
    displayName: 'Test',
    avatarUrl: '',
    bannerUrl: null,
    bio: null,
    bioUrls: [],
    website: null,
    location: null,
    url: null,
    verified: { legacy: false, type: null },
    automatedBy: null,
    metrics: { followers: 10000, following: 100, posts: 2000, likes: 0, listed: 50, media: 0 },
    accountCreated: new Date(Date.now() - 1000 * 86_400_000).toISOString(), // 1000 days old
    pinnedPostId: null,
    mostRecentPostId: null,
    gatheredAt: new Date().toISOString(),
    ...over,
    // Re-assert required nullable fields so Partial<> cannot leave them undefined.
    connectionStatus: over.connectionStatus ?? null,
    followsYou: over.followsYou ?? null,
  }
}

function makePost(over: Partial<Post> = {}): Post {
  return {
    id: Math.random().toString(36).slice(2),
    authorId: '1',
    text: 'hello world',
    lang: 'en',
    createdAt: '2026-07-01T12:00:00Z',
    metrics: { impressions: 1000, likes: 100, reposts: 10, replies: 5, quotes: 2, bookmarks: 20 },
    kind: 'original',
    referenced: [],
    urls: [],
    mentions: [],
    mediaKeys: [],
    contextAnnotations: [],
    gatheredAt: '2026-07-01T12:00:00Z',
    ...over,
  }
}

describe('computeAnalytics', () => {
  it('computes composition percentages exactly', () => {
    const posts = [
      makePost({ id: 'a', kind: 'original' }),
      makePost({ id: 'b', kind: 'original' }),
      makePost({ id: 'c', kind: 'reply' }),
      makePost({ id: 'd', kind: 'quote' }),
    ]
    const a = computeAnalytics(makeProfile(), posts, [])
    expect(a.composition.total).toBe(4)
    expect(a.composition.byKind.original).toBe(2)
    expect(a.composition.byKindPct.original).toBe(50)
    expect(a.composition.byKindPct.reply).toBe(25)
    expect(a.composition.byKindPct.quote).toBe(25)
    expect(a.composition.byKindPct.retweet).toBe(0)
  })

  it('computes engagement stats and rates', () => {
    const posts = [
      makePost({ id: 'a', metrics: { impressions: 1000, likes: 100, reposts: 10, replies: 0, quotes: 0, bookmarks: 50 } }),
      makePost({ id: 'b', metrics: { impressions: 1000, likes: 200, reposts: 30, replies: 0, quotes: 0, bookmarks: 50 } }),
    ]
    const a = computeAnalytics(makeProfile(), posts, [])
    expect(a.engagement.likes.avg).toBe(150)
    expect(a.engagement.likes.max).toBe(200)
    expect(a.engagement.likes.total).toBe(300)
    // engagementRate = totalLikes / totalImpressions = 300 / 2000 = 0.15
    expect(a.engagement.engagementRate).toBe(0.15)
    // bookmarkRate = 100 / 2000 = 0.05
    expect(a.engagement.bookmarkRate).toBe(0.05)
    expect(a.engagement.bestPostId).toBe('b')
  })

  it('derives fundamentals with follow-ratio label', () => {
    const a = computeAnalytics(makeProfile({ metrics: { followers: 73200, following: 3, posts: 2600, likes: 0, listed: 690, media: 0 } }), [makePost()], [])
    expect(a.fundamentals.followRatioLabel).toBe('broadcast')
    expect(a.fundamentals.followers).toBe(73200)
    expect(a.fundamentals.listed).toBe(690)
  })

  it('builds hour and weekday histograms from createdAt', () => {
    const posts = [
      makePost({ id: 'a', createdAt: '2026-07-01T09:00:00Z' }), // Wed 09 UTC
      makePost({ id: 'b', createdAt: '2026-07-01T09:30:00Z' }),
      makePost({ id: 'c', createdAt: '2026-07-02T20:00:00Z' }), // Thu 20 UTC
    ]
    const a = computeAnalytics(makeProfile(), posts, [])
    expect(a.cadence.hourHistogramUtc[9]).toBe(2)
    expect(a.cadence.hourHistogramUtc[20]).toBe(1)
    expect(a.cadence.weekdayHistogram[3]).toBe(2) // Wednesday
    expect(a.cadence.weekdayHistogram[4]).toBe(1) // Thursday
  })

  it('ranks topics from context annotations and info diet from urls', () => {
    const posts = [
      makePost({ id: 'a', contextAnnotations: [{ domain: 'Technology', entity: 'AI' }], urls: [{ expanded: 'https://venice.ai/blog', display: 'venice.ai' }] }),
      makePost({ id: 'b', contextAnnotations: [{ domain: 'Technology', entity: 'AI' }] }),
      makePost({ id: 'c', contextAnnotations: [{ domain: 'Finance', entity: 'Crypto' }] }),
    ]
    const a = computeAnalytics(makeProfile(), posts, [])
    expect(a.topics.entities[0]).toEqual({ label: 'AI', count: 2 })
    expect(a.topics.domains[0]).toEqual({ label: 'Technology', count: 2 })
    expect(a.infoDiet.domains[0]).toEqual({ label: 'venice.ai', count: 1 })
  })

  it('ranks network mentions and quote edges', () => {
    const posts = [
      makePost({ id: 'a', mentions: [{ username: 'erikvoorhees', id: '9' }] }),
      makePost({ id: 'b', mentions: [{ username: 'erikvoorhees', id: '9' }], kind: 'reply' }),
    ]
    const edges: Edge[] = [
      { source: '1', target: 'post:5', targetUsername: 'someone', kind: 'quote', weight: 3, lastSeen: '2026-07-01T00:00:00Z' },
    ]
    const a = computeAnalytics(makeProfile(), posts, edges)
    expect(a.network.topMentioned[0]).toEqual({ label: 'erikvoorhees', count: 2 })
    expect(a.network.topReplied[0]).toEqual({ label: 'erikvoorhees', count: 1 })
    expect(a.network.topQuoted[0]).toEqual({ label: 'someone', count: 3 })
  })

  it('handles empty post set without throwing', () => {
    const a = computeAnalytics(makeProfile(), [], [])
    expect(a.composition.total).toBe(0)
    expect(a.scope.ownPosts).toBe(0)
    expect(a.scope.inboundMentions).toBe(0)
    expect(a.engagement.engagementRate).toBe(0)
    expect(a.engagement.bestPostId).toBeNull()
    expect(a.cadence.avgPerDay).toBe(0)
  })

  it('excludes inbound mentions from posting metrics', () => {
    const profile = makeProfile()
    const own = [makePost({ id: 'a', authorId: '1', kind: 'original' })]
    const inbound = [
      makePost({ id: 'm1', authorId: '99', kind: 'reply', createdAt: '2026-07-07T08:00:00Z' }),
      makePost({ id: 'm2', authorId: '99', kind: 'reply', createdAt: '2026-07-07T09:00:00Z' }),
    ]
    const a = computeAnalytics(profile, [...own, ...inbound], [])
    expect(a.composition.total).toBe(1)
    expect(a.composition.byKindPct.reply).toBe(0)
    expect(a.scope.ownPosts).toBe(1)
    expect(a.scope.inboundMentions).toBe(2)
  })
})

describe('postDateRange', () => {
  it('returns oldest and newest ISO timestamps', () => {
    const range = postDateRange([
      makePost({ createdAt: '2026-07-01T00:00:00Z' }),
      makePost({ createdAt: '2026-07-05T00:00:00Z' }),
      makePost({ createdAt: '2026-07-03T00:00:00Z' }),
    ])
    expect(range).toEqual({ from: '2026-07-01T00:00:00.000Z', to: '2026-07-05T00:00:00.000Z' })
  })

  it('returns null for empty', () => {
    expect(postDateRange([])).toBeNull()
  })
})

describe('computeDelta', () => {
  it('computes volume, metric shifts, and topic diffs between two analytics', () => {
    const profile = makeProfile()
    const prevPosts = [
      makePost({ id: 'a', metrics: { impressions: 1000, likes: 100, reposts: 10, replies: 0, quotes: 0, bookmarks: 10 }, contextAnnotations: [{ domain: 'Tech', entity: 'AI' }] }),
    ]
    const currPosts = [
      ...prevPosts,
      makePost({ id: 'b', metrics: { impressions: 1000, likes: 300, reposts: 10, replies: 0, quotes: 0, bookmarks: 10 }, contextAnnotations: [{ domain: 'Finance', entity: 'DIEM' }] }),
    ]
    const prev = computeAnalytics(profile, prevPosts, [])
    const curr = computeAnalytics(profile, currPosts, [])
    const delta = computeDelta(prev, curr, [makePost({ id: 'b' })], [])

    expect(delta.volumeAdded).toBe(1)
    expect(delta.volumeAddedOwn).toBe(1)
    expect(delta.volumeAddedInbound).toBe(0)
    expect(delta.emergingTopics).toContain('DIEM')
    expect(delta.sustainedTopics).toContain('AI')
    // avgLikes moved 100 -> 200 = +100%
    const avgLikes = delta.metricShifts.find((m) => m.metric === 'avgLikes')
    expect(avgLikes?.deltaPct).toBe(100)
  })

  it('splits newly gathered own posts vs inbound mentions', () => {
    const profile = makeProfile()
    const prev = computeAnalytics(profile, [makePost({ id: 'a' })], [])
    const curr = computeAnalytics(profile, [
      makePost({ id: 'a' }),
      makePost({ id: 'b' }),
      makePost({ id: 'm', authorId: '99' }),
    ], [])
    const delta = computeDelta(prev, curr, [makePost({ id: 'b' })], [makePost({ id: 'm', authorId: '99' })])
    expect(delta.volumeAdded).toBe(2)
    expect(delta.volumeAddedOwn).toBe(1)
    expect(delta.volumeAddedInbound).toBe(1)
  })

  it('flags cadence pattern change', () => {
    const profile = makeProfile()
    const steadyPosts = Array.from({ length: 5 }, (_, i) =>
      makePost({ id: `s${i}`, createdAt: new Date(Date.parse('2026-07-01T00:00:00Z') + i * 86_400_000).toISOString() }),
    )
    const burstPosts = [
      makePost({ id: 'x0', createdAt: '2026-07-01T00:00:00Z' }),
      makePost({ id: 'x1', createdAt: '2026-07-01T00:01:00Z' }),
      makePost({ id: 'x2', createdAt: '2026-07-01T00:02:00Z' }),
      makePost({ id: 'x3', createdAt: '2026-07-30T00:00:00Z' }),
    ]
    const prev = computeAnalytics(profile, steadyPosts, [])
    const curr = computeAnalytics(profile, burstPosts, [])
    const delta = computeDelta(prev, curr, [], [])
    expect(prev.cadence.pattern).toBe('steady')
    expect(curr.cadence.pattern).toBe('burst')
    expect(delta.cadenceDrift.some((d) => d.includes('rhythm'))).toBe(true)
  })
})