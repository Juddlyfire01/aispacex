/**
 * Auto-compress oversized compose transcripts into cold archives.
 * Live thread keeps a summary marker + recent turns; full text stacks in
 * compressArchives (newest first) for history search.
 */

import { venice, VeniceAPIError } from '../venice-client'
import type { VeniceModel } from '../../types/venice'
import { useVeniceCostStore } from '../../stores/venice-cost-store'
import { messageContentString } from './thread-meta'
import type { CompressArchive, ComposeMessage } from './thread-types'
import {
  COMPLETION_RESERVE,
  estimateChatPayloadTokens,
  shouldCompressPayload,
} from './token-estimate'

/** Keep at least this many live messages after a compress (incl. current turn). */
export const KEEP_RECENT_MIN = 6

/** Prefer leaving this many live when splitting (still ≥ KEEP_RECENT_MIN). */
export const KEEP_RECENT_PREFERRED = 12

const SUMMARY_MAX_TOKENS = 800

export function isContextOverflowError(err: unknown): boolean {
  if (err instanceof VeniceAPIError) {
    if (err.status === 413) return true
    if (err.status === 400) {
      const code = (err.code ?? '').toLowerCase()
      if (code === 'context_length_exceeded' || code === 'too_many_tokens') {
        return true
      }
      return /context.?length|too many tokens|maximum context|payload too large/i.test(err.message)
    }
    return false
  }
  if (err instanceof Error) {
    return /context.?length|too many tokens|maximum context|payload too large/i.test(err.message)
  }
  return false
}

export function newCompressArchiveId(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID()
  return `c_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`
}

/** How many trailing messages to keep live; force keeps fewer on overflow retry. */
export function keepRecentCount(total: number, forceAggressive: boolean): number {
  if (total <= KEEP_RECENT_MIN) return total
  if (forceAggressive) return KEEP_RECENT_MIN
  return Math.min(KEEP_RECENT_PREFERRED, Math.max(KEEP_RECENT_MIN, total - KEEP_RECENT_MIN))
}

export function splitMessagesForCompress(
  messages: ComposeMessage[],
  keepRecent: number,
): { toArchive: ComposeMessage[]; toKeep: ComposeMessage[] } {
  const keep = Math.max(0, Math.min(messages.length, keepRecent))
  if (messages.length <= keep) {
    return { toArchive: [], toKeep: messages }
  }
  return {
    toArchive: messages.slice(0, messages.length - keep),
    toKeep: messages.slice(messages.length - keep),
  }
}

export function buildCompressMarker(summary: string, archivedCount: number): ComposeMessage {
  return {
    role: 'assistant',
    content:
      `[Earlier conversation compressed — ${archivedCount} message${archivedCount === 1 ? '' : 's'} saved to cold history (searchable).]\n\n` +
      summary.trim(),
  }
}

function extractiveSummary(messages: ComposeMessage[]): string {
  const lines: string[] = []
  for (const m of messages) {
    const text = messageContentString(m).trim()
    if (!text) continue
    const clip = text.length > 180 ? `${text.slice(0, 180)}…` : text
    lines.push(`${m.role}: ${clip}`)
    if (lines.length >= 24) break
  }
  return lines.length > 0
    ? `Extractive continuity notes:\n${lines.join('\n')}`
    : 'Earlier turns were compressed; no text to summarize.'
}

function formatForSummarizer(messages: ComposeMessage[]): string {
  return messages
    .map((m) => {
      const text = messageContentString(m).trim()
      if (!text) return ''
      return `${m.role.toUpperCase()}:\n${text}`
    })
    .filter(Boolean)
    .join('\n\n')
}

/** Summarize archived turns for the live marker (LLM with extractive fallback). */
export async function summarizeForCompress(opts: {
  modelId: string
  modelSpec?: VeniceModel | null
  messages: ComposeMessage[]
  signal?: AbortSignal
}): Promise<string> {
  const transcript = formatForSummarizer(opts.messages)
  if (!transcript.trim()) return 'Earlier turns were compressed; no text to summarize.'

  try {
    const res = await venice<{
      choices?: { message?: { content?: string } }[]
      usage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number }
    }>('/chat/completions', {
      method: 'POST',
      body: JSON.stringify({
        model: opts.modelId,
        messages: [
          {
            role: 'system',
            content:
              'You compress compose-chat history for continuity. Write a dense continuity brief ' +
              '(max ~400 words): decisions, handles, draft direction, open questions, key facts. ' +
              'No preamble. Plain text only.',
          },
          {
            role: 'user',
            content: `Summarize these earlier turns for a future assistant that will only see this brief plus recent messages:\n\n${transcript}`,
          },
        ],
        stream: false,
        temperature: 0.2,
        max_tokens: SUMMARY_MAX_TOKENS,
      }),
      signal: opts.signal,
    })
    useVeniceCostStore.getState().addUsage(opts.modelSpec, res.usage)
    const text = res.choices?.[0]?.message?.content?.trim()
    if (text) return text
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') throw err
    // Fall through to extractive
  }
  return extractiveSummary(opts.messages)
}

export interface CompressPlan {
  archive: CompressArchive
  nextMessages: ComposeMessage[]
}

/**
 * Build archive + next live messages (marker + kept). Does not touch the store.
 * Returns null if there is nothing worth archiving.
 */
export async function planThreadCompress(opts: {
  messages: ComposeMessage[]
  modelId: string
  modelSpec?: VeniceModel | null
  forceAggressive?: boolean
  signal?: AbortSignal
  onStage?: (stage: CompressStage) => void
}): Promise<CompressPlan | null> {
  const keep = keepRecentCount(opts.messages.length, Boolean(opts.forceAggressive))
  const { toArchive, toKeep } = splitMessagesForCompress(opts.messages, keep)
  if (toArchive.length === 0) return null

  opts.onStage?.({ kind: 'read', messageCount: opts.messages.length, archiveCount: toArchive.length })

  opts.onStage?.({ kind: 'summarize' })
  const summary = await summarizeForCompress({
    modelId: opts.modelId,
    modelSpec: opts.modelSpec,
    messages: toArchive,
    signal: opts.signal,
  })

  const archive: CompressArchive = {
    id: newCompressArchiveId(),
    createdAt: new Date().toISOString(),
    summary,
    messageCount: toArchive.length,
    messages: toArchive.map(({ agentEvents: _ae, ...rest }) => rest),
  }

  opts.onStage?.({ kind: 'saved', archiveId: archive.id, messageCount: archive.messageCount })

  const marker = buildCompressMarker(summary, archive.messageCount)
  const nextMessages = [marker, ...toKeep]
  opts.onStage?.({ kind: 'rebuilt', keptCount: toKeep.length })

  return { archive, nextMessages }
}

export type CompressStage =
  | { kind: 'read'; messageCount: number; archiveCount: number }
  | { kind: 'summarize' }
  | { kind: 'saved'; archiveId: string; messageCount: number }
  | { kind: 'rebuilt'; keptCount: number }

export function payloadNeedsCompress(
  system: string,
  apiMessages: { content?: unknown }[],
  contextLimit: number,
): boolean {
  const tokens = estimateChatPayloadTokens(system, apiMessages, {
    completionReserve: COMPLETION_RESERVE,
  })
  return shouldCompressPayload(tokens, contextLimit)
}
