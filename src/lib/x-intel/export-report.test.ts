import { describe, it, expect } from 'vitest'
import { reportFilename, reportToJson, reportToMarkdown } from './export-report'
import type { IntelReportSnapshot } from './types'

const snapshot: IntelReportSnapshot = {
  id: 'rpt-1',
  createdAt: '2026-07-08T12:00:00.000Z',
  model: 'venice-uncensored-1-2',
  synthesisSettings: { contextCap: 80, temperature: 0.3, model: 'venice-uncensored-1-2', includedReportIds: [] },
  meta: {
    postCount: 2,
    dateRange: { from: '2026-06-01T00:00:00.000Z', to: '2026-07-01T00:00:00.000Z' },
    postIdsAnalyzed: ['1234567890123456789'],
    tokenCost: 1200,
    promptTokens: 800,
    completionTokens: 400,
  },
  analytics: {
    fundamentals: {
      accountAgeDays: 100,
      lifetimeVelocity: 1.2,
      followers: 1000,
      following: 500,
      followerFollowingRatio: 2,
      followRatioLabel: 'broadcast',
      listed: 42,
      pinnedPostId: null,
    },
    engagement: {
      engagementRate: 0.05,
      bookmarkRate: 0.01,
      amplificationRate: 0.02,
      impressions: { avg: 100, median: 80, max: 500, total: 200 },
      likes: { avg: 5, median: 4, max: 20, total: 10 },
      replies: { avg: 1, median: 1, max: 3, total: 2 },
      quotes: { avg: 0.5, median: 0, max: 2, total: 1 },
      reposts: { avg: 1, median: 1, max: 4, total: 2 },
      bookmarks: { avg: 0.5, median: 0, max: 2, total: 1 },
      performanceByKind: { original: 5, reply: 2, quote: 1, retweet: 0 },
      bestPostId: '1234567890123456789',
      worstPostId: null,
      topDecileLikes: 15,
    },
    composition: {
      total: 2,
      byKind: { original: 2, reply: 0, quote: 0, retweet: 0 },
      byKindPct: { original: 80, reply: 10, quote: 5, retweet: 5 },
      withMediaPct: 20,
      withLinkPct: 10,
      langMix: [],
    },
    cadence: {
      pattern: 'steady',
      variance: 'low',
      avgPerDay: 1,
      spanDays: 30,
      hourHistogramUtc: Array(24).fill(0),
      weekdayHistogram: Array(7).fill(0),
      peakHoursUtc: [14],
      longestGapHours: 48,
    },
    topics: { domains: [], entities: [{ label: 'AI', count: 2 }] },
    infoDiet: { domains: [{ label: 'example.com', count: 1 }] },
    network: {
      topMentioned: [{ label: 'venice_ai', count: 1 }],
      topQuoted: [],
      topReplied: [],
    },
    scope: { ownPosts: 2, inboundMentions: 0 },
    computedAt: '2026-07-08T12:00:00.000Z',
  },
  narrative: {
    executiveSummary: 'markdown: A focused builder account.',
    strategicAssessment: 'Pushes product launches.',
    themes: [{ name: 'Product', evidence: 'Launch cadence is steady.', weight: 0.8 }],
    register: { description: 'Direct', devices: ['CTA'] },
    narrativeArcs: [],
    audienceRead: 'Developers',
    contradictions: [],
    notablePosts: [{ postId: '1234567890123456789', why: 'Top engagement' }],
    engagementHooks: ['Product demos'],
    analystConclusions: ['Consistent messaging'],
  },
  changeSummary: null,
  previousReportId: null,
}

describe('reportFilename', () => {
  it('slugifies username and date', () => {
    expect(reportFilename('AskVenice', '2026-07-08T12:00:00.000Z', 'md')).toBe('intel-report-askvenice-2026-07-08.md')
  })
})

describe('reportToMarkdown', () => {
  it('includes header, analytics, narrative, and cited posts', () => {
    const md = reportToMarkdown(snapshot, {
      username: 'askvenice',
      profile: {
        id: '1',
        username: 'askvenice',
        displayName: 'Ask Venice',
        avatarUrl: '',
        bannerUrl: null,
        bio: 'Privacy AI',
        bioUrls: [],
        website: null,
        location: null,
        url: null,
        verified: { legacy: false, type: null },
        automatedBy: null,
        metrics: { followers: 1, following: 1, posts: 1, likes: 1, listed: 1, media: 0 },
        accountCreated: '2020-01-01T00:00:00.000Z',
        pinnedPostId: null,
        mostRecentPostId: null,
        connectionStatus: null,
        followsYou: null,
        gatheredAt: '2026-07-08T12:00:00.000Z',
      },
      posts: [{
        id: '1234567890123456789',
        authorId: '1',
        text: 'Hello world',
        lang: 'en',
        createdAt: '2026-07-01T00:00:00.000Z',
        metrics: { impressions: 100, likes: 10, reposts: 1, replies: 1, quotes: 0, bookmarks: 0 },
        kind: 'original',
        referenced: [],
        urls: [],
        mentions: [],
        mediaKeys: [],
        contextAnnotations: [],
        gatheredAt: '2026-07-08T12:00:00.000Z',
      }],
    })

    expect(md).toContain('# Intelligence report — @askvenice')
    expect(md).toContain('**Ask Venice**')
    expect(md).toContain('## Executive summary')
    expect(md).toContain('A focused builder account.')
    expect(md).not.toContain('markdown:')
    expect(md).toContain('### Top topics')
    expect(md).toContain('## Cited posts')
    expect(md).toContain('Hello world')
    expect(md).toContain('x.com/i/status/1234567890123456789')
  })
})

describe('reportToJson', () => {
  it('bundles snapshot and cited posts', () => {
    const json = JSON.parse(reportToJson(snapshot, {
      username: 'askvenice',
      posts: [{
        id: '1234567890123456789',
        authorId: '1',
        text: 'Hello world',
        lang: 'en',
        createdAt: '2026-07-01T00:00:00.000Z',
        metrics: { impressions: 100, likes: 10, reposts: 1, replies: 1, quotes: 0, bookmarks: 0 },
        kind: 'original',
        referenced: [],
        urls: [],
        mentions: [],
        mediaKeys: [],
        contextAnnotations: [],
        gatheredAt: '2026-07-08T12:00:00.000Z',
      }],
    }))

    expect(json.username).toBe('askvenice')
    expect(json.snapshot.id).toBe('rpt-1')
    expect(json.citedPosts).toHaveLength(1)
  })
})
