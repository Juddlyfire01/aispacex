import { X_PROXY_BASE, XAPIError } from '../x-intel/x-client'
import { POST_FIELDS, POST_EXPANSIONS, COST_PER_POST } from '../x-intel/fields'
import type { AlphaPostCard, AlphaStory, CountBucket, RailCountsCache } from './types'

/** Counts requests billed as a small fixed unit (operator estimate). */
export const COST_PER_COUNTS_REQUEST = 0.005
/** News search: flat estimate per call. */
export const COST_PER_NEWS_SEARCH = 0.01

interface CountsApiResponse {
  data?: Array<{ start?: string; end?: string; tweet_count?: number }>
  meta?: { total_tweet_count?: number }
  errors?: Array<{ detail?: string; title?: string }>
}

interface SearchApiResponse {
  data?: Array<{
    id: string
    text?: string
    author_id?: string
    created_at?: string
    public_metrics?: {
      like_count?: number
      reply_count?: number
      retweet_count?: number
      quote_count?: number
      impression_count?: number
    }
  }>
  includes?: {
    users?: Array<{ id: string; username?: string; name?: string }>
  }
  errors?: Array<{ detail?: string }>
}

interface NewsSearchResponse {
  data?: Array<{
    id?: string
    rest_id?: string
    name?: string
    hook?: string
    summary?: string
    category?: string
    updated_at?: string
    last_updated_at_ms?: string
    cluster_posts_results?: Array<{ post_id?: string }>
  }>
}

async function alphaGet<T>(
  path: string,
  params: Record<string, string>,
  signal?: AbortSignal,
): Promise<T> {
  const qs = new URLSearchParams(params).toString()
  const clean = path.startsWith('/') ? path.slice(1) : path
  const res = await fetch(`${X_PROXY_BASE}/${clean}${qs ? `?${qs}` : ''}`, {
    credentials: 'same-origin',
    signal,
  })
  if (!res.ok) {
    let message = `HTTP ${res.status}`
    try {
      const err = (await res.json()) as Record<string, unknown>
      if (typeof err.error === 'string' && err.error === 'x_not_connected') {
        message = 'Connect your X account (Connections).'
      } else if (typeof err.detail === 'string') {
        message = err.detail
      } else if (typeof err.title === 'string') {
        message = err.title
      }
    } catch {
      /* default */
    }
    throw new XAPIError(message, res.status)
  }
  return res.json() as Promise<T>
}

export async function fetchCountsRecent(
  railId: string,
  query: string,
  signal?: AbortSignal,
): Promise<RailCountsCache> {
  const resp = await alphaGet<CountsApiResponse>(
    'tweets/counts/recent',
    {
      query,
      granularity: 'hour',
    },
    signal,
  )
  const buckets: CountBucket[] = (resp.data ?? []).map((b) => ({
    start: b.start ?? '',
    end: b.end ?? '',
    tweet_count: b.tweet_count ?? 0,
  }))
  const total =
    resp.meta?.total_tweet_count ??
    buckets.reduce((n, b) => n + b.tweet_count, 0)

  return {
    railId,
    query,
    fetchedAt: Date.now(),
    totalTweetCount: total,
    buckets,
    cost: COST_PER_COUNTS_REQUEST,
  }
}

function mapSearchPosts(resp: SearchApiResponse): AlphaPostCard[] {
  const users = new Map((resp.includes?.users ?? []).map((u) => [u.id, u]))
  return (resp.data ?? []).map((p) => {
    const author = p.author_id ? users.get(p.author_id) : undefined
    const m = p.public_metrics
    return {
      id: p.id,
      text: p.text ?? '',
      authorId: p.author_id,
      authorUsername: author?.username,
      authorName: author?.name,
      createdAt: p.created_at,
      likeCount: m?.like_count,
      replyCount: m?.reply_count,
      retweetCount: m?.retweet_count,
      quoteCount: m?.quote_count,
      impressionCount: m?.impression_count,
      url: `https://x.com/i/status/${p.id}`,
    }
  })
}

export async function fetchSearchRecent(
  query: string,
  maxResults = 10,
  signal?: AbortSignal,
): Promise<{ posts: AlphaPostCard[]; cost: number }> {
  const resp = await alphaGet<SearchApiResponse>(
    'tweets/search/recent',
    {
      query,
      max_results: String(Math.min(100, Math.max(10, maxResults))),
      'tweet.fields': POST_FIELDS.join(','),
      expansions: POST_EXPANSIONS.join(','),
      'user.fields': 'id,name,username',
    },
    signal,
  )
  const posts = mapSearchPosts(resp)
  return { posts, cost: COST_PER_POST * posts.length }
}

/** Max ids per X tweets lookup (API allows 100; we keep clusters smaller). */
export const ALPHA_HYDRATE_MAX_IDS = 25

export async function fetchPostsByIds(
  ids: string[],
  signal?: AbortSignal,
): Promise<{ posts: AlphaPostCard[]; cost: number }> {
  const unique = [...new Set(ids.filter(Boolean))].slice(0, ALPHA_HYDRATE_MAX_IDS)
  if (unique.length === 0) return { posts: [], cost: 0 }

  const resp = await alphaGet<SearchApiResponse>(
    'tweets',
    {
      ids: unique.join(','),
      'tweet.fields': POST_FIELDS.join(','),
      expansions: POST_EXPANSIONS.join(','),
      'user.fields': 'id,name,username',
    },
    signal,
  )
  const posts = mapSearchPosts(resp)
  return { posts, cost: COST_PER_POST * posts.length }
}

/** Default X News scan queries for the Alpha surface (Grok-clustered stories). */
export const ALPHA_NEWS_SCAN_QUERIES = [
  'Venice AI OR VeniceAI OR $VVV',
  'uncensored AI OR open weight models',
  'AI agents OR agentic',
] as const

const NEWS_FIELDS =
  'name,summary,hook,category,contexts,cluster_posts_results,keywords,updated_at,disclaimer'

export async function fetchNewsSearch(
  query: string,
  maxResults = 5,
  maxAgeHours = 48,
  signal?: AbortSignal,
): Promise<{ stories: AlphaStory[]; cost: number }> {
  const resp = await alphaGet<NewsSearchResponse>(
    'news/search',
    {
      query,
      max_results: String(Math.min(20, Math.max(1, maxResults))),
      max_age_hours: String(maxAgeHours),
      'news.fields': NEWS_FIELDS,
    },
    signal,
  )
  const stories: AlphaStory[] = (resp.data ?? []).map((s) => {
    const id = s.id ?? s.rest_id ?? ''
    return {
      id,
      name: s.name ?? 'Untitled',
      hook: s.hook,
      summary: s.summary,
      category: s.category,
      updatedAt: s.updated_at ?? s.last_updated_at_ms,
      clusterPostIds: (s.cluster_posts_results ?? [])
        .map((c) => c.post_id)
        .filter((x): x is string => Boolean(x)),
      url: id ? `https://x.com/i/news/${id}` : undefined,
    }
  })
  return { stories, cost: COST_PER_NEWS_SEARCH }
}

/**
 * Multi-query X News scan, deduped by story id. Used for the Alpha breaking surface.
 */
export async function fetchNewsScan(
  queries: readonly string[] = ALPHA_NEWS_SCAN_QUERIES,
  maxPerQuery = 6,
  maxAgeHours = 36,
  signal?: AbortSignal,
): Promise<{ stories: AlphaStory[]; cost: number }> {
  const seen = new Set<string>()
  const stories: AlphaStory[] = []
  let cost = 0
  for (const q of queries) {
    if (signal?.aborted) break
    try {
      const res = await fetchNewsSearch(q, maxPerQuery, maxAgeHours, signal)
      cost += res.cost
      for (const s of res.stories) {
        if (!s.id || seen.has(s.id)) continue
        seen.add(s.id)
        stories.push(s)
      }
    } catch {
      // continue other queries
    }
  }
  // Prefer larger clusters / fresher-looking titles first (cluster size as proxy).
  stories.sort((a, b) => b.clusterPostIds.length - a.clusterPostIds.length)
  return { stories, cost }
}
