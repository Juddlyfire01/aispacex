import type { ComposeScope } from '../intel-library/types'
import type { ComposeThread } from './thread-types'
import { messageContentString, scopeToPathSegment } from './thread-meta'

export interface HistorySnapshot {
  /** Threads in `threadOrder` (newest-first preferred). */
  threads: ComposeThread[]
}

export interface ThreadSummary {
  id: string
  context: ComposeScope
  title: string
  preview: string
  updatedAt: string
  tokenEstimate: number
  messageCount: number
}

export interface HistoryGrepHit {
  threadId: string
  title: string
  role: string
  index: number
  snippet: string
}

export function buildHistorySnapshot(
  threads: Record<string, ComposeThread>,
  order: string[],
): HistorySnapshot {
  const list = order.map((id) => threads[id]).filter((t): t is ComposeThread => Boolean(t))
  return { threads: list }
}

function toSummary(t: ComposeThread): ThreadSummary {
  return {
    id: t.id,
    context: t.context,
    title: t.title,
    preview: t.preview,
    updatedAt: t.updatedAt,
    tokenEstimate: t.tokenEstimate,
    messageCount: t.messages.length,
  }
}

export function listThreads(
  snap: HistorySnapshot,
  opts?: { query?: string; contextType?: ComposeScope['type']; limit?: number },
): ThreadSummary[] {
  let rows = snap.threads
  if (opts?.contextType) rows = rows.filter((t) => t.context.type === opts.contextType)
  if (opts?.query?.trim()) {
    const q = opts.query.toLowerCase()
    rows = rows.filter(
      (t) =>
        t.title.toLowerCase().includes(q) ||
        t.preview.toLowerCase().includes(q) ||
        t.messages.some((m) => messageContentString(m).toLowerCase().includes(q)),
    )
  }
  const limit = Math.min(100, Math.max(1, opts?.limit ?? 50))
  return rows.slice(0, limit).map(toSummary)
}

export function grepHistory(
  snap: HistorySnapshot,
  opts: { query: string; threadId?: string; limit?: number },
): HistoryGrepHit[] {
  const terms = opts.query.toLowerCase().split(/\s+/).filter(Boolean)
  if (terms.length === 0) return []
  const limit = Math.min(50, Math.max(0, opts.limit ?? 20))
  if (limit === 0) return []

  const hits: HistoryGrepHit[] = []
  for (const t of snap.threads) {
    if (opts.threadId && t.id !== opts.threadId) continue
    for (let index = 0; index < t.messages.length; index++) {
      if (hits.length >= limit) break
      const m = t.messages[index]!
      const raw = messageContentString(m)
      const hay = raw.toLowerCase()
      if (!terms.every((term) => hay.includes(term))) continue
      hits.push({
        threadId: t.id,
        title: t.title,
        role: m.role,
        index,
        snippet: raw.length > 200 ? `${raw.slice(0, 200)}…` : raw,
      })
    }
    if (hits.length >= limit) break
  }
  return hits
}

/** Convert a simple glob with `*` and `**` into a RegExp. */
function globToRegExp(pattern: string): RegExp {
  let i = 0
  let out = '^'
  while (i < pattern.length) {
    const c = pattern[i]!
    if (c === '*' && pattern[i + 1] === '*') {
      if (pattern[i + 2] === '/') {
        out += '(?:.*/)?'
        i += 3
      } else {
        out += '.*'
        i += 2
      }
      continue
    }
    if (c === '*') {
      out += '[^/]*'
      i += 1
      continue
    }
    if (c === '?') {
      out += '[^/]'
      i += 1
      continue
    }
    if ('\\.[]{}()+-^$|'.includes(c)) {
      out += '\\' + c
    } else {
      out += c
    }
    i += 1
  }
  out += '$'
  return new RegExp(out)
}

function historyPath(t: ComposeThread): string {
  return `history/${scopeToPathSegment(t.context)}/${t.id}`
}

export function globHistory(
  snap: HistorySnapshot,
  pattern: string,
): { path: string; meta: ThreadSummary }[] {
  const re = globToRegExp(pattern)
  const out: { path: string; meta: ThreadSummary }[] = []
  for (const t of snap.threads) {
    const path = historyPath(t)
    if (re.test(path)) out.push({ path, meta: toSummary(t) })
  }
  return out
}

export function getThread(
  snap: HistorySnapshot,
  id: string,
  opts?: { maxMessages?: number },
): ComposeThread | { error: string } {
  const t = snap.threads.find((x) => x.id === id)
  if (!t) return { error: 'thread_not_found' }
  const max = opts?.maxMessages ?? 40
  if (t.messages.length <= max) return t
  return { ...t, messages: t.messages.slice(-max) }
}
