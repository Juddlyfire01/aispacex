import type { ToolDefinition } from '../../types/venice'
import type { NewsItem } from '../news/types'
import { extractNewsArticle, NewsExtractError } from '../news/extract-client'
import { X_PROXY_BASE, XAPIError } from '../x-intel/x-client'

const X_NEWS_TRUNCATE = 32_000
const X_NEWS_FIELDS =
  'name,summary,hook,category,contexts,cluster_posts_results,keywords,updated_at,disclaimer'

export const NEWS_READ_TOOL_NAME = 'news_read'
export const X_NEWS_SEARCH_TOOL_NAME = 'x_news_search'
export const X_NEWS_GET_TOOL_NAME = 'x_news_get'

export const COMPOSE_NEWS_READ_TOOL: ToolDefinition = {
  type: 'function',
  function: {
    name: NEWS_READ_TOOL_NAME,
    description:
      'Fetch the full main-article text for a bookmarked RSS story (Readability extract). Pass bookmark id from BOOKMARKED NEWS or the story url. Use only when that story is relevant — hot list is pointers only.',
    parameters: {
      type: 'object',
      properties: {
        id: {
          type: 'string',
          description: 'Bookmark id from the BOOKMARKED NEWS hot list.',
        },
        url: {
          type: 'string',
          description: 'Story URL (must match a bookmarked item).',
        },
      },
      additionalProperties: false,
    },
  },
}

export const COMPOSE_X_NEWS_TOOLS: ToolDefinition[] = [
  {
    type: 'function',
    function: {
      name: X_NEWS_SEARCH_TOOL_NAME,
      description:
        'Search AI-generated news stories on X (clustered posts). Prefer for live/breaking topics on X. Recency is set by compose settings (max_age_hours).',
      parameters: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'Search query for X News stories.',
          },
          max_results: {
            type: 'number',
            description: 'Max stories to return (default 10, max 20).',
          },
        },
        required: ['query'],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: X_NEWS_GET_TOOL_NAME,
      description:
        'Fetch one X News story by id (summary, hook, contexts, clustered post ids).',
      parameters: {
        type: 'object',
        properties: {
          id: {
            type: 'string',
            description: 'X News story id.',
          },
        },
        required: ['id'],
        additionalProperties: false,
      },
    },
  },
]

export function getComposeNewsTools(opts: { xNewsOn: boolean }): ToolDefinition[] {
  return opts.xNewsOn
    ? [COMPOSE_NEWS_READ_TOOL, ...COMPOSE_X_NEWS_TOOLS]
    : [COMPOSE_NEWS_READ_TOOL]
}

export interface NewsToolContext {
  bookmarks: NewsItem[]
  xNewsOn: boolean
  /** Default from settings; search uses this unless overridden later. */
  xNewsMaxAgeHours: number
  signal?: AbortSignal
}

function asString(v: unknown): string | undefined {
  return typeof v === 'string' && v.length > 0 ? v : undefined
}

function asNumber(v: unknown): number | undefined {
  if (typeof v === 'number' && Number.isFinite(v)) return v
  if (typeof v === 'string' && v.trim() !== '') {
    const n = Number(v)
    if (Number.isFinite(n)) return n
  }
  return undefined
}

function maybeTruncateJson(result: unknown): unknown {
  let json: string
  try {
    json = JSON.stringify(result)
  } catch {
    return { error: 'Failed to serialize tool result' }
  }
  if (json.length <= X_NEWS_TRUNCATE) return result
  if (Array.isArray(result)) {
    let slice = result
    while (slice.length > 0 && JSON.stringify(slice).length > X_NEWS_TRUNCATE) {
      slice = slice.slice(0, Math.max(1, Math.floor(slice.length / 2)))
    }
    return { truncated: true, data: slice }
  }
  if (result && typeof result === 'object') {
    const obj = { ...(result as Record<string, unknown>), truncated: true }
    return obj
  }
  return { truncated: true, data: result }
}

function resolveBookmark(
  bookmarks: NewsItem[],
  args: Record<string, unknown>,
): NewsItem | { error: string } {
  const id = asString(args.id)
  const url = asString(args.url)
  if (!id && !url) return { error: 'id or url is required' }
  if (id) {
    const byId = bookmarks.find((b) => b.id === id)
    if (byId) return byId
  }
  if (url) {
    const byUrl = bookmarks.find((b) => b.url === url)
    if (byUrl) return byUrl
  }
  return {
    error:
      'Story must be a bookmarked RSS item (id/url from BOOKMARKED NEWS). Bookmark it in the News tab first.',
  }
}

async function xNewsGet(path: string, params: Record<string, string>, signal?: AbortSignal) {
  const url = new URL(`${X_PROXY_BASE}/${path}`, window.location.origin)
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v)
  const res = await fetch(url.toString(), {
    headers: { Accept: 'application/json' },
    signal,
  })
  const text = await res.text()
  let json: unknown = null
  try {
    json = JSON.parse(text)
  } catch {
    /* keep null */
  }
  if (!res.ok) {
    const msg =
      json && typeof json === 'object' && json !== null
        ? (() => {
            const o = json as Record<string, unknown>
            if (typeof o.error === 'string' && o.error) return o.error
            if (typeof o.detail === 'string' && o.detail) return o.detail
            if (typeof o.title === 'string' && o.title) return o.title
            return `HTTP ${res.status}`
          })()
        : `HTTP ${res.status}`
    throw new XAPIError(msg, res.status)
  }
  return json
}

/**
 * Execute news_read / x_news_* tools.
 * news_read returns the full article text (no editorial clip).
 */
export async function executeNewsTool(
  name: string,
  args: Record<string, unknown>,
  ctx: NewsToolContext,
): Promise<unknown> {
  try {
    if (name === NEWS_READ_TOOL_NAME) {
      const item = resolveBookmark(ctx.bookmarks, args ?? {})
      if ('error' in item) return item
      try {
        const article = await extractNewsArticle(item.url, { signal: ctx.signal })
        return {
          id: item.id,
          bookmarkTitle: item.title,
          sourceName: item.sourceName,
          url: article.url,
          title: article.title || item.title,
          byline: article.byline,
          siteName: article.siteName,
          length: article.length,
          text: article.text,
        }
      } catch (err) {
        if (err instanceof NewsExtractError) {
          return { error: err.code, status: err.status, url: item.url }
        }
        return { error: err instanceof Error ? err.message : String(err), url: item.url }
      }
    }

    if (name === X_NEWS_SEARCH_TOOL_NAME || name === X_NEWS_GET_TOOL_NAME) {
      if (!ctx.xNewsOn) {
        return { error: 'X News tools are disabled in compose settings' }
      }
    }

    if (name === X_NEWS_SEARCH_TOOL_NAME) {
      const query = asString(args.query)
      if (!query) return { error: 'query is required' }
      const maxResults = Math.min(20, Math.max(1, asNumber(args.max_results) ?? 10))
      const data = await xNewsGet(
        'news/search',
        {
          query,
          max_results: String(maxResults),
          max_age_hours: String(ctx.xNewsMaxAgeHours),
          'news.fields': X_NEWS_FIELDS,
        },
        ctx.signal,
      )
      return maybeTruncateJson(data)
    }

    if (name === X_NEWS_GET_TOOL_NAME) {
      const id = asString(args.id)
      if (!id) return { error: 'id is required' }
      const data = await xNewsGet(
        `news/${encodeURIComponent(id)}`,
        {
          'news.fields': X_NEWS_FIELDS,
        },
        ctx.signal,
      )
      return maybeTruncateJson(data)
    }

    return { error: `Unknown tool: ${name}` }
  } catch (err) {
    if (err instanceof XAPIError) {
      return { error: err.message, status: err.status }
    }
    return { error: err instanceof Error ? err.message : String(err) }
  }
}
