import { venice } from '../venice-client'
import type { ChatCompletionResponse, ChatMessage } from '../../types/venice'
import type { ComposeScope, IntelSnapshot } from '../intel-library/types'
import { COMPOSE_INTEL_TOOLS, executeIntelTool } from './intel-tools'

export const MAX_TOOL_ROUNDS = 6

export interface ComposeAgentOpts {
  model: string
  /** Includes system as first message. */
  messages: ChatMessage[]
  snapshot: IntelSnapshot
  scope: ComposeScope
  xSearchOn: boolean
  signal?: AbortSignal
  onTool?: (info: { name: string; args: Record<string, unknown> }) => void
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

/**
 * Non-streaming multi-round tool loop for compose.
 * Calls Venice chat/completions with COMPOSE_INTEL_TOOLS until the model
 * returns text without tool_calls, or MAX_TOOL_ROUNDS is hit.
 */
export async function runComposeAgent(
  opts: ComposeAgentOpts,
): Promise<{ content: string; toolCalls: number }> {
  const messages: ChatMessage[] = [...opts.messages]
  let toolCalls = 0

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    if (opts.signal?.aborted) {
      throw new DOMException('Aborted', 'AbortError')
    }

    const resp = await venice<ChatCompletionResponse>('/chat/completions', {
      method: 'POST',
      body: JSON.stringify({
        model: opts.model,
        messages,
        temperature: 0.6,
        max_tokens: 4096,
        tools: COMPOSE_INTEL_TOOLS,
        tool_choice: 'auto',
        venice_parameters: { enable_x_search: opts.xSearchOn },
      }),
      signal: opts.signal,
    })

    const message = resp.choices[0]?.message
    if (!message) {
      return { content: '', toolCalls }
    }

    const assistantMsg: ChatMessage = {
      role: 'assistant',
      content: message.content,
      tool_calls: message.tool_calls,
    }
    messages.push(assistantMsg)

    const calls = message.tool_calls ?? []
    if (calls.length === 0) {
      return { content: contentAsString(message.content).trim(), toolCalls }
    }

    for (const call of calls) {
      if (opts.signal?.aborted) {
        throw new DOMException('Aborted', 'AbortError')
      }
      const name = call.function?.name ?? ''
      const args = safeParseArgs(call.function?.arguments)
      opts.onTool?.({ name, args })
      const result = executeIntelTool(name, args, {
        snapshot: opts.snapshot,
        scope: opts.scope,
      })
      toolCalls++
      messages.push({
        role: 'tool',
        tool_call_id: call.id,
        content: JSON.stringify(result),
      })
    }
  }

  // Exhausted rounds — return last assistant text if any, else a note.
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
