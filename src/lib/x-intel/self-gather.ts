// Gather the OAuth-connected user's OWN data for the Profile tab. Mirrors
// gather.ts (targets) but sources from /users/me and the user-context-only
// endpoints (bookmarks, likes) that an app-only bearer token cannot reach.
import { selfApi } from './self-client'
import { USER_FIELDS, POST_FIELDS, POST_EXPANSIONS } from './fields'
import { normalizeProfile, normalizePost } from './normalize'
import type { Profile, Post, XUserRaw, XPostRaw, XSingleResponse, XPaginatedResponse } from './types'

/** The connected user's own profile via /users/me (verified identity). */
export async function gatherSelfProfile(): Promise<Profile> {
  const resp = await selfApi<XSingleResponse<XUserRaw>>('users/me', {
    'user.fields': USER_FIELDS.join(','),
  })
  if (!resp.data) throw new Error(resp.errors?.[0]?.detail ?? 'Could not load your profile')
  return normalizeProfile(resp.data)
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
  return (resp.data ?? []).map(normalizePost)
}

/** The connected user's own timeline. */
export function gatherSelfPosts(userId: string, opts: { maxResults?: number } = {}): Promise<Post[]> {
  return gatherSelfPostLike('users/:id/tweets', userId, opts)
}

/** The connected user's bookmarks — OAuth-only, no target equivalent. */
export function gatherSelfBookmarks(userId: string, opts: { maxResults?: number } = {}): Promise<Post[]> {
  return gatherSelfPostLike('users/:id/bookmarks', userId, opts)
}

/** The connected user's liked posts — authoritatively theirs under user-context. */
export function gatherSelfLikes(userId: string, opts: { maxResults?: number } = {}): Promise<Post[]> {
  return gatherSelfPostLike('users/:id/liked_tweets', userId, opts)
}
