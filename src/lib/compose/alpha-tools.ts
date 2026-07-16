import type { ToolDefinition } from '../../types/venice'
import {
  getBrief,
  getStoryWithPosts,
  grepArchive,
  listArchive,
  type AlphaArchiveState,
} from '../alpha/archive'
import { useAlphaStore } from '../../stores/alpha-store'

const TRUNCATE_CHARS = 32_000

export const COMPOSE_ALPHA_TOOLS: ToolDefinition[] = [
  {
    type: 'function',
    function: {
      name: 'alpha_list',
      description:
        'List recent Alpha Radar archive items (24h + pins): briefs, news stories, hydrated posts. Returns kind, id, and a short snippet. Prefer the hot-window Alpha slice first; use this to discover ids for alpha_get.',
      parameters: {
        type: 'object',
        properties: {
          kind: {
            type: 'string',
            enum: ['brief', 'story', 'post', 'all'],
            description: 'Filter by archive kind (default all).',
          },
          railId: {
            type: 'string',
            description: 'Optional rail id filter (briefs and posts).',
          },
          pinnedOnly: {
            type: 'boolean',
            description: 'If true, only pinned items.',
          },
          limit: {
            type: 'number',
            description: 'Max items (default 20).',
          },
        },
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'alpha_grep',
      description:
        'Substring search over Alpha Radar archive (brief markdown, story name/hook/summary, post text). Returns hits with kind + id for alpha_get.',
      parameters: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'Case-insensitive substring to find.',
          },
          limit: {
            type: 'number',
            description: 'Max hits (default 20).',
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
      name: 'alpha_get',
      description:
        'Fetch one Alpha Radar archive item by kind + id. brief → full brief; story → story + hydrated cluster posts; post → one hydrated post. Use ids from alpha_list / alpha_grep only.',
      parameters: {
        type: 'object',
        properties: {
          kind: {
            type: 'string',
            enum: ['brief', 'story', 'post'],
            description: 'Archive kind to fetch.',
          },
          id: {
            type: 'string',
            description: 'Item id from list/grep.',
          },
        },
        required: ['kind', 'id'],
        additionalProperties: false,
      },
    },
  },
]

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

function asBoolean(v: unknown): boolean | undefined {
  if (typeof v === 'boolean') return v
  return undefined
}

function archiveFromStore(): AlphaArchiveState {
  const s = useAlphaStore.getState()
  return { briefs: s.briefs, stories: s.stories, posts: s.posts }
}

function maybeTruncate(result: unknown): unknown {
  let json: string
  try {
    json = JSON.stringify(result)
  } catch {
    return { error: 'Failed to serialize tool result' }
  }
  if (json.length <= TRUNCATE_CHARS) return result

  if (Array.isArray(result)) {
    let slice = result
    while (slice.length > 0 && JSON.stringify(slice).length > TRUNCATE_CHARS) {
      slice = slice.slice(0, Math.max(1, Math.floor(slice.length / 2)))
      if (slice.length === 1 && JSON.stringify(slice).length > TRUNCATE_CHARS) {
        return { truncated: true, data: [], note: 'Result too large even after shrinking' }
      }
    }
    return { truncated: true, data: slice }
  }

  if (result && typeof result === 'object') {
    const obj = { ...(result as Record<string, unknown>) }
    let changed = false
    for (const key of Object.keys(obj)) {
      const val = obj[key]
      if (Array.isArray(val)) {
        let arr = val
        while (arr.length > 0 && JSON.stringify({ ...obj, [key]: arr }).length > TRUNCATE_CHARS) {
          arr = arr.slice(0, Math.max(1, Math.floor(arr.length / 2)))
          if (arr.length === 1 && JSON.stringify({ ...obj, [key]: arr }).length > TRUNCATE_CHARS) {
            arr = []
            break
          }
        }
        if (arr.length !== val.length) {
          obj[key] = arr
          changed = true
        }
      }
    }
    if (changed) {
      obj.truncated = true
      return obj
    }
    return { truncated: true, data: obj }
  }

  return { truncated: true, data: result }
}

function emptyArchiveMessage(): string {
  return 'Nothing in the 24h Radar archive (and no pins).'
}

function runTool(name: string, args: Record<string, unknown>): unknown {
  useAlphaStore.getState().pruneCold()
  const state = archiveFromStore()

  switch (name) {
    case 'alpha_list': {
      const kindRaw = asString(args.kind)
      const kind =
        kindRaw === 'brief' || kindRaw === 'story' || kindRaw === 'post' || kindRaw === 'all'
          ? kindRaw
          : undefined
      const items = listArchive(state, {
        kind,
        railId: asString(args.railId),
        pinnedOnly: asBoolean(args.pinnedOnly),
        limit: asNumber(args.limit),
      })
      if (items.length === 0) {
        return { items: [], message: emptyArchiveMessage() }
      }
      return { items }
    }

    case 'alpha_grep': {
      const query = asString(args.query)
      if (!query) throw new Error('query is required')
      const hits = grepArchive(state, query, asNumber(args.limit) ?? 20)
      if (hits.length === 0) {
        return { hits: [], message: emptyArchiveMessage() }
      }
      return { hits }
    }

    case 'alpha_get': {
      const kind = asString(args.kind)
      const id = asString(args.id)
      if (!kind || !id) throw new Error('kind and id are required')

      if (kind === 'brief') {
        const brief = getBrief(state, id)
        if (!brief) return { error: `Brief not found: ${id}` }
        return brief
      }
      if (kind === 'story') {
        const packed = getStoryWithPosts(state, id)
        if (!packed) return { error: `Story not found: ${id}` }
        return packed
      }
      if (kind === 'post') {
        const post = state.posts[id]
        if (!post) return { error: `Post not found: ${id}` }
        return post
      }
      return { error: `Invalid kind: ${kind}` }
    }

    default:
      return { error: `Unknown tool: ${name}` }
  }
}

/**
 * Execute one Alpha Radar archive tool against useAlphaStore cold state.
 * Unknown tools and thrown errors become `{ error: string }`.
 * Returns a plain object (agent JSON.stringify's it into the tool message).
 */
export function executeAlphaTool(name: string, args: Record<string, unknown>): unknown {
  try {
    const result = runTool(name, args ?? {})
    if (
      result &&
      typeof result === 'object' &&
      'error' in result &&
      Object.keys(result as object).length === 1
    ) {
      return result
    }
    return maybeTruncate(result)
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) }
  }
}
