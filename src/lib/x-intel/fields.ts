export const USER_FIELDS = [
  'id', 'name', 'username', 'verified', 'verified_type',
  'description', 'location', 'url', 'profile_image_url', 'profile_banner_url',
  'affiliation', 'pinned_tweet_id', 'most_recent_tweet_id',
  'public_metrics', 'entities', 'created_at',
] as const

export const POST_FIELDS = [
  'id', 'text', 'lang', 'created_at', 'edit_history_tweet_ids',
  // author_id must be a tweet field (not only an expansion) or it stays empty
  // and maxOwnPostId / inbound-vs-own splits cannot tell who wrote the post.
  'author_id',
  'public_metrics', 'context_annotations', 'entities', 'note_tweet',
  'referenced_tweets', 'reply_settings', 'source',
  'possibly_sensitive', 'attachments',
] as const

export const POST_EXPANSIONS = [
  'author_id', 'attachments.media_keys', 'referenced_tweets.id',
  // Needed so RT/reply/quote edges resolve to the referenced author, not a post: placeholder.
  'referenced_tweets.id.author_id',
] as const

export const USER_EXPANSIONS = ['pinned_tweet_id', 'affiliation.user_id'] as const

// Read-operation rate card (USD per returned resource), Feb 2026 pay-per-use
export const COST_PER_POST = 0.005
export const COST_PER_USER = 0.01
export const COST_PER_LIKE = 0.001

// Default target seeded on first successful token connect. The validation
// lookup targets this account, so validating the token also fetches its
// profile in the same request (no extra cost).
export const DEFAULT_TARGET = 'AskVenice'

/** Gratis demo intel target — gatherable without user OAuth via /api/x/demo. */
export function isDemoTarget(username: string): boolean {
  return username.toLowerCase() === DEFAULT_TARGET.toLowerCase()
}

export function canGatherTarget(username: string | null | undefined, connected: boolean): boolean {
  if (!username) return false
  return connected || isDemoTarget(username)
}
