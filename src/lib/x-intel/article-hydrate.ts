/**
 * Re-fetch posts that look like X Article teasers but lack hydrated body/format.
 * Incremental gather with since_id never revisits old posts, so Articles gathered
 * before tweet.fields=article stayed as bare t.co links forever.
 */
import { xapi, type GatherAuth } from './x-client'
import { POST_FIELDS, POST_EXPANSIONS } from './fields'
import { normalizePost } from './normalize'
import { estimateCost, billableCount } from './gather'
import { billableXUnits } from './x-dedup-billing'
import { mergePosts } from '../../stores/x-intel-store'
import type { Post, XPostRaw, XPaginatedResponse } from './types'
import { postFormatOf } from './style-features'

const BATCH = 100
/** Treat as already hydrated once body is clearly more than a teaser link. */
const HYDRATED_MIN_CHARS = 400
/** Cap bare-link candidates (no /i/article/ url yet) per generate. */
const BARE_LINK_CAP = 40

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

export async function gatherPostsByIds(
  ids: string[],
  auth: GatherAuth,
): Promise<{ data: Post[]; cost: number; units: number; kind: 'posts' }> {
  if (ids.length === 0) return { data: [], cost: 0, units: 0, kind: 'posts' }
  const out: Post[] = []
  let billed = 0
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
    billed += billableXUnits(
      'posts',
      rows.map((r) => r.id),
      billableCount(resp.meta, rows.length),
    )
  }
  return { data: out, cost: estimateCost('posts', billed), units: billed, kind: 'posts' }
}

export interface HydrateArticleResult {
  posts: Post[]
  cost: number
  /** Billable resource count (for unified-ledger unit pricing). */
  units?: number
  /** Stub ids we attempted to fetch. */
  stubIds: string[]
  /** Ids that came back as hydrated articles. */
  hydratedIds: string[]
  /** True when posts array was merged with fetch results. */
  updated: boolean
  error?: string
}

/**
 * Hydrate Article stubs that are ALREADY in the gathered post set (the user's
 * cap). If a post in the window carries an Article payload but only stored the
 * teaser (title / bare t.co link), re-fetch its full body via GET /tweets?ids=…
 * and merge it back so it grounds register.formatFlex.
 *
 * NO timeline scanning. We work strictly within the posts the user already
 * gathered — one cheap batched /tweets call for the stubs we found, nothing
 * more. If there is no Article in the window, there is no Article: formatFlex
 * is correctly grounded in short-form only.
 */
export async function hydrateArticlePosts(
  authorId: string,
  posts: Post[],
  auth: GatherAuth,
): Promise<HydrateArticleResult> {
  const stubIds = findArticleStubIds(authorId, posts)
  if (stubIds.length === 0) {
    return { posts, cost: 0, stubIds: [], hydratedIds: [], updated: false }
  }
  try {
    const { data, cost, units } = await gatherPostsByIds(stubIds, auth)
    if (data.length === 0) {
      return { posts, cost, units, stubIds, hydratedIds: [], updated: false }
    }
    const hydratedIds = data
      .filter((p) => postFormatOf(p) === 'article' && (p.text?.length ?? 0) >= HYDRATED_MIN_CHARS)
      .map((p) => p.id)
    return {
      posts: mergePosts(posts, data),
      cost,
      units,
      stubIds,
      hydratedIds,
      updated: true,
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.warn('[article-hydrate] failed:', message)
    return {
      posts,
      cost: 0,
      stubIds,
      hydratedIds: [],
      updated: false,
      error: message,
    }
  }
}
