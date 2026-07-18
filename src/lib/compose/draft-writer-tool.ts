// Draft stage signal: research calls compose_write_draft with metadata only.
// A separate draft-stage completion continues the agent transcript (model may
// match research or differ). Same-as-main = same model id, still draft stage.

import type { ToolDefinition } from '../../types/venice'
import type { PreferredFormat, ResolvedFormat } from './format'
import type { PostTarget } from './types'

/** Persisted sentinel — draft stage uses the research/main model id. */
export const DRAFT_MODEL_SAME = 'same' as const
export type DraftModelSetting = typeof DRAFT_MODEL_SAME | (string & {})

export const COMPOSE_WRITE_DRAFT_TOOL_NAME = 'compose_write_draft'

/** Model-declared draft shape (Auto path) — same as ResolvedFormat. */
export type DraftWriteFormat = ResolvedFormat

export const DRAFT_WRITE_FORMATS: DraftWriteFormat[] = [
  'post',
  'thread',
  'longform',
  'article',
]

/** Metadata signal for the draft stage — not a knowledge brief. */
export interface DraftWriteBrief {
  /** Optional one-line directive (legacy `brief` / `notes` map here). */
  intent?: string
  target?: PostTarget
  longform?: boolean
  /**
   * Format the research model chose for this write (especially when preference
   * is Auto). Locked user preferences still win via resolveDraftWriteFormat.
   */
  format?: DraftWriteFormat
  /** Injected from compose settings — not from the tool schema. */
  preferredFormat?: PreferredFormat
}

export const COMPOSE_WRITE_DRAFT_TOOL: ToolDefinition = {
  type: 'function',
  function: {
    name: COMPOSE_WRITE_DRAFT_TOOL_NAME,
    description:
      'Start the draft stage: publishable X copy streams into the Draft drawer. The draft stage continues this conversation transcript automatically — pass metadata only (format, target, optional one-line intent). Do NOT pass a dense knowledge brief or the manuscript. Call ONLY when the user asks to draft/write/revise a post, reply, quote, thread, long-form tweet, or Article. Do NOT call for research, analysis, finding posts, or reply-target suggestions — answer those in chat. Never paste the draft copy into chat yourself. When Preferred format is Auto, pass format (post|thread|longform|article). For Articles use format:"article"; do not set longform true.',
    parameters: {
      type: 'object',
      properties: {
        intent: {
          type: 'string',
          description:
            'Optional one-line directive only (e.g. "reply lever on the end", "≤280"). Facts stay in the conversation — do not re-tell research.',
        },
        brief: {
          type: 'string',
          description:
            'Deprecated alias for intent. Prefer intent. If provided, treated as a one-line directive only.',
        },
        format: {
          type: 'string',
          enum: ['post', 'thread', 'longform', 'article'],
          description:
            'Draft shape. Required when Preferred format is Auto. Use article for X Articles; longform only for a Premium long-form tweet.',
        },
        target: {
          type: 'object',
          description: 'Post target. Default original. Ignored for Articles.',
          properties: {
            kind: { type: 'string', enum: ['original', 'reply', 'quote'] },
            toPostId: { type: 'string' },
            toUsername: { type: 'string' },
            postId: { type: 'string' },
            username: { type: 'string' },
          },
        },
        longform: {
          type: 'boolean',
          description:
            'Allow Premium long-form tweet (>280). Prefer format:"longform". Do NOT set true for X Articles — use format:"article".',
        },
        notes: {
          type: 'string',
          description:
            'Deprecated. Optional one-line constraint; merged into intent if intent is empty.',
        },
      },
      additionalProperties: false,
    },
  },
}

function parseDraftWriteFormat(raw: unknown): DraftWriteFormat | undefined {
  return typeof raw === 'string' && (DRAFT_WRITE_FORMATS as string[]).includes(raw)
    ? (raw as DraftWriteFormat)
    : undefined
}

export function parseDraftWriteBrief(args: Record<string, unknown>): DraftWriteBrief {
  const intentRaw =
    (typeof args.intent === 'string' && args.intent.trim()) ||
    (typeof args.brief === 'string' && args.brief.trim()) ||
    (typeof args.notes === 'string' && args.notes.trim()) ||
    ''
  // Cap legacy dense briefs so they cannot replace the transcript as knowledge.
  const intent = intentRaw.length > 280 ? `${intentRaw.slice(0, 277)}…` : intentRaw || undefined
  const longform = typeof args.longform === 'boolean' ? args.longform : undefined
  const format = parseDraftWriteFormat(args.format)
  let target: PostTarget | undefined
  const raw = args.target
  if (raw && typeof raw === 'object') {
    const t = raw as Record<string, unknown>
    if (t.kind === 'reply' && typeof t.toPostId === 'string' && typeof t.toUsername === 'string') {
      target = { kind: 'reply', toPostId: t.toPostId, toUsername: t.toUsername }
    } else if (t.kind === 'quote' && typeof t.postId === 'string' && typeof t.username === 'string') {
      target = { kind: 'quote', postId: t.postId, username: t.username }
    } else if (t.kind === 'original') {
      target = { kind: 'original' }
    }
  }
  return { ...(intent ? { intent } : {}), target, longform, ...(format ? { format } : {}) }
}

/**
 * Resolve the concrete draft shape for a write.
 * Locked user preference wins; under Auto, honor the model's format (or longform flag).
 */
export function resolveDraftWriteFormat(
  preferred: PreferredFormat | undefined | null,
  toolFormat?: DraftWriteFormat | null,
  longform?: boolean | null,
): DraftWriteFormat {
  if (preferred && preferred !== 'auto') return preferred
  if (toolFormat) return toolFormat
  if (longform) return 'longform'
  return 'post'
}

/**
 * True when Draft model is a distinct Venice id (not "Same as main").
 * Does not change lifecycle — draft stage is always separate.
 */
export function isSeparateDraftModel(draftModel: string | undefined | null): boolean {
  return Boolean(draftModel && draftModel !== DRAFT_MODEL_SAME)
}

/**
 * Draft stage always runs as a separate completion when drafting is enabled.
 * @deprecated Prefer always wiring onDraftHandoff; kept for call-site clarity.
 */
export function isDraftHandoffEnabled(_draftModel?: string | null): boolean {
  return true
}

/** Resolve the Venice model id the draft stage should call. */
export function resolveDraftWriterModelId(
  draftModel: string | undefined | null,
  mainModel: string,
): string {
  if (!draftModel || draftModel === DRAFT_MODEL_SAME) return mainModel
  return draftModel
}

/** Timeline labels for compose_write_draft / draft-stage streaming. */
export function describeDraftWriteLabels(opts: {
  article: boolean
}): { progressLabel: string; label: string } {
  return opts.article
    ? {
        progressLabel: 'Handing off to article writer',
        label: 'Handed off to article writer',
      }
    : {
        progressLabel: 'Handing off to draft writer',
        label: 'Handed off to draft writer',
      }
}
