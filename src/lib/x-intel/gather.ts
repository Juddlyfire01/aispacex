import { xapi, type GatherAuth } from './x-client'
import { USER_FIELDS, POST_FIELDS, POST_EXPANSIONS, USER_EXPANSIONS, COST_PER_POST, COST_PER_USER, COST_PER_LIKE } from './fields'
import { normalizeProfile, normalizePost } from './normalize'
import { billableXUnits } from './x-dedup-billing'
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

/**
 * Billable resource count for a paginated X response. X charges per resource
 * RETURNED, which it reports authoritatively in `meta.result_count`. Prefer it
 * over the normalized array length (which can drift when rows are dropped or
 * deduped during normalization). Falls back to the array length, then 0.
 */
export function billableCount(
  meta: { result_count?: number } | undefined,
  fallbackLength: number,
): number {
  const rc = meta?.result_count
  if (typeof rc === 'number' && Number.isFinite(rc) && rc >= 0) return rc
  return Math.max(0, fallbackLength)
}

export interface GatherResult<T> {
  data: T
  cost: number
  /** Billable resource count (for unified-ledger unit pricing). */
  units?: number
  /** Cost kind for ledger classification. */
  kind?: CostKind
}

export async function gatherProfile(username: string, auth: GatherAuth): Promise<GatherResult<Profile>> {
  const resp = await xapi<XSingleResponse<XUserRaw>>(`/users/by/username/${encodeURIComponent(username)}`, {
    'user.fields': USER_FIELDS.join(','),
    expansions: USER_EXPANSIONS.join(','),
  }, auth)
  if (!resp.data) throw new Error(resp.errors?.[0]?.detail ?? `User @${username} not found`)
  const profile = normalizeProfile(resp.data, resp.includes)
  const units = billableXUnits('users', [profile.id], 1)
  return { data: profile, cost: estimateCost('users', units), units, kind: 'users' }
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
  const posts = (resp.data ?? []).map((raw) => normalizePost(raw, resp.includes))
  const units = billableXUnits(
    'posts',
    posts.map((p) => p.id),
    billableCount(resp.meta, posts.length),
  )
  return { data: posts, cost: estimateCost('posts', units), units, kind: 'posts' }
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
  const posts = (resp.data ?? []).map((raw) => normalizePost(raw, resp.includes))
  const units = billableXUnits(
    'posts',
    posts.map((p) => p.id),
    billableCount(resp.meta, posts.length),
  )
  return { data: posts, cost: estimateCost('posts', units), units, kind: 'posts' }
}

export async function resolveUser(userId: string, auth: GatherAuth): Promise<GatherResult<Profile>> {
  const resp = await xapi<XSingleResponse<XUserRaw>>(`/users/${encodeURIComponent(userId)}`, {
    'user.fields': USER_FIELDS.join(','),
    expansions: USER_EXPANSIONS.join(','),
  }, auth)
  if (!resp.data) throw new Error(resp.errors?.[0]?.detail ?? `User ${userId} not found`)
  const profile = normalizeProfile(resp.data, resp.includes)
  const units = billableXUnits('users', [profile.id], 1)
  return { data: profile, cost: estimateCost('users', units), units, kind: 'users' }
}

/** Max affiliate pages to walk in one refresh — a hard stop against runaway pagination. */
const MAX_AFFILIATE_PAGES = 20

/**
 * List every account affiliated with an organization (X Verified Organization
 * roster) via GET /users/{orgId}/affiliates, following pagination to completion.
 * Org-keyed and fully generic: pass any org's user id. Each affiliate comes back
 * as a full user object, normalized to a Profile. The gratis demo path only
 * permits the demo org's id; any other org requires OAuth.
 */
export async function gatherAffiliates(
  orgId: string,
  auth: GatherAuth,
  opts: { maxResults?: number } = {},
): Promise<GatherResult<Profile[]>> {
  const affiliates: Profile[] = []
  let pageToken: string | undefined
  let pages = 0
  let billed = 0

  do {
    const params: Record<string, string> = {
      'user.fields': USER_FIELDS.join(','),
      expansions: USER_EXPANSIONS.join(','),
      max_results: String(opts.maxResults ?? 100),
    }
    if (pageToken) params.pagination_token = pageToken

    const resp = await xapi<XPaginatedResponse<XUserRaw>>(
      `/users/${encodeURIComponent(orgId)}/affiliates`,
      params,
      auth,
    )
    if (!resp.data && resp.errors?.length) {
      throw new Error(resp.errors[0]?.detail ?? 'X API returned errors')
    }
    const pageRows = resp.data ?? []
    const pageProfiles: Profile[] = []
    for (const raw of pageRows) {
      const profile = normalizeProfile(raw, resp.includes)
      pageProfiles.push(profile)
      affiliates.push(profile)
    }
    billed += billableXUnits(
      'users',
      pageProfiles.map((p) => p.id),
      billableCount(resp.meta, pageRows.length),
    )
    pageToken = resp.meta?.next_token
    pages += 1
  } while (pageToken && pages < MAX_AFFILIATE_PAGES)

  return { data: affiliates, cost: estimateCost('users', billed), units: billed, kind: 'users' }
}
