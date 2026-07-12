import type { Post } from './types'

/**
 * Pure repost shell (not a quote with commentary).
 * True when:
 * - `kind === 'retweet'`, or
 * - any referenced entry is retweeted/reposted (covers library rows mis-normalized
 *   as `original` when X returned `reposted` before KIND_MAP knew that type), or
 * - body still has the classic `RT @handle:` prefix (legacy / incomplete refs).
 *
 * Performance must exclude these — X copies the original's public_metrics onto
 * the shell, so ranking/summing them credits viral others as this account's work.
 */
export function isPureRetweet(post: Post): boolean {
  if (post.kind === 'retweet') return true
  if (post.referenced.some((r) => r.type === 'retweeted' || r.type === 'reposted')) {
    return true
  }
  // Classic RT attribution line when refs/kind were lost or never written.
  return /^RT\s+@\w/i.test((post.text || '').trim())
}
