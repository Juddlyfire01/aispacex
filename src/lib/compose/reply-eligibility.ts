// X pay-per-use only allows API replies when the target post *summons* you
// (@mention or quote of your post). Follower relationship is unrelated to that
// gate — we still surface it for UX context when known.
import { selfApi } from '../x-intel/self-client'
import { POST_EXPANSIONS, POST_FIELDS, USER_FIELDS } from '../x-intel/fields'
import { normalizePost } from '../x-intel/normalize'
import type { Post, Profile, XPostRaw, XSingleResponse, XUserRaw } from '../x-intel/types'
import { findReportKey, useXIntelStore } from '../../stores/x-intel-store'
import { useXSelfStore } from '../../stores/x-self-store'

export type ConnectionStatus =
  | 'followed_by'
  | 'following'
  | 'blocking'
  | 'muting'
  | 'follow_request_received'
  | 'follow_request_sent'

export interface SelfIdentity {
  id: string
  username: string
}

/** Active connected account identity, if any. */
export function getActiveSelfIdentity(): SelfIdentity | null {
  const self = useXSelfStore.getState()
  if (!self.activeAccountId) return null
  const account = self.accounts[self.activeAccountId]
  if (!account) return null
  const id = account.profile?.id ?? account.id
  const username = account.profile?.username ?? account.username
  if (!id || !username) return null
  return { id, username }
}

/** Find a post in local self/target intel caches (no network). */
export function findPostLocally(postId: string): Post | null {
  if (!postId) return null

  const self = useXSelfStore.getState()
  for (const account of Object.values(self.accounts)) {
    const hit =
      account.posts.find((p) => p.id === postId) ??
      account.bookmarks.find((p) => p.id === postId) ??
      account.likes.find((p) => p.id === postId)
    if (hit) return hit
  }

  const intel = useXIntelStore.getState()
  for (const username of intel.targets) {
    const key = findReportKey(intel.reports, username)
    const report = key ? intel.reports[key] : undefined
    const hit = report?.posts.find((p) => p.id === postId)
    if (hit) return hit
  }

  return null
}

function usernameMatches(a: string | undefined | null, b: string | undefined | null): boolean {
  if (!a || !b) return false
  return a.replace(/^@/, '').toLowerCase() === b.replace(/^@/, '').toLowerCase()
}

/**
 * True when `post` explicitly summons `me` per X self-serve reply rules:
 * - @mentions me in entities (or bare @handle in text as fallback)
 * - quotes one of my posts (referenced quote author is me)
 */
export function postSummonsUser(post: Post, me: SelfIdentity): boolean {
  const meUser = me.username.replace(/^@/, '')

  for (const m of post.mentions) {
    if (m.id && m.id === me.id) return true
    if (usernameMatches(m.username, meUser)) return true
  }

  // Entity-less gathers: still detect a deliberate @handle in the body.
  const mentionRe = new RegExp(`(?:^|[^A-Za-z0-9_])@${escapeRegExp(meUser)}\\b`, 'i')
  if (mentionRe.test(post.text)) return true

  for (const r of post.referenced) {
    const isQuote = r.type === 'quoted'
    if (!isQuote) continue
    if (r.authorId && r.authorId === me.id) return true
    if (usernameMatches(r.authorUsername, meUser)) return true
  }

  // Quote of a post we already hold as our own (author fields missing on ref).
  if (post.kind === 'quote') {
    const quotedIds = post.referenced.filter((r) => r.type === 'quoted').map((r) => r.id)
    if (quotedIds.length && ownsAnyPost(me, quotedIds)) return true
  }

  return false
}

function ownsAnyPost(me: SelfIdentity, postIds: string[]): boolean {
  const self = useXSelfStore.getState()
  for (const account of Object.values(self.accounts)) {
    const isMe =
      account.id === me.id ||
      account.profile?.id === me.id ||
      usernameMatches(account.username, me.username) ||
      usernameMatches(account.profile?.username, me.username)
    if (!isMe) continue
    if (account.posts.some((p) => postIds.includes(p.id))) return true
  }
  return false
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** Fetch a single post via the user-context proxy (for summon checks). */
export async function fetchPostForReply(postId: string): Promise<Post | null> {
  if (!postId) return null
  try {
    const resp = await selfApi<XSingleResponse<XPostRaw>>(`tweets/${encodeURIComponent(postId)}`, {
      'tweet.fields': POST_FIELDS.join(','),
      expansions: POST_EXPANSIONS.join(','),
      'user.fields': USER_FIELDS.join(','),
    })
    if (!resp.data) return null
    return normalizePost(resp.data, resp.includes)
  } catch {
    return null
  }
}

/**
 * Whether the given user follows the connected account (`followed_by`).
 * Uses user-context `connection_status` on user lookup. Returns null when
 * unknown (disconnected, rate-limited, or field unavailable).
 */
export async function lookupFollowsYou(username: string): Promise<boolean | null> {
  const handle = username.replace(/^@/, '').trim()
  if (!handle) return null
  try {
    const resp = await selfApi<XSingleResponse<XUserRaw>>(
      `users/by/username/${encodeURIComponent(handle)}`,
      {
        'user.fields': [...USER_FIELDS, 'connection_status'].join(','),
      },
    )
    const status = resp.data?.connection_status
    if (!status || !Array.isArray(status)) return null
    return status.includes('followed_by')
  } catch {
    return null
  }
}

/** Resolve whether a reply target is API-eligible (summoned). */
export async function resolveReplySummoned(
  toPostId: string,
  me: SelfIdentity | null,
): Promise<{ summoned: boolean | null; post: Post | null }> {
  if (!me || !toPostId) return { summoned: null, post: null }

  let post = findPostLocally(toPostId)
  if (!post) post = await fetchPostForReply(toPostId)
  if (!post) return { summoned: null, post: null }

  return { summoned: postSummonsUser(post, me), post }
}

/** Profile for the active self account when available. */
export function getActiveSelfProfile(): Profile | null {
  const self = useXSelfStore.getState()
  if (!self.activeAccountId) return null
  return self.accounts[self.activeAccountId]?.profile ?? null
}
