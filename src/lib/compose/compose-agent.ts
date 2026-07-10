import { venice } from '../venice-client'
import { parseSSEStream } from '../stream'
import type {
  ChatCompletionChunk,
  ChatMessage,
  ToolCall,
  VeniceModel,
} from '../../types/venice'
import type { ComposeScope, IntelSnapshot } from '../intel-library/types'
import { useVeniceCostStore } from '../../stores/venice-cost-store'
import type { HistorySnapshot } from './history-library'
import { COMPOSE_HISTORY_TOOLS, executeHistoryTool } from './history-tools'
import { COMPOSE_INTEL_TOOLS, executeIntelTool } from './intel-tools'

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
  signal?: AbortSignal
  onTool?: (info: { name: string; args: Record<string, unknown> }) => void
  /** Fired after a tool executes with its (untruncated-shape) result. */
  onToolResult?: (info: { name: string; args: Record<string, unknown>; result: unknown }) => void
  /** Fired when a new model round starts (1-based). */
  onRoundStart?: (round: number) => void
  /** Fired for each content token as the final (or intermediate) answer streams. */
  onDelta?: (token: string) => void
  /**
   * Fired when a round ends in tool_calls after any content was streamed —
   * clear the assistant placeholder so tool activity UI can take over.
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
  toolCalls: ToolCall[]
  usage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number }
}

/**
 * One streaming chat/completions round with tools enabled.
 * Accumulates content + tool_calls from SSE deltas; reports content via onDelta.
 */
async function streamComposeRound(
  opts: ComposeAgentOpts,
  messages: ChatMessage[],
  tools: typeof COMPOSE_INTEL_TOOLS,
): Promise<StreamedRound> {
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
      tool_choice: 'auto',
      venice_parameters: { enable_x_search: opts.xSearchOn },
    }),
    stream: true,
    signal: opts.signal,
  })

  let content = ''
  const toolAcc = new Map<number, ToolCall>()
  let usage: StreamedRound['usage']

  for await (const chunk of parseSSEStream(stream, { signal: opts.signal })) {
    if (chunk.usage) usage = chunk.usage
    const delta = chunk.choices[0]?.delta
    if (!delta) continue

    if (delta.content) {
      content += delta.content
      opts.onDelta?.(delta.content)
    }
    if (delta.tool_calls?.length) {
      accumulateStreamedToolCalls(toolAcc, delta.tool_calls)
    }
  }

  const toolCalls = [...toolAcc.entries()]
    .sort(([a], [b]) => a - b)
    .map(([, call]) => call)
    .filter((c) => c.id && c.function.name)

  return { content, toolCalls, usage }
}

/**
 * Streaming multi-round tool loop for compose.
 * Streams each Venice round over SSE (content tokens → onDelta). Tool rounds
 * stay non-visible; only the final answer text is kept for the transcript.
 */
export async function runComposeAgent(
  opts: ComposeAgentOpts,
): Promise<{ content: string; toolCalls: number }> {
  const messages: ChatMessage[] = [...opts.messages]
  let toolCalls = 0
  const tools = [...COMPOSE_INTEL_TOOLS, ...COMPOSE_HISTORY_TOOLS]
  let lastContent = ''

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    if (opts.signal?.aborted) {
      throw new DOMException('Aborted', 'AbortError')
    }

    opts.onRoundStart?.(round + 1)

    const { content, toolCalls: calls, usage } = await streamComposeRound(
      opts,
      messages,
      tools,
    )

    useVeniceCostStore.getState().addUsage(opts.modelSpec, usage)

    const assistantMsg: ChatMessage = {
      role: 'assistant',
      content: content || null,
      tool_calls: calls.length > 0 ? calls : undefined,
    }
    messages.push(assistantMsg)
    lastContent = content

    if (calls.length === 0) {
      return { content: content.trim(), toolCalls }
    }

    // Tool round: drop any partial prose from the UI while tools run.
    if (content) opts.onContentReset?.()

    for (const call of calls) {
      if (opts.signal?.aborted) {
        throw new DOMException('Aborted', 'AbortError')
      }
      const name = call.function?.name ?? ''
      const args = safeParseArgs(call.function?.arguments)
      opts.onTool?.({ name, args })
      const result = name.startsWith('compose_history_')
        ? executeHistoryTool(name, args, { snapshot: opts.historySnapshot })
        : executeIntelTool(name, args, {
            snapshot: opts.snapshot,
            scope: opts.scope,
          })
      toolCalls++
      opts.onToolResult?.({ name, args, result })
      messages.push({
        role: 'tool',
        tool_call_id: call.id,
        content: JSON.stringify(result),
      })
    }
  }

  const trimmed = lastContent.trim()
  if (trimmed) return { content: trimmed, toolCalls }

  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i]!
    if (m.role === 'assistant') {
      const text = contentAsString(m.content).trim()
      if (text) return { content: text, toolCalls }
    }
  }

  return {
    content: `Stopped after ${MAX_TOOL_ROUNDS} tool rounds.`,
    toolCalls,
  }
}
