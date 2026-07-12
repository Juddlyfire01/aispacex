import type { Edge, IntelReportSnapshot, Post, Profile } from '../x-intel/types'
import type { IntelSnapshot, LibrarySubject } from './types'

const GATHERED = '2026-07-08T12:00:00.000Z'

export function makePost(
  partial: Partial<Omit<Post, 'metrics'>> & { metrics?: Partial<Post['metrics']> } = {},
): Post {
  const { metrics: metricsOver, ...rest } = partial
  return {
    id: 'post-1',
    authorId: 'user-1',
    text: 'hello world',
    lang: 'en',
    createdAt: '2026-07-01T12:00:00.000Z',
    metrics: {
      impressions: 100,
      likes: 10,
      reposts: 1,
      replies: 0,
      quotes: 0,
      bookmarks: 2,
      ...metricsOver,
    },
    kind: 'original',
    referenced: [],
    urls: [],
    mentions: [],
    mediaKeys: [],
    contextAnnotations: [],
    gatheredAt: GATHERED,
    ...rest,
  }
}

export function makeProfile(username: string, bio?: string): Profile {
  const handle = username.replace(/^@/, '')
  return {
    id: `id_${handle}`,
    username: handle,
    displayName: handle,
    avatarUrl: '',
    bannerUrl: null,
    bio: bio ?? null,
    bioUrls: [],
    website: null,
    location: null,
    url: null,
    verified: { legacy: false, type: null },
    automatedBy: null,
    metrics: { followers: 1000, following: 100, posts: 50, likes: 0, listed: 10, media: 0 },
    accountCreated: '2020-01-01T00:00:00.000Z',
    pinnedPostId: null,
    mostRecentPostId: null,
    connectionStatus: null,
    followsYou: null,
    gatheredAt: GATHERED,
  }
}

export function makeReport(id: string, summary: string): IntelReportSnapshot {
  return {
    id,
    createdAt: GATHERED,
    model: 'venice-uncensored-1-2',
    synthesisSettings: {
      contextCap: 80,
      temperature: 0.3,
      model: 'venice-uncensored-1-2',
      includedReportIds: [],
    },
    meta: {
      postCount: 1,
      dateRange: null,
      postIdsAnalyzed: [],
      tokenCost: 100,
    },
    analytics: {
      fundamentals: {
        accountAgeDays: 100,
        lifetimeVelocity: 1,
        followers: 1000,
        following: 100,
        followerFollowingRatio: 10,
        followRatioLabel: 'broadcast',
        listed: 10,
        pinnedPostId: null,
      },
      composition: {
        total: 0,
        byKind: { original: 0, reply: 0, quote: 0, retweet: 0 },
        byKindPct: { original: 0, reply: 0, quote: 0, retweet: 0 },
        withMediaPct: 0,
        withLinkPct: 0,
        langMix: [],
      },
      engagement: {
        impressions: { avg: 0, median: 0, max: 0, total: 0 },
        likes: { avg: 0, median: 0, max: 0, total: 0 },
        reposts: { avg: 0, median: 0, max: 0, total: 0 },
        replies: { avg: 0, median: 0, max: 0, total: 0 },
        quotes: { avg: 0, median: 0, max: 0, total: 0 },
        bookmarks: { avg: 0, median: 0, max: 0, total: 0 },
        engagementRate: 0,
        bookmarkRate: 0,
        amplificationRate: 0,
        performanceByKind: { original: 0, reply: 0, quote: 0, retweet: 0 },
        bestPostId: null,
        worstPostId: null,
        topDecileLikes: 0,
      },
      cadence: {
        pattern: 'steady',
        variance: 'low',
        avgPerDay: 0,
        spanDays: 0,
        hourHistogramUtc: Array(24).fill(0),
        weekdayHistogram: Array(7).fill(0),
        peakHoursUtc: [],
        longestGapHours: 0,
      },
      topics: { domains: [], entities: [] },
      infoDiet: { domains: [] },
      network: { topMentioned: [], topQuoted: [], topReplied: [] },
      scope: { ownPosts: 0, inboundMentions: 0 },
      computedAt: GATHERED,
    },
    narrative: {
      executiveSummary: summary,
      strategicAssessment: 'Baseline assessment for fixture report.',
      themes: [],
      register: { description: '', devices: [] },
      narrativeArcs: [],
      audienceRead: '',
      contradictions: [],
      notablePosts: [],
      engagementHooks: [],
      analystConclusions: [],
    },
    changeSummary: null,
    previousReportId: null,
  }
}

export function makeSubject(
  partial: Partial<LibrarySubject> & Pick<LibrarySubject, 'kind' | 'id' | 'username'>,
): LibrarySubject {
  return {
    profile: null,
    posts: [],
    bookmarks: [],
    likes: [],
    edges: [],
    reports: [],
    ...partial,
  }
}

export function sampleSnapshot(): IntelSnapshot {
  const meProfile = makeProfile('me_user', 'Builder and staker')
  meProfile.displayName = 'Me User'
  meProfile.metrics = { followers: 500, following: 200, posts: 100, likes: 50, listed: 5, media: 10 }

  const avProfile = makeProfile('AskVenice', 'Privacy-first AI on Venice')
  avProfile.displayName = 'Ask Venice'
  avProfile.metrics = { followers: 12000, following: 50, posts: 800, likes: 0, listed: 100, media: 20 }

  const edge: Edge = {
    source: avProfile.id,
    target: 'id_gekko_eth',
    targetUsername: 'gekko_eth',
    kind: 'mention',
    weight: 3,
    lastSeen: GATHERED,
  }

  return {
    subjects: [
      makeSubject({
        kind: 'self',
        id: meProfile.id,
        username: 'me_user',
        profile: meProfile,
        posts: [
          makePost({
            id: 'p1',
            authorId: meProfile.id,
            text: 'Staking VVV for private inference credits',
            createdAt: '2026-07-05T10:00:00.000Z',
            metrics: { impressions: 500, likes: 42, reposts: 5, replies: 3, quotes: 1, bookmarks: 8 },
          }),
          makePost({
            id: 'p-old',
            authorId: meProfile.id,
            text: 'My cats are the best',
            createdAt: '2025-01-15T08:00:00.000Z',
            metrics: { impressions: 50, likes: 3, reposts: 0, replies: 1, quotes: 0, bookmarks: 0 },
          }),
        ],
        bookmarks: [
          makePost({
            id: 'b1',
            authorId: 'other',
            text: 'Why privacy matters for AI agents',
            createdAt: '2026-06-20T14:00:00.000Z',
          }),
        ],
        reports: [makeReport('r-me', 'Self account focuses on staking and builder notes.')],
        refreshedAt: GATHERED,
      }),
      makeSubject({
        kind: 'target',
        id: avProfile.id,
        username: 'AskVenice',
        profile: avProfile,
        posts: [
          makePost({
            id: 't1',
            authorId: avProfile.id,
            text: 'Venice privacy AI — uncensored inference for everyone',
            createdAt: '2026-07-06T09:00:00.000Z',
            metrics: { impressions: 5000, likes: 200, reposts: 40, replies: 15, quotes: 8, bookmarks: 60 },
          }),
          makePost({
            id: 't2',
            authorId: avProfile.id,
            text: 'DIEM minting unlocks dedicated compute',
            createdAt: '2026-07-02T11:00:00.000Z',
            metrics: { impressions: 3000, likes: 150, reposts: 25, replies: 10, quotes: 5, bookmarks: 40 },
          }),
        ],
        edges: [edge],
        reports: [makeReport('r-av', 'AskVenice pushes private inference and DIEM.')],
        refreshedAt: GATHERED,
      }),
    ],
  }
}
