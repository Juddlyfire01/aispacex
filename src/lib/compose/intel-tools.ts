import type { ToolDefinition } from '../../types/venice'
import {
  getEdges,
  getPosts,
  getProfile,
  getReport,
  globIntel,
  grepIntel,
  listSubjects,
  type GrepContentType,
} from '../intel-library/library'
import type { ComposeScope, IntelSnapshot } from '../intel-library/types'

const TRUNCATE_CHARS = 32_000

export const COMPOSE_INTEL_TOOLS: ToolDefinition[] = [
  {
    type: 'function',
    function: {
      name: 'intel_list_subjects',
      description:
        'List subjects in the current compose scope with summary counts (posts, reports, profile). Use to discover available handles before fetching details.',
      parameters: {
        type: 'object',
        properties: {},
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'intel_glob',
      description:
        'List virtual intel paths matching a glob pattern (e.g. "intel/**/posts/*", "intel/target/@AskVenice/**"). Paths look like intel/{self|target}/@handle/{profile|posts|reports|edges|bookmarks|likes}.',
      parameters: {
        type: 'object',
        properties: {
          pattern: {
            type: 'string',
            description: 'Glob with * and ** (e.g. intel/**/reports/*).',
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
      name: 'intel_grep',
      description:
        'Full-text search across posts, reports, profiles, and edges in scope. Returns snippet hits with ids you can pass to intel_get_posts / intel_get_report.',
      parameters: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'Space-separated terms; all must match (AND).',
          },
          types: {
            type: 'array',
            items: {
              type: 'string',
              enum: ['posts', 'reports', 'profiles', 'edges', 'all'],
            },
            description: 'Content types to search. Default: all.',
          },
          handle: {
            type: 'string',
            description: 'Optional handle filter (with or without @).',
          },
          since: {
            type: 'string',
            description: 'Optional lower bound date (YYYY-MM-DD or ISO).',
          },
          until: {
            type: 'string',
            description: 'Optional upper bound date (YYYY-MM-DD or ISO).',
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
      name: 'intel_get_profile',
      description: 'Fetch the stored profile for a handle in scope.',
      parameters: {
        type: 'object',
        properties: {
          handle: {
            type: 'string',
            description: 'Username (with or without @).',
          },
        },
        required: ['handle'],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'intel_get_posts',
      description:
        'Fetch posts (or bookmarks/likes for self) for a handle. Prefer since/until or ids from grep rather than dumping the whole timeline.',
      parameters: {
        type: 'object',
        properties: {
          handle: {
            type: 'string',
            description: 'Username (with or without @).',
          },
          source: {
            type: 'string',
            enum: ['posts', 'bookmarks', 'likes'],
            description: 'Which collection. Default posts. bookmarks/likes only for self.',
          },
          since: {
            type: 'string',
            description: 'Optional lower bound date (YYYY-MM-DD or ISO).',
          },
          until: {
            type: 'string',
            description: 'Optional upper bound date (YYYY-MM-DD or ISO).',
          },
          limit: {
            type: 'number',
            description: 'Max posts (default 15, max 40).',
          },
          ids: {
            type: 'array',
            items: { type: 'string' },
            description: 'Optional post ids to fetch specifically.',
          },
        },
        required: ['handle'],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'intel_get_report',
      description:
        'Fetch an intel report for a handle. Omitting reportId returns the newest report.',
      parameters: {
        type: 'object',
        properties: {
          handle: {
            type: 'string',
            description: 'Username (with or without @).',
          },
          reportId: {
            type: 'string',
            description: 'Optional specific report id.',
          },
        },
        required: ['handle'],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'intel_get_edges',
      description: 'Fetch network edges (mentions/quotes/replies) for a handle, highest weight first.',
      parameters: {
        type: 'object',
        properties: {
          handle: {
            type: 'string',
            description: 'Username (with or without @).',
          },
          limit: {
            type: 'number',
            description: 'Max edges (default 20).',
          },
        },
        required: ['handle'],
        additionalProperties: false,
      },
    },
  },
]

export interface IntelToolContext {
  snapshot: IntelSnapshot
  scope: ComposeScope
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

function asStringArray(v: unknown): string[] | undefined {
  if (!Array.isArray(v)) return undefined
  const out = v.filter((x): x is string => typeof x === 'string')
  return out.length > 0 ? out : undefined
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

function requireHandle(args: Record<string, unknown>): string {
  const handle = asString(args.handle)
  if (!handle) throw new Error('handle is required')
  return handle
}

function runTool(name: string, args: Record<string, unknown>, ctx: IntelToolContext): unknown {
  const { snapshot, scope } = ctx

  switch (name) {
    case 'intel_list_subjects':
      return listSubjects(snapshot, scope)

    case 'intel_glob': {
      const pattern = asString(args.pattern)
      if (!pattern) throw new Error('pattern is required')
      return globIntel(snapshot, scope, pattern)
    }

    case 'intel_grep': {
      const query = asString(args.query)
      if (!query) throw new Error('query is required')
      const types = asStringArray(args.types) as GrepContentType[] | undefined
      return grepIntel(snapshot, scope, {
        query,
        types,
        handle: asString(args.handle),
        since: asString(args.since),
        until: asString(args.until),
        limit: asNumber(args.limit),
      })
    }

    case 'intel_get_profile':
      return getProfile(snapshot, scope, requireHandle(args))

    case 'intel_get_posts': {
      const handle = requireHandle(args)
      const sourceRaw = asString(args.source)
      const source =
        sourceRaw === 'posts' || sourceRaw === 'bookmarks' || sourceRaw === 'likes'
          ? sourceRaw
          : undefined
      return getPosts(snapshot, scope, {
        handle,
        source,
        since: asString(args.since),
        until: asString(args.until),
        limit: asNumber(args.limit),
        ids: asStringArray(args.ids),
      })
    }

    case 'intel_get_report':
      return getReport(snapshot, scope, {
        handle: requireHandle(args),
        reportId: asString(args.reportId),
      })

    case 'intel_get_edges':
      return getEdges(snapshot, scope, {
        handle: requireHandle(args),
        limit: asNumber(args.limit),
      })

    default:
      return { error: `Unknown tool: ${name}` }
  }
}

/**
 * Execute one compose intel tool against a library snapshot.
 * Unknown tools and thrown errors become `{ error: string }`.
 */
export function executeIntelTool(
  name: string,
  args: Record<string, unknown>,
  ctx: IntelToolContext,
): unknown {
  try {
    const result = runTool(name, args ?? {}, ctx)
    if (result && typeof result === 'object' && 'error' in result && Object.keys(result as object).length === 1) {
      return result
    }
    return maybeTruncate(result)
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) }
  }
}
