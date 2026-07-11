import type { ToolDefinition } from '../../types/venice'
import type { ComposeScope } from '../intel-library/types'
import {
  getThread,
  globHistory,
  grepHistory,
  listThreads,
  type HistorySnapshot,
} from './history-library'

const TRUNCATE_CHARS = 32_000

export const COMPOSE_HISTORY_TOOLS: ToolDefinition[] = [
  {
    type: 'function',
    function: {
      name: 'compose_history_list',
      description:
        'List prior compose chat threads (id, context, title, preview, updatedAt, tokenEstimate, messageCount). Prefer the active transcript already in messages; use this to discover other threads.',
      parameters: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'Optional substring filter over title, preview, and message text.',
          },
          contextType: {
            type: 'string',
            enum: ['me', 'all', 'target'],
            description: 'Optional filter by thread context type.',
          },
          limit: {
            type: 'number',
            description: 'Max threads (default 50, max 100).',
          },
        },
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'compose_history_grep',
      description:
        'Full-text search across prior compose thread messages and cold compress archives (AND terms). Returns snippets with threadId you can pass to compose_history_get. Cold hits are prefixed with [cold …].',
      parameters: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'Space-separated terms; all must match (AND).',
          },
          threadId: {
            type: 'string',
            description: 'Optional thread id to search within.',
          },
          limit: {
            type: 'number',
            description: 'Max hits (default 20, max 50).',
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
      name: 'compose_history_glob',
      description:
        'List virtual history paths matching a glob (e.g. "history/me/*", "history/target/@AskVenice/**"). Paths look like history/{me|all|target/@user}/{threadId}.',
      parameters: {
        type: 'object',
        properties: {
          pattern: {
            type: 'string',
            description: 'Glob with * and ** (e.g. history/**/t-*).',
          },
        },
        required: ['pattern'],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'compose_history_get',
      description:
        'Fetch one prior compose thread by id (live messages capped; default last 40). Includes compressArchives (cold stacks, newest first) when the thread was auto-compressed. Use ids from list/grep/glob only — never invent thread ids.',
      parameters: {
        type: 'object',
        properties: {
          threadId: {
            type: 'string',
            description: 'Thread id from list/grep/glob.',
          },
          maxMessages: {
            type: 'number',
            description: 'Max messages to return from the end of the thread (default 40).',
          },
        },
        required: ['threadId'],
        additionalProperties: false,
      },
    },
  },
]

export interface HistoryToolContext {
  snapshot: HistorySnapshot
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

function runTool(name: string, args: Record<string, unknown>, ctx: HistoryToolContext): unknown {
  const { snapshot } = ctx

  switch (name) {
    case 'compose_history_list': {
      const contextTypeRaw = asString(args.contextType)
      const contextType =
        contextTypeRaw === 'me' || contextTypeRaw === 'all' || contextTypeRaw === 'target'
          ? (contextTypeRaw as ComposeScope['type'])
          : undefined
      return listThreads(snapshot, {
        query: asString(args.query),
        contextType,
        limit: asNumber(args.limit),
      })
    }

    case 'compose_history_grep': {
      const query = asString(args.query)
      if (!query) throw new Error('query is required')
      return grepHistory(snapshot, {
        query,
        threadId: asString(args.threadId),
        limit: asNumber(args.limit),
      })
    }

    case 'compose_history_glob': {
      const pattern = asString(args.pattern)
      if (!pattern) throw new Error('pattern is required')
      return globHistory(snapshot, pattern)
    }

    case 'compose_history_get': {
      const threadId = asString(args.threadId)
      if (!threadId) throw new Error('threadId is required')
      return getThread(snapshot, threadId, { maxMessages: asNumber(args.maxMessages) })
    }

    default:
      return { error: `Unknown tool: ${name}` }
  }
}

/**
 * Execute one compose history tool against a cold history snapshot.
 * Unknown tools and thrown errors become `{ error: string }`.
 */
export function executeHistoryTool(
  name: string,
  args: Record<string, unknown>,
  ctx: HistoryToolContext,
): unknown {
  try {
    const result = runTool(name, args ?? {}, ctx)
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
