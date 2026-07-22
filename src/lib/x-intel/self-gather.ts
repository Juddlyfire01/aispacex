// Gather the OAuth-connected user's OWN data for the Profile tab. Mirrors
// gather.ts (targets) but sources from /users/me and the user-context-only
// endpoints (bookmarks, likes) that an app-only bearer token cannot reach.
import { selfApi } from './self-client'
import { USER_FIELDS, POST_FIELDS, POST_EXPANSIONS, USER_EXPANSIONS } from './fields'
import { normalizeProfile, normalizePost } from './normalize'
import { estimateCost, billableCount } from './gather'
import { billableXUnits } from './x-dedup-billing'
import { recordCost } from '../../stores/cost-ledger-store'
import type { Profile, Post, XUserRaw, XPostRaw, XSingleResponse, XPaginatedResponse } from './types'

/**
 * Record self-gather X cost into the unified ledger. Per the x402 pricing
 * decision, self ("Owned Read") fetches are billed at the standard "others"
 * published rates — the actual Owned-Read discount ($0.001) is retained as
 * margin. When VITE_X402_PASS_X_DEDUP is on, daily resource dedup is passed
 * through. Best-effort; never throws into the gather flow.
 */
function recordSelfCost(kind: 'posts' | 'users', units: number): void {
  if (units <= 0) return
  try {
    recordCost({
      action: 'self',
      provider: 'x',
      kind,
      units,
      unitPriceUsd: units ? estimateCost(kind, 1) : 0,
      rawUsd: estimateCost(kind, units),
      meta: { self: true },
    })
  } catch {
    /* metering must never break self-gather */
  }
}

/** The connected user's own profile via /users/me (verified identity). */
export async function gatherSelfProfile(): Promise<Profile> {
  const resp = await selfApi<XSingleResponse<XUserRaw>>('users/me', {
    'user.fields': USER_FIELDS.join(','),
    expansions: USER_EXPANSIONS.join(','),
  })
  if (!resp.data) throw new Error(resp.errors?.[0]?.detail ?? 'Could not load your profile')
  const profile = normalizeProfile(resp.data, resp.includes)
  recordSelfCost('users', billableXUnits('users', [profile.id], 1))
  return profile
}

async function gatherSelfPostLike(
  path: string,
  userId: string,
  opts: { maxResults?: number } = {},
): Promise<Post[]> {
  const resp = await selfApi<XPaginatedResponse<XPostRaw>>(path.replace(':id', encodeURIComponent(userId)), {
    'tweet.fields': POST_FIELDS.join(','),
    expansions: POST_EXPANSIONS.join(','),
    max_results: String(opts.maxResults ?? 50),
  })
  if (!resp.data && resp.errors?.length) throw new Error(resp.errors[0]?.detail ?? 'X API returned errors')
  const posts = (resp.data ?? []).map((raw) => normalizePost(raw, resp.includes))
  recordSelfCost(
    'posts',
    billableXUnits(
      'posts',
      posts.map((p) => p.id),
      billableCount(resp.meta, posts.length),
    ),
  )
  return posts
}

/** The connected user's own timeline. */
export function gatherSelfPosts(userId: string, opts: { maxResults?: number } = {}): Promise<Post[]> {
  return gatherSelfPostLike('users/:id/tweets', userId, opts)
}

/**
 * Posts that mention or reply to the connected user (inbound).
 * Powers Feed "Replies" / "Mentions in" — same endpoint targets use via gatherMentions.
 */
export function gatherSelfMentions(userId: string, opts: { maxResults?: number } = {}): Promise<Post[]> {
  return gatherSelfPostLike('users/:id/mentions', userId, opts)
}

/** The connected user's bookmarks — OAuth-only, no target equivalent. */
export function gatherSelfBookmarks(userId: string, opts: { maxResults?: number } = {}): Promise<Post[]> {
  return gatherSelfPostLike('users/:id/bookmarks', userId, opts)
}

/** The connected user's liked posts — authoritatively theirs under user-context. */
export function gatherSelfLikes(userId: string, opts: { maxResults?: number } = {}): Promise<Post[]> {
  return gatherSelfPostLike('users/:id/liked_tweets', userId, opts)
}
