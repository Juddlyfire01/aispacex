import type { VeniceModel } from '../../types/venice'

export const DEFAULT_CONTEXT_FALLBACK = 128_000
export const DEFAULT_BUDGET_PCT = 0.5

/** Auto-compress live transcript when estimated payload reaches this fraction of context. */
export const COMPRESS_THRESHOLD = 0.95

/** Reserve completion headroom when estimating chat+hot payload size. */
export const COMPLETION_RESERVE = 4_096

export function estimateTokens(text: string): number {
  if (!text) return 0
  return Math.ceil(text.length / 4)
}

/** Rough token count for a chat message list (roles ignored beyond a small per-msg fee). */
export function estimateMessagesTokens(
  messages: { content?: unknown }[],
  contentOf: (m: { content?: unknown }) => string = (m) =>
    typeof m.content === 'string' ? m.content : '',
): number {
  let n = 0
  for (const m of messages) n += estimateTokens(contentOf(m)) + 4
  return n
}

export function estimateChatPayloadTokens(
  system: string,
  messages: { content?: unknown }[],
  opts?: {
    contentOf?: (m: { content?: unknown }) => string
    completionReserve?: number
  },
): number {
  const contentOf =
    opts?.contentOf ?? ((m: { content?: unknown }) => (typeof m.content === 'string' ? m.content : ''))
  return (
    estimateTokens(system) +
    4 +
    estimateMessagesTokens(messages, contentOf) +
    (opts?.completionReserve ?? COMPLETION_RESERVE)
  )
}

export function shouldCompressPayload(estimatedTokens: number, contextLimit: number): boolean {
  if (contextLimit <= 0) return false
  return estimatedTokens >= contextLimit * COMPRESS_THRESHOLD
}

export type ContextUsageSegmentId =
  | 'system'
  | 'tools'
  | 'hot'
  | 'conversation'
  | 'reserve'

export interface ContextUsageSegment {
  id: ContextUsageSegmentId
  label: string
  tokens: number
  /** CSS color for bar + legend swatch. */
  color: string
}

export interface ContextUsageBreakdown {
  segments: ContextUsageSegment[]
  usedTokens: number
  contextLimit: number
  /** usedTokens / contextLimit (may exceed 1). */
  pct: number
  messageCount: number
  coldArchiveCount: number
}

const SEGMENT_COLORS: Record<ContextUsageSegmentId, string> = {
  system: '#9ca3af',
  tools: '#a78bfa',
  hot: '#34d399',
  conversation: '#c4a484',
  reserve: '#60a5fa',
}

/**
 * Cursor-style context usage breakdown for the next compose send.
 * Heuristic (chars/4) — matches our compress/preflight estimates.
 */
export function estimateComposeContextBreakdown(opts: {
  system: string
  messages: { content?: unknown; role?: string }[]
  pendingUserText?: string
  hotText?: string
  /**
   * Prefer this when available (e.g. pack.estimatedTokens) so UI surfaces that
   * share the same pack don't diverge via a second estimateTokens(hotText).
   */
  hotTokens?: number
  /** JSON/string form of tool schemas sent with the request. */
  toolsJson?: string
  contextLimit: number
  coldArchiveCount?: number
  contentOf?: (m: { content?: unknown }) => string
}): ContextUsageBreakdown {
  const contentOf =
    opts.contentOf ??
    ((m: { content?: unknown }) => (typeof m.content === 'string' ? m.content : ''))

  const live = opts.messages.filter((m) => contentOf(m) !== '')
  const pending = opts.pendingUserText?.trim() ?? ''
  const hot = opts.hotText?.trim() ?? ''

  const systemTokens = estimateTokens(opts.system) + 4
  const toolsTokens = opts.toolsJson?.trim()
    ? estimateTokens(opts.toolsJson) + 4
    : 0
  const hotTokens =
    typeof opts.hotTokens === 'number' && opts.hotTokens >= 0
      ? opts.hotTokens
      : hot
        ? estimateTokens(hot) + 4
        : 0
  const conversationTokens =
    estimateMessagesTokens(live, contentOf) +
    (pending ? estimateTokens(pending) + 4 : 0)
  const reserveTokens = COMPLETION_RESERVE

  const allSegments: ContextUsageSegment[] = [
    { id: 'system', label: 'System prompt', tokens: systemTokens, color: SEGMENT_COLORS.system },
    { id: 'tools', label: 'Tool definitions', tokens: toolsTokens, color: SEGMENT_COLORS.tools },
    { id: 'hot', label: 'Hot window', tokens: hotTokens, color: SEGMENT_COLORS.hot },
    {
      id: 'conversation',
      label: 'Conversation',
      tokens: conversationTokens,
      color: SEGMENT_COLORS.conversation,
    },
    {
      id: 'reserve',
      label: 'Reply reserve',
      tokens: reserveTokens,
      color: SEGMENT_COLORS.reserve,
    },
  ]
  const segments = allSegments.filter((s) => s.tokens > 0)

  const usedTokens = segments.reduce((n, s) => n + s.tokens, 0)
  const contextLimit = opts.contextLimit > 0 ? opts.contextLimit : DEFAULT_CONTEXT_FALLBACK

  return {
    segments,
    usedTokens,
    contextLimit,
    pct: usedTokens / contextLimit,
    messageCount: live.length + (pending ? 1 : 0),
    coldArchiveCount: opts.coldArchiveCount ?? 0,
  }
}

/**
 * Estimate how full the model context will be on the next compose send
 * (system + live messages + optional pending user turn with hot prefix).
 * Returns 0–1 (may exceed 1 if already over).
 */
export function estimateComposeContextPct(opts: {
  system: string
  messages: { content?: unknown; role?: string }[]
  pendingUserText?: string
  hotText?: string
  toolsJson?: string
  contextLimit: number
  contentOf?: (m: { content?: unknown }) => string
}): number {
  return estimateComposeContextBreakdown(opts).pct
}

export function resolveContextLimit(model: VeniceModel | undefined | null): number {
  const n = model?.model_spec?.availableContextTokens
  if (typeof n === 'number' && n > 0) return n
  return DEFAULT_CONTEXT_FALLBACK
}

/** Reserved for system prompt, tool schemas, and short transcript headroom. */
export function reservedOverhead(contextLimit: number): number {
  return Math.min(8_000, Math.floor(contextLimit * 0.1))
}

export function clampBudgetPct(pct: number): number {
  if (Number.isNaN(pct)) return DEFAULT_BUDGET_PCT
  return Math.min(0.75, Math.max(0.25, pct))
}

export function computeHotBudget(contextLimit: number, budgetPct: number): number {
  const pct = clampBudgetPct(budgetPct)
  const usable = Math.max(0, contextLimit - reservedOverhead(contextLimit))
  return Math.floor(usable * pct)
}
