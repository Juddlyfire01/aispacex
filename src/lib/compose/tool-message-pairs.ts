// SOP: OpenAI-style tool transcripts must satisfy Anthropic/Claude pairing rules.
// Every assistant tool_use id needs a tool_result in the immediately following
// message(s). Grok often tolerates incomplete pairs; Claude rejects them.
// Apply this before ANY /chat/completions call that may replay tool history.

import type { ChatMessage, ToolCall } from '../../types/venice'

const STUB_RESULT = JSON.stringify({
  status: 'omitted',
  message: 'Tool result unavailable in transcript; pairing repaired for model compatibility.',
})

function toolCallId(call: ToolCall, index: number): string {
  return call.id?.trim() || `call_${index}`
}

/**
 * Ensure every assistant tool_calls entry has a contiguous tool_result after it.
 * - Fills missing results with stubs (keeps context; Claude accepts the pair)
 * - Drops orphan tool messages (no preceding assistant tool_calls)
 * - Normalizes empty tool_call ids
 */
export function ensureToolResultPairs(messages: ChatMessage[]): ChatMessage[] {
  const out: ChatMessage[] = []
  let i = 0
  while (i < messages.length) {
    const m = messages[i]!

    if (m.role === 'tool') {
      // Orphan tool result — skip.
      i += 1
      continue
    }

    if (m.role !== 'assistant' || !m.tool_calls?.length) {
      out.push(m)
      i += 1
      continue
    }

    const normalizedCalls: ToolCall[] = m.tool_calls.map((call, idx) => ({
      ...call,
      id: toolCallId(call, idx),
      type: 'function' as const,
      function: {
        name: call.function?.name ?? '',
        arguments: call.function?.arguments ?? '{}',
      },
    }))

    const byId = new Map<string, ChatMessage>()
    let j = i + 1
    while (j < messages.length && messages[j]!.role === 'tool') {
      const result = messages[j]!
      const id = result.tool_call_id?.trim()
      if (id && !byId.has(id)) {
        byId.set(id, { ...result, tool_call_id: id })
      }
      j += 1
    }

    const orderedResults: ChatMessage[] = normalizedCalls.map((call) => {
      const existing = byId.get(call.id)
      if (existing) return existing
      return {
        role: 'tool' as const,
        tool_call_id: call.id,
        content: STUB_RESULT,
      }
    })

    out.push({ ...m, tool_calls: normalizedCalls }, ...orderedResults)
    i = j
  }
  return out
}

/**
 * Drop incomplete tool_use / tool_result pairs (no stubs). Prefer
 * {@link ensureToolResultPairs} at API boundaries; use this when stripping
 * is intentionally preferred (e.g. aggressive truncation cleanup).
 */
export function repairToolMessagePairs(messages: ChatMessage[]): ChatMessage[] {
  const out: ChatMessage[] = []
  let i = 0
  while (i < messages.length) {
    const m = messages[i]!
    if (m.role !== 'assistant' || !m.tool_calls?.length) {
      if (m.role === 'tool') {
        i += 1
        continue
      }
      out.push(m)
      i += 1
      continue
    }

    const needed = new Set(
      m.tool_calls.map((c, idx) => toolCallId(c, idx)).filter(Boolean),
    )
    const results: ChatMessage[] = []
    let j = i + 1
    while (j < messages.length && messages[j]!.role === 'tool') {
      results.push(messages[j]!)
      const id = messages[j]!.tool_call_id?.trim()
      if (id) needed.delete(id)
      j += 1
    }

    if (needed.size === 0) {
      out.push(m, ...results)
      i = j
      continue
    }

    const text =
      typeof m.content === 'string' ? m.content.trim() : m.content != null ? String(m.content) : ''
    if (text) {
      out.push({ role: 'assistant', content: m.content })
    }
    i = j
  }
  return out
}

/** True when every tool_use has a contiguous matching tool_result. */
export function toolPairsAreComplete(messages: ChatMessage[]): boolean {
  for (let i = 0; i < messages.length; i++) {
    const m = messages[i]!
    if (m.role !== 'assistant' || !m.tool_calls?.length) continue
    const needed = new Set(m.tool_calls.map((c, idx) => toolCallId(c, idx)))
    let j = i + 1
    while (j < messages.length && messages[j]!.role === 'tool') {
      const id = messages[j]!.tool_call_id?.trim()
      if (id) needed.delete(id)
      j += 1
    }
    if (needed.size > 0) return false
  }
  return true
}
