import type { MediaItem, Poll, PostDraft, PostSegment, PostTarget, ReplySettings } from './types'
import { emptySegment } from './types'

// The compose assistant embeds a structured draft in its reply as a fenced
// ```postdraft JSON block. We parse that out, normalize it into a partial
// PostDraft the store can apply, and hand back the message text with the block
// removed so the chat transcript stays clean and human-readable.

export interface ParsedDraftBlock {
  draft: Partial<PostDraft> | null
  visibleText: string
}

// Matches a ```postdraft … ``` fence (case-insensitive info string).
const FENCE_RE = /```[ \t]*postdraft[ \t]*\r?\n([\s\S]*?)```/i

function coerceString(v: unknown): string | undefined {
  return typeof v === 'string' ? v : undefined
}

function normalizeMedia(raw: unknown): MediaItem[] {
  if (!Array.isArray(raw)) return []
  const out: MediaItem[] = []
  for (const m of raw) {
    if (!m || typeof m !== 'object') continue
    const item = m as Record<string, unknown>
    const kind = item.kind
    if (kind !== 'image' && kind !== 'video' && kind !== 'gif') continue
    out.push({
      id: crypto.randomUUID(),
      kind,
      dataUrl: coerceString(item.dataUrl),
      altText: coerceString(item.altText),
    })
  }
  return out
}

function normalizePoll(raw: unknown): Poll | undefined {
  if (!raw || typeof raw !== 'object') return undefined
  const p = raw as Record<string, unknown>
  const options = Array.isArray(p.options)
    ? p.options.filter((o): o is string => typeof o === 'string')
    : []
  if (options.length < 2) return undefined
  const duration = typeof p.durationMinutes === 'number' ? p.durationMinutes : 1440
  return { options: options.slice(0, 4), durationMinutes: duration }
}

function normalizeSegments(raw: unknown): PostSegment[] {
  if (!Array.isArray(raw)) return []
  const out: PostSegment[] = []
  for (const s of raw) {
    if (typeof s === 'string') {
      out.push({ ...emptySegment(), text: s })
      continue
    }
    if (s && typeof s === 'object') {
      const seg = s as Record<string, unknown>
      out.push({
        id: crypto.randomUUID(),
        text: coerceString(seg.text) ?? '',
        media: normalizeMedia(seg.media),
        poll: normalizePoll(seg.poll),
      })
    }
  }
  return out
}

function normalizeTarget(raw: unknown): PostTarget | undefined {
  if (!raw || typeof raw !== 'object') return undefined
  const t = raw as Record<string, unknown>
  if (t.kind === 'reply' && typeof t.toPostId === 'string' && typeof t.toUsername === 'string') {
    return { kind: 'reply', toPostId: t.toPostId, toUsername: t.toUsername }
  }
  if (t.kind === 'quote' && typeof t.postId === 'string' && typeof t.username === 'string') {
    return { kind: 'quote', postId: t.postId, username: t.username }
  }
  if (t.kind === 'original') return { kind: 'original' }
  return undefined
}

const REPLY_SETTINGS: ReplySettings[] = ['everyone', 'following', 'mentionedUsers', 'subscribers', 'verified']

/**
 * Extract a `postdraft` block from an assistant message. Returns the normalized
 * partial draft (or null when absent/unparseable) and the message text with the
 * block stripped out.
 */
export function parseDraftBlock(assistantContent: string): ParsedDraftBlock {
  const match = assistantContent.match(FENCE_RE)
  if (!match) return { draft: null, visibleText: assistantContent }

  const visibleText = assistantContent.replace(FENCE_RE, '').replace(/\n{3,}/g, '\n\n').trim()

  let parsed: Record<string, unknown>
  try {
    parsed = JSON.parse(match[1].trim()) as Record<string, unknown>
  } catch {
    return { draft: null, visibleText }
  }

  const draft: Partial<PostDraft> = {}
  const segments = normalizeSegments(parsed.segments)
  if (segments.length > 0) draft.segments = segments
  const target = normalizeTarget(parsed.target)
  if (target) draft.target = target
  if (typeof parsed.longform === 'boolean') draft.longform = parsed.longform
  if (typeof parsed.madeWithAi === 'boolean') draft.madeWithAi = parsed.madeWithAi
  if (typeof parsed.replySettings === 'string' && REPLY_SETTINGS.includes(parsed.replySettings as ReplySettings)) {
    draft.replySettings = parsed.replySettings as ReplySettings
  }

  // Nothing usable parsed out — treat as no draft.
  if (Object.keys(draft).length === 0) return { draft: null, visibleText }

  return { draft, visibleText }
}
