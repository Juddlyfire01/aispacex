import { venice } from '../venice-client'
import { parseSSEStream } from '../stream'
import type {
  ChatCompletionChunk,
  ChatMessage,
  ToolCall,
  ToolDefinition,
  VeniceModel,
} from '../../types/venice'
import type { ComposeScope, IntelSnapshot } from '../intel-library/types'
import { useVeniceCostStore } from '../../stores/venice-cost-store'
import type { HistorySnapshot } from './history-library'
import { COMPOSE_HISTORY_TOOLS, executeHistoryTool } from './history-tools'
import { COMPOSE_INTEL_TOOLS, executeIntelTool } from './intel-tools'
import {
  COMPOSE_WRITE_DRAFT_TOOL,
  COMPOSE_WRITE_DRAFT_TOOL_NAME,
  parseDraftWriteBrief,
  type DraftWriteBrief,
} from './draft-writer-tool'
import { parseDraftBlock } from './draft-block'

export const MAX_TOOL_ROUNDS = 6

export interface ComposeAgentOpts {
  model: string
  /** Optional model object for USD pricing from usage. */
  modelSpec?: VeniceModel | null
  /** Includes system as first message. */
  messages: ChatMessage[]
  snapshot: IntelSnapshot
  historySnapshot: HistorySnapshot
  scope: ComposeScope
  xSearchOn: boolean
  /** Venice `enable_web_search` — off / auto / on. */
  webSearch?: 'off' | 'auto' | 'on'
  signal?: AbortSignal
  /**
   * Fired as soon as a tool name is known in the SSE stream (before args finish
   * and before execution) so the UI can leave "Thinking…" immediately.
   */
  onToolStart?: (info: { index: number; id: string; name: string }) => void
  /** Fired when a tool is about to execute with fully parsed args. */
  onTool?: (info: {
    index: number
    id: string
    name: string
    args: Record<string, unknown>
  }) => void
  /** Fired after a tool executes with its (untruncated-shape) result. */
  onToolResult?: (info: {
    index: number
    id: string
    name: string
    args: Record<string, unknown>
    result: unknown
  }) => void | Promise<void>
  /** Fired when a new model round starts (1-based). */
  onRoundStart?: (round: number) => void
  /**
   * Fired once when Venice returns web search hits (resultCount > 0).
   * No optimistic "searching" — the API only confirms search after the fact.
   */
  onWebSearch?: (info: { resultCount: number }) => void
  /** Fired for each content token as the final (or intermediate) answer streams. */
  onDelta?: (token: string) => void
  /**
   * When set, compose_write_draft is available. Called fire-and-forget when the
   * main model hands off — do not await; chat continues while the writer runs.
   */
  onDraftHandoff?: (brief: DraftWriteBrief) => void
  /**
   * Force the first round to call compose_write_draft (Article draft intents).
   * Later rounds use tool_choice auto so research tools still work after handoff.
   */
  forceDraftHandoff?: boolean
  /**
   * Fired when a round ends in tool_calls after any content was streamed —
   * clear the assistant placeholder so tool activity UI can take over.
   * Also fired early when the first tool_call appears mid-stream.
   */
  onContentReset?: () => void
}

function safeParseArgs(raw: string | undefined): Record<string, unknown> {
  if (!raw) return {}
  try {
    const parsed = JSON.parse(raw) as unknown
    return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {}
  } catch {
    return {}
  }
}

function contentAsString(content: ChatMessage['content']): string {
  if (content == null) return ''
  if (typeof content === 'string') return content
  return content
    .map((p) => (typeof p.text === 'string' ? p.text : ''))
    .filter(Boolean)
    .join('\n')
}

/** Merge OpenAI-style streamed tool_call deltas into complete ToolCall[]. */
export function accumulateStreamedToolCalls(
  acc: Map<number, ToolCall>,
  deltas: NonNullable<ChatCompletionChunk['choices'][0]['delta']['tool_calls']>,
): void {
  for (const part of deltas) {
    const index = part.index ?? 0
    const existing = acc.get(index)
    if (!existing) {
      acc.set(index, {
        id: part.id ?? `call_${index}`,
        type: 'function',
        function: {
          name: part.function?.name ?? '',
          arguments: part.function?.arguments ?? '',
        },
      })
      continue
    }
    if (part.id) existing.id = part.id
    if (part.function?.name) {
      existing.function.name = (existing.function.name || '') + part.function.name
    }
    if (part.function?.arguments) {
      existing.function.arguments += part.function.arguments
    }
  }
}

interface StreamedRound {
  content: string
  toolCalls: Array<{ index: number; call: ToolCall }>
  /** True if onContentReset already ran mid-stream for this round. */
  contentResetFired: boolean
  usage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number }
}

function countSearchResults(chunk: ChatCompletionChunk): number | null {
  const raw = chunk.venice_search_results
  if (Array.isArray(raw)) return raw.length
  if (raw && typeof raw === 'object') {
    const docs = (raw as { documents?: unknown[]; results?: unknown[] }).documents
      ?? (raw as { results?: unknown[] }).results
    if (Array.isArray(docs)) return docs.length
    return 1
  }
  const cites = chunk.venice_parameters?.web_search_citations
  if (Array.isArray(cites) && cites.length > 0) return cites.length
  return null
}

/**
 * One streaming chat/completions round with tools enabled.
 * Accumulates content + tool_calls from SSE deltas; reports content via onDelta
 * and announces tools via onToolStart as soon as names are known.
 */
async function streamComposeRound(
  opts: ComposeAgentOpts,
  messages: ChatMessage[],
  tools: ToolDefinition[],
  toolChoice: 'auto' | { type: 'function'; function: { name: string } } = 'auto',
): Promise<StreamedRound> {
  const webSearch = opts.webSearch ?? 'off'
  const webSearchEnabled = webSearch !== 'off'

  const stream = await venice<ReadableStream<Uint8Array>>('/chat/completions', {
    method: 'POST',
    body: JSON.stringify({
      model: opts.model,
      messages,
      stream: true,
      stream_options: { include_usage: true },
      temperature: 0.6,
      max_tokens: 4096,
      tools,
      tool_choice: toolChoice,
      venice_parameters: {
        enable_x_search: opts.xSearchOn,
        enable_web_search: webSearch,
        ...(webSearchEnabled
          ? {
              include_search_results_in_stream: true,
              enable_web_citations: true,
            }
          : {}),
      },
    }),
    stream: true,
    signal: opts.signal,
  })

  let content = ''
  const toolAcc = new Map<number, ToolCall>()
  const knownToolNames = new Set(tools.map((t) => t.function.name))
  const announcedToolStarts = new Set<number>()
  let toolsStarted = false
  let contentResetFired = false
  let usage: StreamedRound['usage']
  let webSearchAnnounced = false

  for await (const chunk of parseSSEStream(stream, { signal: opts.signal })) {
    if (chunk.usage) usage = chunk.usage

    const resultCount = countSearchResults(chunk)
    if (!webSearchAnnounced && resultCount != null && resultCount > 0) {
      webSearchAnnounced = true
      opts.onWebSearch?.({ resultCount })
    }

    const delta = chunk.choices[0]?.delta
    if (!delta) continue

    if (delta.content) {
      content += delta.content
      // Once tools are in flight, keep content for the API message but don't
      // drip preamble into the chat — activity UI owns the surface.
      if (!toolsStarted) opts.onDelta?.(delta.content)
    }
    if (delta.tool_calls?.length) {
      accumulateStreamedToolCalls(toolAcc, delta.tool_calls)
      for (const [index, call] of toolAcc) {
        if (announcedToolStarts.has(index)) continue
        const name = call.function.name
        if (!name) continue
        const argsStarted = (call.function.arguments?.length ?? 0) > 0
        // Name complete (known tool) or args already streaming → announce.
        if (!knownToolNames.has(name) && !argsStarted) continue

        announcedToolStarts.add(index)
        if (!toolsStarted) {
          toolsStarted = true
          if (content) {
            opts.onContentReset?.()
            contentResetFired = true
          }
        }
        opts.onToolStart?.({ index, id: call.id, name })
      }
    }
  }

  const toolCalls = [...toolAcc.entries()]
    .sort(([a], [b]) => a - b)
    .filter(([, c]) => c.id && c.function.name)
    .map(([index, call]) => ({ index, call }))

  return { content, toolCalls, contentResetFired, usage }
}

/**
 * Streaming multi-round tool loop for compose.
 * Surfaces tool intent as soon as SSE names arrive; final answer text is what
 * stays in the transcript after tool rounds.
 */
export async function runComposeAgent(
  opts: ComposeAgentOpts,
): Promise<{ content: string; toolCalls: number }> {
  const messages: ChatMessage[] = [...opts.messages]
  let toolCalls = 0
  const handoff = typeof opts.onDraftHandoff === 'function'
  const tools: ToolDefinition[] = [
    ...COMPOSE_INTEL_TOOLS,
    ...COMPOSE_HISTORY_TOOLS,
    ...(handoff ? [COMPOSE_WRITE_DRAFT_TOOL] : []),
  ]
  let lastContent = ''

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    if (opts.signal?.aborted) {
      throw new DOMException('Aborted', 'AbortError')
    }

    opts.onRoundStart?.(round + 1)

    const toolChoice =
      round === 0 && opts.forceDraftHandoff && handoff
        ? {
            type: 'function' as const,
            function: { name: COMPOSE_WRITE_DRAFT_TOOL_NAME },
          }
        : ('auto' as const)

    const { content, toolCalls: callEntries, contentResetFired, usage } =
      await streamComposeRound(opts, messages, tools, toolChoice)

    useVeniceCostStore.getState().addUsage(opts.modelSpec, usage)

    const calls = callEntries.map((e) => e.call)
    const assistantMsg: ChatMessage = {
      role: 'assistant',
      content: content || null,
      tool_calls: calls.length > 0 ? calls : undefined,
    }
    messages.push(assistantMsg)
    lastContent = content

    if (callEntries.length === 0) {
      const final = content.trim()
      // In handoff mode, strip any leaked postdraft from the main model.
      if (handoff) {
        const { visibleText } = parseDraftBlock(final)
        return { content: visibleText.trim() || final, toolCalls }
      }
      return { content: final, toolCalls }
    }

    // Tool round: clear UI preamble if mid-stream didn't already.
    if (content && !contentResetFired) opts.onContentReset?.()

    for (const { index, call } of callEntries) {
      if (opts.signal?.aborted) {
        throw new DOMException('Aborted', 'AbortError')
      }
      const name = call.function?.name ?? ''
      const args = safeParseArgs(call.function?.arguments)
      opts.onTool?.({ index, id: call.id, name, args })

      let result: unknown
      if (name === COMPOSE_WRITE_DRAFT_TOOL_NAME) {
        const brief = parseDraftWriteBrief(args)
        if (!brief.brief) {
          result = { error: 'compose_write_draft requires a non-empty brief' }
        } else {
          // Fire-and-forget — chat continues while the writer streams.
          try {
            opts.onDraftHandoff?.(brief)
            result = {
              status: 'started',
              message: 'Draft writer is streaming into the draft drawer.',
            }
          } catch (err) {
            result = {
              error: err instanceof Error ? err.message : 'Failed to start draft writer',
            }
          }
        }
      } else if (name.startsWith('compose_history_')) {
        result = executeHistoryTool(name, args, { snapshot: opts.historySnapshot })
      } else {
        result = executeIntelTool(name, args, {
          snapshot: opts.snapshot,
          scope: opts.scope,
        })
      }

      toolCalls++
      await opts.onToolResult?.({ index, id: call.id, name, args, result })
      messages.push({
        role: 'tool',
        tool_call_id: call.id,
        content: JSON.stringify(result),
      })
    }
  }

  const trimmed = lastContent.trim()
  if (trimmed) {
    if (handoff) {
      const { visibleText } = parseDraftBlock(trimmed)
      return { content: visibleText.trim() || trimmed, toolCalls }
    }
    return { content: trimmed, toolCalls }
  }

  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i]!
    if (m.role === 'assistant') {
      const text = contentAsString(m.content).trim()
      if (text) {
        if (handoff) {
          const { visibleText } = parseDraftBlock(text)
          return { content: visibleText.trim() || text, toolCalls }
        }
        return { content: text, toolCalls }
      }
    }
  }

  return {
    content: `Stopped after ${MAX_TOOL_ROUNDS} tool rounds.`,
    toolCalls,
  }
}
