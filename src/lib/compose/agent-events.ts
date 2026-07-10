// Structured agent activity events for the compose chat — powers the
// Cursor-style step-by-step timeline (human-readable labels, live status,
// collapsed summaries) instead of raw tool-name strings.

export type AgentEventStatus = 'running' | 'done' | 'error'

export interface AgentEvent {
  id: string
  /** Completed-step label (past tense), e.g. "Searched library for \"privacy\"". */
  label: string
  /** Live status while running (progressive), e.g. "Searching library for \"privacy\"". */
  progressLabel: string
  /** Short result summary once done, e.g. "12 hits" or "3 posts". */
  detail?: string
  status: AgentEventStatus
  /** Epoch ms — lets the UI show elapsed time for long steps. */
  startedAt: number
}

function q(s: unknown): string {
  return typeof s === 'string' && s ? `"${s.length > 40 ? s.slice(0, 40) + '…' : s}"` : ''
}

function handleOf(args: Record<string, unknown>): string {
  const h = typeof args.handle === 'string' ? args.handle : ''
  return h ? (h.startsWith('@') ? h : `@${h}`) : ''
}

/** Live status while a tool runs — progressive tense ("Reading…", "Searching…"). */
export function describeToolProgress(name: string, args: Record<string, unknown>): string {
  switch (name) {
    case 'intel_list_subjects':
      return 'Listing library subjects'
    case 'intel_glob':
      return `Browsing library ${q(args.pattern) || 'paths'}`
    case 'intel_grep':
      return `Searching library for ${q(args.query) || 'terms'}`
    case 'intel_get_profile':
      return `Reading profile ${handleOf(args)}`.trim()
    case 'intel_get_posts': {
      const src = typeof args.source === 'string' && args.source !== 'posts' ? args.source : 'posts'
      return `Reading ${handleOf(args)} ${src}`.trim()
    }
    case 'intel_get_report':
      return `Reading intel report for ${handleOf(args)}`.trim()
    case 'intel_get_edges':
      return `Mapping network edges for ${handleOf(args)}`.trim()
    case 'compose_history_list':
      return 'Listing past post chats'
    case 'compose_history_grep':
      return `Searching past chats for ${q(args.query) || 'terms'}`
    case 'compose_history_glob':
      return `Browsing chat history ${q(args.pattern) || 'paths'}`
    case 'compose_history_get':
      return 'Reading a past post chat'
    default:
      return name.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase())
  }
}

/** Completed-step label — past tense ("Read…", "Searched…"). */
export function describeToolCall(name: string, args: Record<string, unknown>): string {
  switch (name) {
    case 'intel_list_subjects':
      return 'Listed library subjects'
    case 'intel_glob':
      return `Browsed library ${q(args.pattern) || 'paths'}`
    case 'intel_grep':
      return `Searched library for ${q(args.query) || 'terms'}`
    case 'intel_get_profile':
      return `Read profile ${handleOf(args)}`.trim()
    case 'intel_get_posts': {
      const src = typeof args.source === 'string' && args.source !== 'posts' ? args.source : 'posts'
      return `Read ${handleOf(args)} ${src}`.trim()
    }
    case 'intel_get_report':
      return `Read intel report for ${handleOf(args)}`.trim()
    case 'intel_get_edges':
      return `Mapped network edges for ${handleOf(args)}`.trim()
    case 'compose_history_list':
      return 'Listed past post chats'
    case 'compose_history_grep':
      return `Searched past chats for ${q(args.query) || 'terms'}`
    case 'compose_history_glob':
      return `Browsed chat history ${q(args.pattern) || 'paths'}`
    case 'compose_history_get':
      return 'Read a past post chat'
    default:
      // Fallback: de-snake the raw name ("intel_grep" → "Intel grep").
      return name.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase())
  }
}

/** Short human summary of a tool result, e.g. "12 hits" / "no matches". */
export function describeToolResult(name: string, result: unknown): string | undefined {
  if (result && typeof result === 'object') {
    const obj = result as Record<string, unknown>
    if (typeof obj.error === 'string') return 'failed'
    // Common shapes: arrays or { data / hits / posts / threads / paths: [] }
    const arr =
      (Array.isArray(result) && result) ||
      (Array.isArray(obj.data) && obj.data) ||
      (Array.isArray(obj.hits) && obj.hits) ||
      (Array.isArray(obj.posts) && obj.posts) ||
      (Array.isArray(obj.threads) && obj.threads) ||
      (Array.isArray(obj.paths) && obj.paths) ||
      (Array.isArray(obj.subjects) && obj.subjects) ||
      (Array.isArray(obj.edges) && obj.edges) ||
      null
    if (arr) {
      if (arr.length === 0) return 'no matches'
      const noun = nounFor(name)
      return `${arr.length} ${noun}${arr.length === 1 ? '' : 's'}`
    }
  }
  return undefined
}

function nounFor(name: string): string {
  if (name === 'intel_grep' || name === 'compose_history_grep') return 'hit'
  if (name === 'intel_get_posts') return 'post'
  if (name === 'intel_get_edges') return 'edge'
  if (name === 'compose_history_list') return 'thread'
  if (name === 'intel_list_subjects') return 'subject'
  if (name === 'intel_glob' || name === 'compose_history_glob') return 'path'
  return 'result'
}

export function isToolError(result: unknown): boolean {
  return Boolean(
    result &&
      typeof result === 'object' &&
      typeof (result as Record<string, unknown>).error === 'string',
  )
}

let seq = 0
export function newAgentEventId(): string {
  seq += 1
  return `ae_${Date.now()}_${seq}`
}
