// Types for the Signal tab — VeniceStats buzz / social endpoints.
// Shapes verified against the live API (2026-07).

export type BuzzItemType = 'tweet' | 'article' | 'video'

export interface BuzzItem {
  id: number
  sourceId: string
  type: BuzzItemType
  title: string
  url: string
  summary: string | null
  thumbnailUrl: string | null
  authorName: string | null
  authorHandle: string | null
  sourceName: string | null
  videoId: string | null
  tweetId: string | null
  likeCount: number
  retweetCount: number
  publishedAt: string
  discoveredAt: string
  tier: string
}

export interface BuzzResponse {
  items: BuzzItem[]
  total: number
}

export interface TopAuthor {
  handle: string
  count: number
  totalLikes: number
  totalViews: number
  avgViews: number
  totalReplies: number
  totalBookmarks: number
  buzzScore: number
}

export interface BuzzWeekPoint {
  t: number
  v: number
}

export interface BuzzBreakdownPoint {
  t: number
  likes: number
  rts: number
  replies: number
  bookmarks: number
}

/**
 * NOTE: the *ByWeek series always span all-time regardless of the `weeks`
 * query param — slice client-side. The trailing week is partial; exclude it
 * from week-over-week deltas.
 */
export interface BuzzMetrics {
  totalMentions: number
  avgEngagement: number
  uniqueAuthors: number
  totalViews: number
  engagementRate: number
  trendPct: number | null
  mentionsByWeek: BuzzWeekPoint[]
  engagementByWeek: BuzzWeekPoint[]
  viewsByWeek: BuzzWeekPoint[]
  breakdownByWeek: BuzzBreakdownPoint[]
  topAuthors: TopAuthor[]
  granularity: string
  period: string
}

export interface SocialMetrics {
  twitterFollowers: number | null
  erikFollowers: number | null
  watchlistUsers: number | null
  sentimentUpPct: number | null
  marketCapRank: number | null
  diemWatchlistUsers: number | null
  diemSentimentUpPct: number | null
  diemMarketCapRank: number | null
  socialVolume: number | null
  socialVolumeTwitter: number | null
  socialVolumeReddit: number | null
  socialVolumeTelegram: number | null
  socialDominance: number | null
  sentimentBalance: number | null
  lastUpdated: string | null
}
