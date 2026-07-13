// Draft writer: when Draft model ≠ Same as main, research agent calls
// compose_write_draft; the separate writer streams copy into the Draft drawer
// with brief + conversation history. Same as main writes via ```postdraft.

import type { ToolDefinition } from '../../types/venice'
import type { PreferredFormat } from './format'
import type { PostTarget } from './types'

/** Persisted sentinel — draft writer uses the research/main model id. */
export const DRAFT_MODEL_SAME = 'same' as const
export type DraftModelSetting = typeof DRAFT_MODEL_SAME | (string & {})

export const COMPOSE_WRITE_DRAFT_TOOL_NAME = 'compose_write_draft'

export interface DraftWriteBrief {
  brief: string
  target?: PostTarget
  longform?: boolean
  notes?: string
  /** Injected from compose settings — not from the tool schema. */
  preferredFormat?: PreferredFormat
}

export const COMPOSE_WRITE_DRAFT_TOOL: ToolDefinition = {
  type: 'function',
  function: {
    name: COMPOSE_WRITE_DRAFT_TOOL_NAME,
    description:
      'Write publishable X copy into the Draft drawer via the separate draft-writer model. The research conversation history is attached automatically — pass a dense brief of priorities and must-include/must-avoid (not the full manuscript or full chat). Call ONLY when the user asks to draft/write/revise a post, reply, quote, thread, long-form tweet, or Article. Do NOT call for research, analysis, finding posts, or reply-target suggestions — answer those in chat. Do not emit a postdraft fence. For Articles still use this tool; do not set longform true.',
    parameters: {
      type: 'object',
      properties: {
        brief: {
          type: 'string',
          description:
            'Dense writing brief: intent, key facts/metrics, @handles, must-include / must-avoid. Include short voice cues when a register is active (cadence, devices, metric density) — the writer also receives the full REGISTER block. For articles include section outline. Do not include image/cover prompts here — those stay in chat.',
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
            'Allow Premium long-form tweet (>280). Do NOT set true for X Articles — Articles are a separate format controlled by the user preference.',
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

export function parseDraftWriteBrief(args: Record<string, unknown>): DraftWriteBrief {
  const brief = typeof args.brief === 'string' ? args.brief.trim() : ''
  const notes = typeof args.notes === 'string' ? args.notes.trim() : undefined
  const longform = typeof args.longform === 'boolean' ? args.longform : undefined
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
  return { brief, target, longform, notes }
}

/**
 * True when Draft model is a distinct Venice id — research agent must call
 * compose_write_draft (brief + conversation history). Same as main writes in
 * chat via ```postdraft with no handoff.
 */
export function isSeparateDraftModel(draftModel: string | undefined | null): boolean {
  return Boolean(draftModel && draftModel !== DRAFT_MODEL_SAME)
}

/** Handoff path only when a separate draft writer is selected. */
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
