// Draft writer: ALL drafting goes through compose_write_draft. The research
// agent calls the tool with a brief; a distinct draft model streams copy into
// the Draft drawer with brief + conversation history attached. Same as main
// continues the research agent turn — no separate writer fetch.
// There is no ```postdraft path — drafting always streams via the tool.

import type { ToolDefinition } from '../../types/venice'
import type { PreferredFormat, ResolvedFormat } from './format'
import type { PostTarget } from './types'

/** Persisted sentinel — draft writer uses the research/main model id. */
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

export interface DraftWriteBrief {
  brief: string
  target?: PostTarget
  longform?: boolean
  notes?: string
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
      'Write publishable X copy into the Draft drawer. This is the ONLY way to produce a draft — the copy streams live into the Draft drawer. The research conversation history is attached automatically, so pass a dense brief of priorities and must-include/must-avoid (not the full manuscript or full chat). Call ONLY when the user asks to draft/write/revise a post, reply, quote, thread, long-form tweet, or Article. Do NOT call for research, analysis, finding posts, or reply-target suggestions — answer those in chat. Never paste the draft copy into chat yourself. When Preferred format is Auto, pass format (post|thread|longform|article) for the shape you chose. For Articles use format:"article"; do not set longform true.',
    parameters: {
      type: 'object',
      properties: {
        brief: {
          type: 'string',
          description:
            'Dense writing brief: intent, key facts/metrics, @handles, must-include / must-avoid. Include short voice cues when a register is active (cadence, devices, metric density) — the writer also receives the full REGISTER block. For articles include section outline. Do not include image/cover prompts here — those stay in chat.',
        },
        format: {
          type: 'string',
          enum: ['post', 'thread', 'longform', 'article'],
          description:
            'Draft shape. Required when Preferred format is Auto — choose from the request (post / thread / longform / article). When the user locked a preference, omit or match that preference. Use article for X Articles (titled structured piece); use longform only for a Premium long-form tweet.',
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
            'Allow Premium long-form tweet (>280). Prefer format:"longform" instead. Do NOT set true for X Articles — use format:"article".',
        },
        notes: {
          type: 'string',
          description:
            'Hard constraints e.g. keep under 280, include NFA, ranking format, register reminders (terse, metric-stack, no hype).',
        },
      },
      required: ['brief'],
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
  const brief = typeof args.brief === 'string' ? args.brief.trim() : ''
  const notes = typeof args.notes === 'string' ? args.notes.trim() : undefined
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
  return { brief, target, longform, notes, ...(format ? { format } : {}) }
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
 */
export function isSeparateDraftModel(draftModel: string | undefined | null): boolean {
  return Boolean(draftModel && draftModel !== DRAFT_MODEL_SAME)
}

/**
 * True when compose_write_draft should spawn a separate writer fetch.
 * Same-as-main continues the research agent loop instead.
 */
export function isDraftHandoffEnabled(draftModel?: string | null): boolean {
  return isSeparateDraftModel(draftModel)
}

/** Resolve the Venice model id the draft writer should call. */
export function resolveDraftWriterModelId(
  draftModel: string | undefined | null,
  mainModel: string,
): string {
  if (!draftModel || draftModel === DRAFT_MODEL_SAME) return mainModel
  return draftModel
}

/** Timeline labels for compose_write_draft / writer streaming. */
export function describeDraftWriteLabels(opts: {
  sameModel: boolean
  article: boolean
}): { progressLabel: string; label: string } {
  if (opts.sameModel) {
    return opts.article
      ? { progressLabel: 'Writing article…', label: 'Wrote article' }
      : { progressLabel: 'Writing draft…', label: 'Wrote draft' }
  }
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
