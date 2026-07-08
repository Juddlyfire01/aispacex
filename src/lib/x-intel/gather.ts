import { xapi, type GatherAuth } from './x-client'
import { USER_FIELDS, POST_FIELDS, POST_EXPANSIONS, USER_EXPANSIONS, COST_PER_POST, COST_PER_USER, COST_PER_LIKE } from './fields'
import { normalizeProfile, normalizePost } from './normalize'
import type { Profile, Post, XUserRaw, XPostRaw, XSingleResponse, XPaginatedResponse } from './types'

export type CostKind = 'posts' | 'users' | 'likes'

const RATES: Record<CostKind, number> = {
  posts: COST_PER_POST,
  users: COST_PER_USER,
  likes: COST_PER_LIKE,
}

export function estimateCost(kind: CostKind, count: number): number {
  return RATES[kind] * count
}

export interface GatherResult<T> {
  data: T
  cost: number
}

export async function gatherProfile(username: string, auth: GatherAuth): Promise<GatherResult<Profile>> {
  const resp = await xapi<XSingleResponse<XUserRaw>>(`/users/by/username/${encodeURIComponent(username)}`, {
    'user.fields': USER_FIELDS.join(','),
    expansions: USER_EXPANSIONS.join(','),
  }, auth)
  if (!resp.data) throw new Error(resp.errors?.[0]?.detail ?? `User @${username} not found`)
  return { data: normalizeProfile(resp.data, resp.includes), cost: estimateCost('users', 1) }
}

export async function gatherPosts(
  userId: string,
  auth: GatherAuth,
  opts: { sinceId?: string; maxResults?: number } = {},
): Promise<GatherResult<Post[]>> {
  const params: Record<string, string> = {
    'tweet.fields': POST_FIELDS.join(','),
    expansions: POST_EXPANSIONS.join(','),
    max_results: String(opts.maxResults ?? 50),
  }
  if (opts.sinceId) params.since_id = opts.sinceId

  const resp = await xapi<XPaginatedResponse<XPostRaw>>(`/users/${encodeURIComponent(userId)}/tweets`, params, auth)
  if (!resp.data && resp.errors?.length) {
    throw new Error(resp.errors[0]?.detail ?? 'X API returned errors')
  }
  const posts = (resp.data ?? []).map(normalizePost)
  return { data: posts, cost: estimateCost('posts', posts.length) }
}

export async function gatherMentions(
  userId: string,
  auth: GatherAuth,
  opts: { sinceId?: string; maxResults?: number } = {},
): Promise<GatherResult<Post[]>> {
  const params: Record<string, string> = {
    'tweet.fields': POST_FIELDS.join(','),
    expansions: POST_EXPANSIONS.join(','),
    max_results: String(opts.maxResults ?? 50),
  }
  if (opts.sinceId) params.since_id = opts.sinceId

  const resp = await xapi<XPaginatedResponse<XPostRaw>>(`/users/${encodeURIComponent(userId)}/mentions`, params, auth)
  if (!resp.data && resp.errors?.length) {
    throw new Error(resp.errors[0]?.detail ?? 'X API returned errors')
  }
  const posts = (resp.data ?? []).map(normalizePost)
  return { data: posts, cost: estimateCost('posts', posts.length) }
}

export async function resolveUser(userId: string, auth: GatherAuth): Promise<GatherResult<Profile>> {
  const resp = await xapi<XSingleResponse<XUserRaw>>(`/users/${encodeURIComponent(userId)}`, {
    'user.fields': USER_FIELDS.join(','),
    expansions: USER_EXPANSIONS.join(','),
  }, auth)
  if (!resp.data) throw new Error(resp.errors?.[0]?.detail ?? `User ${userId} not found`)
  return { data: normalizeProfile(resp.data, resp.includes), cost: estimateCost('users', 1) }
}
