// Draft-writer handoff: main model calls compose_write_draft; a second model
// streams post copy into the drawer while chat continues.

import type { ToolDefinition } from '../../types/venice'
import type { PreferredFormat } from './format'
import type { PostTarget } from './types'

/** Persisted sentinel — main model writes postdraft itself. */
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
      'Hand off post/reply/quote/thread/article/long-form copy to the draft writer model. Call when the user wants publishable X text. Pass a dense brief (angle, key facts, handles, constraints, optional cover image prompt). Do NOT emit a postdraft fence yourself — the writer fills the draft drawer. When the user prefers Articles, still call this tool; do not paste the full article into chat.',
    parameters: {
      type: 'object',
      properties: {
        brief: {
          type: 'string',
          description:
            'Dense writing brief: intent, key facts/metrics, @handles, tone notes, must-include / must-avoid. For articles include section outline. Do not include image/cover prompts here — those stay in chat.',
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
          description: 'Hard constraints e.g. keep under 280, include NFA, ranking format.',
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

export function isDraftHandoffEnabled(draftModel: string | undefined | null): boolean {
  return Boolean(draftModel && draftModel !== DRAFT_MODEL_SAME)
}
