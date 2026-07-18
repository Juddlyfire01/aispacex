import type { StyleFeatures, StyleFeaturesReport } from './style-features'

export type { StyleFeatures, StyleFeaturesReport }

/**
 * X affiliation badge — the small org logo X renders beside a member's name
 * when their account is an affiliated member of a Verified Organization
 * (e.g. Erik Voorhees → Venice). This is distinct from the verification
 * checkmark (`verified.type`): the badge is the org's own image
 * (affiliation.badge_url) and links to the parent org account.
 */
export interface Affiliation {
  /** Org badge image URL — the icon shown next to the name (affiliation.badge_url). */
  badgeUrl: string
  /** Org display name from the affiliation payload (e.g. "Venice"), or null. */
  description: string | null
  /** Badge link target — affiliation.url, else the resolved org profile URL. */
  url: string | null
  /** Parent org account, resolved via the affiliation.user_id expansion. */
  org: { id: string; username: string; name: string } | null
}

export interface Profile {
  id: string
  username: string
  displayName: string
  avatarUrl: string
  /** Profile header banner from profile_banner_url. */
  bannerUrl: string | null
  bio: string | null
  /** Parsed URL entities from the bio (for condensed link labels per X display rules). */
  bioUrls: { url: string; expanded: string; display: string; start?: number; end?: number }[]
  /** Profile website link (condensed display + t.co href). */
  website: { href: string; display: string } | null
  location: string | null
  url: string | null
  verified: { legacy: boolean; type: 'blue' | 'business' | 'government' | null }
  /** Parent account for X automated-account label (affiliation.user_id). */
  automatedBy: { username: string } | null
  /**
   * Org affiliation badge (Verified Organization membership), or null.
   * Present when the account is an affiliated member of an org and X ships an
   * `affiliation.badge_url` — the org-logo badge shown next to the name.
   */
  affiliation: Affiliation | null
  metrics: { followers: number; following: number; posts: number; likes: number; listed: number; media: number }
  accountCreated: string  // ISO
  pinnedPostId: string | null
  mostRecentPostId: string | null
  /**
   * Relationship of this profile to the OAuth-connected user (user-context only).
   * Set on profile gather when `connection_status` is requested; null when unknown
   * (demo/app-only, self profile, or field absent).
   */
  connectionStatus: (
    | 'follow_request_received'
    | 'follow_request_sent'
    | 'blocking'
    | 'followed_by'
    | 'following'
    | 'muting'
  )[] | null
  /** Convenience: `connectionStatus` includes `followed_by`. */
  followsYou: boolean | null
  gatheredAt: string      // ISO — when we last fetched this
}

export interface Post {
  id: string
  authorId: string
  /** Handle of the author when known from gather `includes.users`. Absent/empty on legacy rows. */
  authorUsername?: string
  text: string
  lang: string
  createdAt: string
  metrics: { impressions: number; likes: number; reposts: number; replies: number; quotes: number; bookmarks: number }
  kind: 'original' | 'reply' | 'quote' | 'retweet'
  /**
   * Writing format for register / transcript packing.
   * `article` = X Article; `longform` = Premium note_tweet; `post` = standard.
   * Absent on legacy rows — treat as `post`.
   */
  format?: 'post' | 'longform' | 'article'
  /** Article title when format is article. */
  articleTitle?: string
  /** X `in_reply_to_user_id` — who this reply is directed at (when kind is reply). */
  inReplyToUserId?: string | null
  /**
   * Referenced tweets (reply parent / quoted / reposted). `authorId` /
   * `authorUsername` are filled when the gather expansion
   * `referenced_tweets.id.author_id` is present — needed so RT/reply/quote
   * edges resolve to a person instead of a `post:` placeholder.
   */
  referenced: { id: string; type: string; authorId?: string; authorUsername?: string }[]
  urls: { expanded: string; display: string; title?: string }[]
  mentions: { username: string; id: string; start?: number; end?: number }[]
  mediaKeys: string[]
  contextAnnotations: { domain: string; entity: string }[]
  gatheredAt: string
}

export type PostFormat = NonNullable<Post['format']>

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

/**
 * Sentinel context-cap: process every gathered post. Stored instead of a fixed
 * count so the cap stays at MAX as more posts arrive on later gathers.
 */
export const MAX_CONTEXT_CAP = 100_000

/** Pre-MAX default; one-shot store migrate rewrites this to MAX_CONTEXT_CAP. */
export const LEGACY_DEFAULT_CONTEXT_CAP = 80

/** Rewrite the old default (80) to MAX; leave any other user-set value alone. */
export function upgradeLegacyContextCap(cap: number): number {
  return cap === LEGACY_DEFAULT_CONTEXT_CAP ? MAX_CONTEXT_CAP : cap
}

export interface SynthesisSettings {
  contextCap: number    // default MAX_CONTEXT_CAP; fixed 10…postCount when user alters
  temperature: number   // default 0.3, user-adjustable 0.0–1.0
  model: string         // empty until catalog load; legacy venice-uncensored-1-2 auto-upgrades
  /**
   * Ids of prior report snapshots to feed into the next synthesis as prior-
   * analysis context (narrative only). Empty = none. The Profile UI defaults
   * to all prior reports (seeded once when history first appears) and exposes
   * a most-recent-N slider plus optional custom multi-select. When the
   * selection is MAX (every prior), appendReport grows this list as new
   * reports are generated so the cap stays at MAX.
   */
  includedReportIds: string[]
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
  /**
   * LIWC-ish style rates. `overall` mixes formats; `byFormat` keeps articles
   * from warping short-post averages. Never injected raw into Compose.
   */
  styleFeatures: StyleFeaturesReport
  computedAt: string  // ISO
}

/** Fixed register style-sheet slots (no few-shot exemplars). */
export interface RegisterSections {
  cadence: string
  diction: string
  stance: string
  rhetoric: string
  texture: string
  /** How voice flexes across post / thread / article. */
  formatFlex: string
  constraints: string
}

/** LLM interpretation, grounded in ReportAnalytics. */
export interface ReportNarrative {
  executiveSummary: string
  strategicAssessment: string
  themes: { name: string; evidence: string; weight: number }[]
  register: {
    /** One-line voice summary. Legacy reports may only have `description`. */
    summary: string
    sections: RegisterSections
    devices: string[]
    /** @deprecated Legacy field — migrated into `summary` on read. */
    description?: string
  }
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
  /** New inbound mentions of the target gathered since the previous report (total). */
  volumeAddedInbound: number
  /**
   * Of the newly gathered inbound mentions, how many were *created* after the
   * previous report's newest inbound mention — i.e. genuine new attention in the
   * inter-report interval, not historical backfill.
   */
  volumeAddedInboundInInterval: number
  /**
   * Of the newly gathered inbound mentions, how many were *created* on or before
   * the previous report's newest inbound mention — i.e. older mentions the
   * gatherer only now captured (backfill), NOT attention received in the interval.
   */
  volumeAddedInboundBackfilled: number
  dateRangeAdded: { from: string; to: string } | null
  dateRangeAddedOwn: { from: string; to: string } | null
  dateRangeAddedInbound: { from: string; to: string } | null
  /** Timestamp span of the in-interval (genuinely new) inbound mentions. */
  dateRangeAddedInboundInInterval: { from: string; to: string } | null
  /** Timestamp span of the backfilled (historical) inbound mentions. */
  dateRangeAddedInboundBackfilled: { from: string; to: string } | null
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
    tokenCost: number             // total_tokens reported by Venice (exact)
    /** Exact prompt tokens reported by Venice across all calls for this report. */
    promptTokens?: number
    /** Exact completion tokens reported by Venice across all calls for this report. */
    completionTokens?: number
    /** Ids of prior reports that were fed in as context when this was generated. */
    includedReportIds?: string[]
  }
  analytics: ReportAnalytics
  narrative: ReportNarrative
  changeSummary: ChangeSummary | null  // null only for the baseline (first) report
  previousReportId: string | null
}

export const DEFAULT_SYNTHESIS_SETTINGS: SynthesisSettings = {
  contextCap: MAX_CONTEXT_CAP,
  temperature: 0.3,
  // Empty until the live catalog loads — pickSynthesisModel fills it.
  // Do not seed LEGACY_SYNTHESIS_DEFAULT here; that caused a visible flash
  // (uncensored → Grok) on every intel mount.
  model: '',
  includedReportIds: [],
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
  profile_banner_url?: string
  /**
   * Relationship to the authenticated user (user-context only).
   * Includes `followed_by` when they follow you, `following` when you follow them.
   */
  connection_status?: (
    | 'follow_request_received'
    | 'follow_request_sent'
    | 'blocking'
    | 'followed_by'
    | 'following'
    | 'muting'
  )[]
  affiliation?: {
    badge_url?: string
    description?: string
    url?: string
    user_id?: string | string[]
  }
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

export interface XPostEntities {
  urls?: { expanded_url: string; display_url: string; title?: string; start?: number; end?: number }[]
  mentions?: { username: string; id?: string; start?: number; end?: number }[]
}

export interface XPostRaw {
  id: string
  text: string
  author_id?: string
  lang?: string
  created_at?: string
  /** User id this post is replying to (when it is a reply). */
  in_reply_to_user_id?: string
  public_metrics?: {
    impression_count?: number
    like_count: number
    retweet_count: number
    reply_count: number
    quote_count: number
    bookmark_count?: number
  }
  referenced_tweets?: { type: 'replied_to' | 'quoted' | 'retweeted' | 'reposted'; id: string }[]
  entities?: XPostEntities
  /** Full text + entities for long-form posts (>280 chars). Root `text` is truncated. */
  note_tweet?: { text?: string; entities?: XPostEntities }
  /**
   * X Article payload when this post announces/embeds an Article.
   * Shape is lightly documented — we accept several text carriers defensively.
   */
  article?: {
    title?: string
    plain_text?: string
    text?: string
    preview_text?: string
    description?: string
    content_state?: { blocks?: { text?: string; type?: string }[] }
    entities?: XPostEntities
  }
  attachments?: { media_keys?: string[] }
  context_annotations?: { domain: { name: string }; entity: { name: string } }[]
}

export interface XPaginatedResponse<T> {
  data?: T[]
  includes?: { users?: XUserRaw[]; tweets?: XPostRaw[] }
  meta?: { newest_id?: string; oldest_id?: string; result_count: number; next_token?: string }
  errors?: { title: string; detail: string }[]
}

export interface XSingleResponse<T> {
  data?: T
  includes?: { users?: XUserRaw[]; tweets?: XPostRaw[] }
  errors?: { title: string; detail: string }[]
}
