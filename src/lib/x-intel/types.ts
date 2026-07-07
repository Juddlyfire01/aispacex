export interface Profile {
  id: string
  username: string
  displayName: string
  avatarUrl: string
  bio: string | null
  /** Parsed URL entities from the bio (for condensed link labels per X display rules). */
  bioUrls: { url: string; expanded: string; display: string; start?: number; end?: number }[]
  /** Profile website link (condensed display + t.co href). */
  website: { href: string; display: string } | null
  location: string | null
  url: string | null
  verified: { legacy: boolean; type: 'blue' | 'business' | 'government' | null }
  metrics: { followers: number; following: number; posts: number; likes: number; listed: number; media: number }
  accountCreated: string  // ISO
  pinnedPostId: string | null
  mostRecentPostId: string | null
  gatheredAt: string      // ISO — when we last fetched this
}

export interface Post {
  id: string
  authorId: string
  text: string
  lang: string
  createdAt: string
  metrics: { impressions: number; likes: number; reposts: number; replies: number; quotes: number; bookmarks: number }
  kind: 'original' | 'reply' | 'quote' | 'retweet'
  referenced: { id: string; type: string }[]
  urls: { expanded: string; display: string; title?: string }[]
  mentions: { username: string; id: string }[]
  mediaKeys: string[]
  contextAnnotations: { domain: string; entity: string }[]
  gatheredAt: string
}

export interface Edge {
  source: string   // target user id
  target: string   // engaged user id (or username-keyed placeholder)
  targetUsername: string
  kind: 'quote' | 'reply' | 'mention' | 'retweet'
  weight: number   // occurrence count across gathered posts
  lastSeen: string
}

export interface CharacterProfile {
  themes: string[]
  register: string
  recurringTopics: { topic: string; postCount: number; lastSeen: string }[]
  postingCadence: { pattern: 'burst' | 'steady'; peakWindowsUtc: string[]; avgPerDay: number; variance: 'high' | 'medium' | 'low' }
  flagshipPost: { postId: string; excerpt: string; metrics: Post['metrics'] }
  synthesizedAt: string  // ISO
  model: string          // which Venice model produced this
}

export interface SynthesisSettings {
  contextCap: number    // default 80, user-adjustable 10–200
  temperature: number   // default 0.3, user-adjustable 0.0–1.0
  model: string         // default 'venice-uncensored-1-2'
}

// ——— Comprehensive Report Ledger ———
//
// A report is a two-layer artifact: `ReportAnalytics` is computed deterministically
// in code (exact, repeatable, never hallucinated) and `ReportNarrative` is the LLM's
// interpretation grounded in those computed facts. Both are frozen into an immutable
// `IntelReportSnapshot` so historical reports never drift when post metrics update.

export type FollowRatioLabel = 'broadcast' | 'conversational' | 'networker'
export type CadencePattern = 'burst' | 'steady'
export type CadenceVariance = 'high' | 'medium' | 'low'
export type PostKind = Post['kind']

/** Summary stats for a single engagement metric across the analyzed post set. */
export interface MetricStats {
  avg: number
  median: number
  max: number
  total: number
}

/** A single ranked count entry (topic, domain, engaged account, …). */
export interface RankedCount {
  label: string
  count: number
}

/** Deterministic, computed facts about a target. Frozen into each snapshot. */
export interface ReportAnalytics {
  fundamentals: {
    accountAgeDays: number
    lifetimeVelocity: number          // lifetime posts / account age (days)
    followers: number
    following: number
    followerFollowingRatio: number
    followRatioLabel: FollowRatioLabel
    listed: number
    pinnedPostId: string | null
  }
  composition: {
    total: number
    byKind: Record<PostKind, number>          // counts
    byKindPct: Record<PostKind, number>        // 0–100
    withMediaPct: number
    withLinkPct: number
    langMix: RankedCount[]                      // language code → count, ranked
  }
  engagement: {
    impressions: MetricStats
    likes: MetricStats
    reposts: MetricStats
    replies: MetricStats
    quotes: MetricStats
    bookmarks: MetricStats
    engagementRate: number      // likes / impressions (0–1), 0 if no impressions
    bookmarkRate: number        // bookmarks / impressions
    amplificationRate: number   // reposts / impressions
    performanceByKind: Record<PostKind, number>  // avg likes per kind
    bestPostId: string | null   // highest likes
    worstPostId: string | null  // lowest likes (among posts with impressions)
    topDecileLikes: number      // 90th percentile likes threshold
  }
  cadence: {
    pattern: CadencePattern
    variance: CadenceVariance
    avgPerDay: number                 // over the actual analyzed span
    spanDays: number
    hourHistogramUtc: number[]        // length 24
    weekdayHistogram: number[]        // length 7, 0 = Sunday
    peakHoursUtc: number[]            // top posting hours
    longestGapHours: number
  }
  topics: {
    domains: RankedCount[]            // from contextAnnotations
    entities: RankedCount[]           // from contextAnnotations
  }
  infoDiet: {
    domains: RankedCount[]            // from post urls (expanded hostnames)
  }
  network: {
    topMentioned: RankedCount[]
    topQuoted: RankedCount[]          // by referenced post id (placeholder-aware)
    topReplied: RankedCount[]
  }
  /** How many posts in the store were own vs inbound at compute time. */
  scope: {
    ownPosts: number
    inboundMentions: number
  }
  computedAt: string  // ISO
}

/** LLM interpretation, grounded in ReportAnalytics. */
export interface ReportNarrative {
  executiveSummary: string
  strategicAssessment: string
  themes: { name: string; evidence: string; weight: number }[]
  register: { description: string; devices: string[] }
  narrativeArcs: { arc: string; trend: string; evidence: string }[]
  audienceRead: string
  contradictions: string[]
  notablePosts: { postId: string; why: string }[]
  engagementHooks: string[]
  analystConclusions: string[]
}

/** Computed + interpreted change since the previous report. Null for baseline. */
export interface ChangeSummary {
  /** Total newly gathered rows (own + inbound). */
  volumeAdded: number
  /** New posts authored by the target since the previous report. */
  volumeAddedOwn: number
  /** New inbound mentions of the target gathered since the previous report. */
  volumeAddedInbound: number
  dateRangeAdded: { from: string; to: string } | null
  dateRangeAddedOwn: { from: string; to: string } | null
  dateRangeAddedInbound: { from: string; to: string } | null
  metricShifts: { metric: string; from: number; to: number; deltaPct: number }[]
  compositionDrift: string[]      // human-readable computed drift lines
  cadenceDrift: string[]
  emergingTopics: string[]
  fadingTopics: string[]
  sustainedTopics: string[]
  networkChanges: { appeared: string[]; disappeared: string[] }
  narrative: string               // LLM interpretation of the above
}

/** An immutable, self-contained intelligence report at a point in time. */
export interface IntelReportSnapshot {
  id: string
  createdAt: string               // ISO
  model: string
  synthesisSettings: SynthesisSettings
  meta: {
    postCount: number
    dateRange: { from: string; to: string } | null
    postIdsAnalyzed: string[]
    tokenCost: number             // total_tokens reported by Venice
  }
  analytics: ReportAnalytics
  narrative: ReportNarrative
  changeSummary: ChangeSummary | null  // null only for the baseline (first) report
  previousReportId: string | null
}

export const DEFAULT_SYNTHESIS_SETTINGS: SynthesisSettings = {
  contextCap: 80,
  temperature: 0.3,
  model: 'venice-uncensored-1-2',
}

// ——— Raw X API v2 shapes (subset we request) ———

export interface XUserRaw {
  id: string
  name: string
  username: string
  verified?: boolean
  verified_type?: 'blue' | 'business' | 'government' | 'none'
  description?: string
  location?: string
  url?: string
  profile_image_url?: string
  pinned_tweet_id?: string
  most_recent_tweet_id?: string
  created_at?: string
  public_metrics?: {
    followers_count: number
    following_count: number
    tweet_count: number
    listed_count: number
    like_count?: number
    media_count?: number
  }
  entities?: {
    description?: {
      urls?: { url: string; expanded_url: string; display_url: string; start?: number; end?: number }[]
    }
    url?: {
      urls?: { url: string; expanded_url: string; display_url: string }[]
    }
  }
}

export interface XPostRaw {
  id: string
  text: string
  author_id?: string
  lang?: string
  created_at?: string
  public_metrics?: {
    impression_count?: number
    like_count: number
    retweet_count: number
    reply_count: number
    quote_count: number
    bookmark_count?: number
  }
  referenced_tweets?: { type: 'replied_to' | 'quoted' | 'retweeted'; id: string }[]
  entities?: {
    urls?: { expanded_url: string; display_url: string; title?: string }[]
    mentions?: { username: string; id?: string }[]
  }
  attachments?: { media_keys?: string[] }
  context_annotations?: { domain: { name: string }; entity: { name: string } }[]
}

export interface XPaginatedResponse<T> {
  data?: T[]
  meta?: { newest_id?: string; oldest_id?: string; result_count: number; next_token?: string }
  errors?: { title: string; detail: string }[]
}

export interface XSingleResponse<T> {
  data?: T
  errors?: { title: string; detail: string }[]
}
