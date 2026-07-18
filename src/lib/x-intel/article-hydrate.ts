/**
 * Re-fetch posts that look like X Article teasers but lack hydrated body/format.
 * Incremental gather with since_id never revisits old posts, so Articles gathered
 * before tweet.fields=article stayed as bare t.co links forever.
 */
import { xapi, type GatherAuth } from './x-client'
import { POST_FIELDS, POST_EXPANSIONS } from './fields'
import { normalizePost } from './normalize'
import { estimateCost } from './gather'
import { mergePosts } from '../../stores/x-intel-store'
import type { Post, XPostRaw, XPaginatedResponse } from './types'
import { postFormatOf } from './style-features'

const BATCH = 100
/** Treat as already hydrated once body is clearly more than a teaser link. */
const HYDRATED_MIN_CHARS = 400
/** Cap bare-link candidates (no /i/article/ url yet) per generate. */
const BARE_LINK_CAP = 40
/** Timeline pages to scan when discovering Articles that fell outside the gather window. */
const DISCOVERY_PAGE_CAP = 5
/** Posts per discovery page (X allows up to 100). */
const DISCOVERY_PAGE_SIZE = 100

function hasArticleUrl(p: Post): boolean {
  if (p.urls.some((u) => /\/i\/article\//i.test(u.expanded) || /\/article\//i.test(u.expanded))) {
    return true
  }
  // Some legacy rows only kept the t.co in text; expanded url may be absent.
  return /x\.com\/i\/article\//i.test(p.text ?? '')
}

function isBareLinkText(text: string): boolean {
  return /^\s*https?:\/\/\S+\s*$/i.test(text.trim())
}

function isOwnCandidate(p: Post, authorId: string): boolean {
  // Legacy timeline rows sometimes lack authorId — still hydrate; inbound always has authorId.
  return !p.authorId || p.authorId === authorId
}

function alreadyHydrated(p: Post): boolean {
  const fmt = postFormatOf(p)
  if (fmt !== 'article') return false
  const len = p.text?.length ?? 0
  if (len >= HYDRATED_MIN_CHARS) return true
  if (p.articleTitle && len > p.articleTitle.length + 80) return true
  return false
}

/**
 * Own (or legacy authorless) posts that need GET /tweets hydrate for Article payload.
 * Includes bare t.co teasers — X Article announcement posts are often ONLY a link.
 */
export function findArticleStubIds(authorId: string, posts: Post[]): string[] {
  const definite: string[] = []
  const bareLinks: Post[] = []

  for (const p of posts) {
    if (!isOwnCandidate(p, authorId)) continue
    if (alreadyHydrated(p)) continue

    if (hasArticleUrl(p) || postFormatOf(p) === 'article') {
      definite.push(p.id)
      continue
    }

    // Article cards often store as a single t.co / x.com link with no entities.
    if (
      (p.kind === 'original' || !p.kind) &&
      isBareLinkText(p.text ?? '') &&
      /https?:\/\//i.test(p.text)
    ) {
      bareLinks.push(p)
    }
  }

  bareLinks.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  const bareIds = bareLinks.slice(0, BARE_LINK_CAP).map((p) => p.id)
  return [...new Set([...definite, ...bareIds])]
}

/**
 * Discover Article posts that fall OUTSIDE the shallow initial gather window.
 *
 * The timeline endpoint (/users/{id}/tweets) is gathered with a small
 * max_results and, on refresh, only incrementally via since_id — so it never
 * revisits older posts. An X Article the account posted before the first gather
 * (e.g. a fundraise announcement a few weeks back) is therefore never in the
 * store, and no amount of stub detection over stored posts can find it.
 *
 * This walks a few timeline pages (newest→older) and returns the ids of any
 * posts that carry an `article` payload. On the timeline those come back with
 * only `article.title` (no body / no url entities), so we key off the raw
 * `article` object rather than the normalized text. Callers then hydrate the
 * full body via GET /tweets?ids=… (see gatherPostsByIds).
 *
 * Cheap and bounded: at most DISCOVERY_PAGE_CAP pages. Ids already present in
 * `known` are skipped so we don't re-hydrate what the store already holds.
 */
export async function discoverArticleStubIds(
  userId: string,
  auth: GatherAuth,
  known: Set<string>,
): Promise<{ ids: string[]; cost: number }> {
  const found: string[] = []
  let cost = 0
  let pageToken: string | undefined
  let scanned = 0

  for (let page = 0; page < DISCOVERY_PAGE_CAP; page++) {
    const params: Record<string, string> = {
      'tweet.fields': POST_FIELDS.join(','),
      expansions: POST_EXPANSIONS.join(','),
      max_results: String(DISCOVERY_PAGE_SIZE),
      // Announcement posts are originals; skip reply/RT noise to reach further back.
      exclude: 'replies,retweets',
    }
    if (pageToken) params.pagination_token = pageToken

    let resp: XPaginatedResponse<XPostRaw>
    try {
      resp = await xapi<XPaginatedResponse<XPostRaw>>(
        `/users/${encodeURIComponent(userId)}/tweets`,
        params,
        auth,
      )
    } catch (err) {
      // Discovery is best-effort — a page failure shouldn't abort report gen.
      console.warn('[article-hydrate] discovery page failed:', err instanceof Error ? err.message : err)
      break
    }

    const rows = resp.data ?? []
    scanned += rows.length
    for (const raw of rows) {
      if (raw.article && !known.has(raw.id)) found.push(raw.id)
    }
    cost += estimateCost('posts', rows.length)

    pageToken = resp.meta?.next_token
    if (!pageToken || rows.length === 0) break
  }

  return { ids: [...new Set(found)], cost }
}

export async function gatherPostsByIds(
  ids: string[],
  auth: GatherAuth,
): Promise<{ data: Post[]; cost: number }> {
  if (ids.length === 0) return { data: [], cost: 0 }
  const out: Post[] = []
  for (let i = 0; i < ids.length; i += BATCH) {
    const chunk = ids.slice(i, i + BATCH)
    const resp = await xapi<XPaginatedResponse<XPostRaw>>('/tweets', {
      ids: chunk.join(','),
      'tweet.fields': POST_FIELDS.join(','),
      expansions: POST_EXPANSIONS.join(','),
    }, auth)
    // X may return `data` as a single object when ids has one entry.
    const rows = Array.isArray(resp.data)
      ? resp.data
      : resp.data
        ? [resp.data as unknown as XPostRaw]
        : []
    for (const raw of rows) {
      out.push(normalizePost(raw, resp.includes))
    }
  }
  return { data: out, cost: estimateCost('posts', out.length) }
}

export interface HydrateArticleResult {
  posts: Post[]
  cost: number
  /** Stub ids we attempted to fetch. */
  stubIds: string[]
  /** Ids that came back as hydrated articles. */
  hydratedIds: string[]
  /** True when posts array was merged with fetch results. */
  updated: boolean
  error?: string
}

/**
 * Hydrate article stubs. Merges any successful fetches back into `posts`.
 *
 * Two sources of stub ids are combined:
 *  1. Stored posts that look like Article teasers (findArticleStubIds).
 *  2. Timeline discovery — Article posts the account made BEFORE the shallow
 *     initial gather window, which are otherwise never in the store
 *     (discoverArticleStubIds). This is what lets an older fundraise/essay
 *     Article ground `formatFlex` even when the feed only holds recent posts.
 *
 * Discovery is best-effort and gated behind `discover` so callers that already
 * hold a deep timeline can skip the extra pages.
 */
export async function hydrateArticlePosts(
  authorId: string,
  posts: Post[],
  auth: GatherAuth,
  opts: { discover?: boolean } = {},
): Promise<HydrateArticleResult> {
  const storedStubIds = findArticleStubIds(authorId, posts)

  // Skip the extra timeline pages once we already hold a fully-hydrated Article:
  // formatFlex is already grounded, so paying for discovery every report is waste.
  const hasHydratedArticle = posts.some(
    (p) => postFormatOf(p) === 'article' && (p.text?.length ?? 0) >= HYDRATED_MIN_CHARS,
  )

  // Discover older Articles outside the gather window (best-effort).
  let discoveredIds: string[] = []
  let discoveryCost = 0
  if (opts.discover !== false && authorId && !hasHydratedArticle) {
    const known = new Set(posts.map((p) => p.id))
    // Don't re-request stored stubs we're already going to hydrate.
    for (const id of storedStubIds) known.add(id)
    try {
      const discovery = await discoverArticleStubIds(authorId, auth, known)
      discoveredIds = discovery.ids
      discoveryCost = discovery.cost
    } catch (err) {
      console.warn('[article-hydrate] discovery failed:', err instanceof Error ? err.message : err)
    }
  }

  const stubIds = [...new Set([...storedStubIds, ...discoveredIds])]
  if (stubIds.length === 0) {
    return { posts, cost: discoveryCost, stubIds: [], hydratedIds: [], updated: false }
  }
  try {
    const { data, cost } = await gatherPostsByIds(stubIds, auth)
    const totalCost = cost + discoveryCost
    if (data.length === 0) {
      return { posts, cost: totalCost, stubIds, hydratedIds: [], updated: false }
    }
    const hydratedIds = data
      .filter((p) => postFormatOf(p) === 'article' && (p.text?.length ?? 0) >= HYDRATED_MIN_CHARS)
      .map((p) => p.id)
    return {
      posts: mergePosts(posts, data),
      cost: totalCost,
      stubIds,
      hydratedIds,
      updated: true,
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.warn('[article-hydrate] failed:', message)
    return {
      posts,
      cost: discoveryCost,
      stubIds,
      hydratedIds: [],
      updated: false,
      error: message,
    }
  }
}
