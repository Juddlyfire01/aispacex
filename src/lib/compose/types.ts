// The PostDraft is the single source of truth for the Compose workspace: the
// chat writes into it, the composer edits it, and the Post action serializes it
// to X. It models exactly what X's composer supports — nothing more (parity,
// not creativity) — so a draft is always postable-by-construction.

import type { DraftRegister, RegisterDefault } from './register'
import { draftRegisterFromDefault, DEFAULT_REGISTER_DEFAULT } from './register'

export type { DraftRegister, RegisterDefault, RegisterMode, RegisterPack } from './register'

export const TWEET_LIMIT = 280
export const LONGFORM_LIMIT = 25000

/** A single attached media item. `dataUrl` is the local preview; `mediaId` is
 * populated once uploaded to X (native posting). */
export interface MediaItem {
  id: string
  kind: 'image' | 'video' | 'gif'
  dataUrl?: string
  mediaId?: string
  altText?: string
}

/** A poll attached to a segment. X allows 2–4 options. */
export interface Poll {
  options: string[]
  durationMinutes: number
}

/** One post in a (possibly single-post) thread. */
export interface PostSegment {
  id: string
  text: string
  media: MediaItem[]
  poll?: Poll
}

/** What the draft is relative to X: a standalone post, a reply, or a quote. */
export type PostTarget =
  | { kind: 'original' }
  | { kind: 'reply'; toPostId: string; toUsername: string }
  | { kind: 'quote'; postId: string; username: string }

export type ReplySettings = 'everyone' | 'following' | 'mentionedUsers' | 'subscribers' | 'verified'

export interface ArticleDraft {
  title: string
  bodyMarkdown: string
  contentState?: unknown
  cover?: MediaItem
  inlineMedia: MediaItem[]
  /**
   * Cover/illustration prompt for the article — not published as article body.
   * Populated from writer `---IMAGE_PROMPT---` sections or the ArticleComposer field.
   */
  imagePrompt?: string
}

export interface PostDraft {
  id: string
  segments: PostSegment[]
  target: PostTarget
  /** When true, segments may run up to LONGFORM_LIMIT (Premium renders these). */
  longform: boolean
  /** Sets X's `made_with_ai` label on the created post. */
  madeWithAi: boolean
  replySettings?: ReplySettings
  /** Linguistic register for the next compose turn (style transfer). */
  register?: DraftRegister
  /** Optional X Articles payload (title + body + media). */
  article?: ArticleDraft
  createdAt: string
  updatedAt: string
}

function newId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID()
  return `c_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
}

export function emptySegment(): PostSegment {
  return { id: newId(), text: '', media: [] }
}

export function emptyArticleDraft(): ArticleDraft {
  return { title: '', bodyMarkdown: '', inlineMedia: [] }
}

export function emptyDraft(
  target: PostTarget = { kind: 'original' },
  opts?: { longform?: boolean; registerDefault?: RegisterDefault },
): PostDraft {
  const now = new Date().toISOString()
  const registerDefault = opts?.registerDefault ?? DEFAULT_REGISTER_DEFAULT
  return {
    id: newId(),
    segments: [emptySegment()],
    target,
    longform: opts?.longform ?? true,
    madeWithAi: false,
    register: draftRegisterFromDefault(registerDefault),
    createdAt: now,
    updatedAt: now,
  }
}
