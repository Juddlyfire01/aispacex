import type { ChatMessage } from '../../types/venice'
import type { ComposeScope } from '../intel-library/types'
import type { PostDraft } from './types'
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

export function messageContentString(m: ChatMessage): string {
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
