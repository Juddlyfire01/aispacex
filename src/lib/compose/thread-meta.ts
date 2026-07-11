import type { ChatMessage } from '../../types/venice'
import type { ComposeScope } from '../intel-library/types'
import type { ComposeThread } from './thread-types'
import type { PostDraft } from './types'
import { serializeDraftForCopy } from './serialize'
import { estimateTokens } from './token-estimate'

export function autoTitleFromUserText(text: string): string {
  const t = text.replace(/\s+/g, ' ').trim()
  if (!t) return 'New chat'
  return t.length <= 60 ? t : t.slice(0, 60)
}

export function contextBadgeLabel(scope: ComposeScope): string {
  if (scope.type === 'me') return 'You'
  if (scope.type === 'all') return 'All'
  return `@${scope.username.replace(/^@/, '')}`
}

export function scopeToPathSegment(scope: ComposeScope): string {
  if (scope.type === 'me') return 'me'
  if (scope.type === 'all') return 'all'
  return `target/@${scope.username.replace(/^@/, '')}`
}

export function messageContentString(m: { content?: unknown }): string {
  if (typeof m.content === 'string') return m.content
  if (m.content == null) return ''
  if (Array.isArray(m.content)) {
    return m.content
      .map((p) => (p && typeof p === 'object' && 'text' in p ? String((p as { text?: string }).text ?? '') : ''))
      .join(' ')
  }
  return ''
}

export function messagePreview(messages: ChatMessage[]): string {
  const firstUser = messages.find((m) => m.role === 'user')
  if (firstUser) {
    const t = messageContentString(firstUser).replace(/\s+/g, ' ').trim()
    if (t) return t.length <= 80 ? t : `${t.slice(0, 80)}…`
  }
  return 'New chat'
}

export function estimateThreadTokens(messages: ChatMessage[], draft: PostDraft): number {
  const msgText = messages.map(messageContentString).join('\n')
  const draftText = draft.segments.map((s) => s.text).join('\n')
  return estimateTokens(msgText + '\n' + draftText)
}

export function formatTokenCount(n: number): string {
  if (n < 1000) return `~${n}`
  const k = n / 1000
  const rounded = k >= 10 ? Math.round(k) : Math.round(k * 10) / 10
  return `~${rounded}k`
}

/** Simple relative time; pass `now` for tests. */
export function formatRelativeTime(iso: string, now: Date = new Date()): string {
  const t = Date.parse(iso)
  if (Number.isNaN(t)) return ''
  const sec = Math.max(0, Math.floor((now.getTime() - t) / 1000))
  if (sec < 60) return 'just now'
  const min = Math.floor(sec / 60)
  if (min < 60) return `${min}m ago`
  const hr = Math.floor(min / 60)
  if (hr < 48) return `${hr}h ago`
  const day = Math.floor(hr / 24)
  if (day < 14) return `${day}d ago`
  return iso.slice(0, 10)
}

/** Local calendar day key `YYYY-MM-DD` for an ISO timestamp. */
export function localDayKey(iso: string, now: Date = new Date()): string {
  const t = Date.parse(iso)
  const d = Number.isNaN(t) ? now : new Date(t)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/**
 * Day divider label for history rail: Today / Yesterday / `Mon D, YYYY`.
 * Pass `now` for tests. Uses local calendar days.
 */
export function formatDayLabel(iso: string, now: Date = new Date()): string {
  const t = Date.parse(iso)
  if (Number.isNaN(t)) return ''
  const d = new Date(t)
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const startOfDay = new Date(d.getFullYear(), d.getMonth(), d.getDate())
  const diffDays = Math.round(
    (startOfToday.getTime() - startOfDay.getTime()) / 86_400_000,
  )
  if (diffDays === 0) return 'Today'
  if (diffDays === 1) return 'Yesterday'
  return d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

export type DayGroup<T extends { updatedAt: string }> = {
  label: string
  dayKey: string
  threads: T[]
}

/**
 * Group a newest-first thread list into local calendar-day buckets of `updatedAt`.
 * Preserves input order; consecutive same-day items share one group.
 */
export function groupThreadsByDay<T extends { updatedAt: string }>(
  threads: T[],
  now: Date = new Date(),
): DayGroup<T>[] {
  const groups: DayGroup<T>[] = []
  let current: DayGroup<T> | null = null
  for (const thread of threads) {
    const dayKey = localDayKey(thread.updatedAt, now)
    const label = formatDayLabel(thread.updatedAt, now)
    if (!current || current.dayKey !== dayKey) {
      current = { label, dayKey, threads: [] }
      groups.push(current)
    }
    current.threads.push(thread)
  }
  return groups
}

export function recomputeThreadMeta(input: {
  messages: ChatMessage[]
  draft: PostDraft
  title: string
  now?: Date
}): { title: string; preview: string; tokenEstimate: number; updatedAt: string } {
  const now = input.now ?? new Date()
  const preview = messagePreview(input.messages)
  let title = input.title
  if (!title || title === 'New chat') {
    const firstUser = input.messages.find((m) => m.role === 'user')
    if (firstUser) title = autoTitleFromUserText(messageContentString(firstUser))
  }
  return {
    title,
    preview,
    tokenEstimate: estimateThreadTokens(input.messages, input.draft),
    updatedAt: now.toISOString(),
  }
}

export type ThreadExportFormat = 'md' | 'json'

/** Markdown dump of a compose thread (chat + draft) for local download. */
export function threadToMarkdown(thread: ComposeThread): string {
  const badge = contextBadgeLabel(thread.context)
  const lines: string[] = [
    `# ${thread.title || 'Compose chat'}`,
    '',
    `_Context: ${badge} · Updated: ${thread.updatedAt}_`,
    '',
  ]

  for (const m of thread.messages) {
    const heading =
      m.role === 'user' ? 'You' : m.role === 'assistant' ? 'Assistant' : m.role === 'system' ? 'System' : m.role
    lines.push(`## ${heading}`, messageContentString(m), '')
  }

  const draftBody = serializeDraftForCopy(thread.draft).trim()
  if (draftBody) {
    lines.push('## Draft', draftBody, '')
  }

  lines.push('---', '', '_Exported from AISpaceX Compose_')
  return lines.join('\n')
}

/**
 * Full-fidelity JSON for backup / future reimport.
 * Wraps the thread so consumers can version the envelope without mutating the store shape.
 */
export function threadToJson(thread: ComposeThread): string {
  return JSON.stringify(
    {
      exportedAt: new Date().toISOString(),
      source: 'aispacex-compose',
      version: 1,
      thread,
    },
    null,
    2,
  )
}

/** Safe filename from thread title. */
export function threadExportFilename(thread: ComposeThread, format: ThreadExportFormat = 'md'): string {
  const base = (thread.title || thread.preview || 'compose-chat')
    .replace(/[^a-z0-9-_]+/gi, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase()
  const stem = base || 'compose-chat'
  return format === 'json' ? `${stem}.json` : `${stem}.md`
}

export function downloadThread(thread: ComposeThread, format: ThreadExportFormat): void {
  const content = format === 'json' ? threadToJson(thread) : threadToMarkdown(thread)
  const mime = format === 'json' ? 'application/json' : 'text/markdown'
  const blob = new Blob([content], { type: mime })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = threadExportFilename(thread, format)
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
