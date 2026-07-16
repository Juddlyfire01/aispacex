export type AlphaRailSource = 'system' | 'user'

export interface AlphaRail {
  id: string
  label: string
  /** X recent-search / counts query string. */
  query: string
  source: AlphaRailSource
  enabled: boolean
}

/** One bucket from tweets/counts/recent. */
export interface CountBucket {
  start: string
  end: string
  tweet_count: number
}

export interface RailCountsCache {
  railId: string
  query: string
  fetchedAt: number
  totalTweetCount: number
  buckets: CountBucket[]
  /** USD estimate for this fetch (operator meter). */
  cost: number
}

export interface VelocityResult {
  /** Last hour vs prior hour (null if insufficient buckets). */
  hourPct: number | null
  /** Last 24h vs prior 24h. */
  dayPct: number | null
  lastHourCount: number
  priorHourCount: number
  lastDayCount: number
  priorDayCount: number
}

export interface AlphaStory {
  id: string
  name: string
  hook?: string
  summary?: string
  category?: string
  updatedAt?: string
  clusterPostIds: string[]
  url?: string
}

/** Last Breaking-on-X-News multi-query scan (UI surface + TTL). */
export interface AlphaNewsScanCache {
  stories: AlphaStory[]
  fetchedAt: number
  /** Operator cost of the scan that produced this cache. */
  cost?: number
}

export interface AlphaPostCard {
  id: string
  text: string
  authorId?: string
  authorUsername?: string
  authorName?: string
  createdAt?: string
  likeCount?: number
  replyCount?: number
  retweetCount?: number
  quoteCount?: number
  impressionCount?: number
  url: string
}

export interface AlphaGrokBriefCache {
  markdown: string
  model: string
  fetchedAt: number
}

export type AlphaBriefKind = 'global' | 'rail'

export interface AlphaColdBrief {
  id: string
  kind: AlphaBriefKind
  railId?: string
  railLabel?: string
  query?: string
  markdown: string
  model: string
  fetchedAt: number
  pinned: boolean
}

export interface AlphaColdStory {
  id: string
  name: string
  hook?: string
  summary?: string
  category?: string
  clusterPostIds: string[]
  url?: string
  fetchedAt: number
  pinned: boolean
}

/** Hydrated post kept in cold archive (AlphaPostCard + archive meta). */
export interface AlphaColdPost extends AlphaPostCard {
  fetchedAt: number
  pinned: boolean
  storyId?: string
  railId?: string
}
