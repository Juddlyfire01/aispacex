// Stream post copy from the draft-writer model (no tools) into the compose draft.

import { venice } from '../venice-client'
import { parseSSEStream } from '../stream'
import { useVeniceCostStore } from '../../stores/venice-cost-store'
import type { ChatMessage, VeniceModel } from '../../types/venice'
import type { DraftWriteBrief } from './draft-writer-tool'
import { messageContentString } from './thread-meta'

export { parseArticleFromWriterText, splitArticleImagePrompt } from './article-parse'
export type { ParsedWriterArticle } from './article-parse'

/** Cap conversation payload so the writer stays within context. */
export const WRITER_CONVERSATION_MAX_CHARS = 48_000

export interface RunDraftWriterOpts {
  modelId: string
  modelSpec?: VeniceModel | null
  brief: DraftWriteBrief
  /**
   * Research-thread messages (user/assistant prose). Attached on separate-model
   * handoff so the writer is not limited to a lossy brief.
   */
  conversation?: ChatMessage[] | null
  registerInject?: string | null
  signal?: AbortSignal
  onDelta?: (token: string) => void
}

function contentAsText(content: ChatMessage['content']): string {
  return messageContentString({ content }).trim()
}

/**
 * Pack research chat into a transcript for the draft writer.
 * Keeps user/assistant prose; drops system, tool results, and empty turns.
 * Prefer recent turns when over maxChars.
 */
export function packConversationForWriter(
  messages: ChatMessage[] | null | undefined,
  maxChars = WRITER_CONVERSATION_MAX_CHARS,
): string {
  if (!messages?.length) return ''
  const turns: string[] = []
  for (const m of messages) {
    if (m.role !== 'user' && m.role !== 'assistant') continue
    // Skip pure tool-call assistant shells with no visible prose.
    if (m.role === 'assistant' && m.tool_calls?.length && !contentAsText(m.content)) continue
    const text = contentAsText(m.content)
    if (!text) continue
    // Strip leaked postdraft fences if any.
    const cleaned = text
      .replace(/```postdraft[\s\S]*?```/gi, '')
      .replace(/\n{3,}/g, '\n\n')
      .trim()
    if (!cleaned) continue
    const label = m.role === 'user' ? 'User' : 'Research model'
    turns.push(`${label}:\n${cleaned}`)
  }
  if (turns.length === 0) return ''

  let packed = turns.join('\n\n')
  if (packed.length <= maxChars) return packed

  // Keep the tail (most recent context) when over budget.
  const kept: string[] = []
  let used = 0
  for (let i = turns.length - 1; i >= 0; i--) {
    const t = turns[i]!
    const cost = t.length + (kept.length ? 2 : 0)
    if (used + cost > maxChars && kept.length > 0) break
    kept.unshift(t)
    used += cost
  }
  packed = kept.join('\n\n')
  if (kept.length < turns.length) {
    return `[Earlier turns omitted for length — ${turns.length - kept.length} older turn(s)]\n\n${packed}`
  }
  return packed
}

/** Exported for tests. */
export function buildWriterSystem(
  registerInject?: string | null,
  opts?: { hasConversation?: boolean },
): string {
  const hasConversation = Boolean(opts?.hasConversation)
  const parts = [
    `You are the IntelX draft writer. Your only job is to write X post / article copy.

Rules:
- Output ONLY the publishable text — plain UTF-8 (or Markdown for articles).
- No preamble, no "here's a draft", no markdown fences, no JSON, no \`\`\`postdraft.
- For post/thread/long-form: no Markdown (**bold**, _italic_). @mentions, #hashtags, $cashtags, https:// URLs, emojis, and line breaks are fine.
- Thread: separate posts with a line containing only ---
- Article:
  - First line is \`# Title\`, then a blank line, then the markdown body ONLY.
  - Never include image prompts, "Image Prompt:", illustration directions, or \`---IMAGE_PROMPT---\` blocks. Image prompts are handled in chat by the research model, not in article copy.
  - Never label the output as "long-form post" — Articles are a distinct X format.
- Cite external posts with https://x.com/i/status/{id} permalinks (not bare [1] footnotes).
${
  hasConversation
    ? `- You receive the research conversation history AND a writing brief. Use the conversation for full context (facts, angle, nuance, decisions). Treat the brief as the research model's writing instructions and priorities — do not discard conversation detail that the brief omitted.
- Prefer concrete facts and numbers from the conversation and brief over invention.`
    : `- Follow the brief tightly. Prefer concrete facts and numbers from the brief over invention.`
}`,
  ]
  if (registerInject?.trim()) {
    parts.push(registerInject.trim())
  }
  return parts.join('\n\n')
}

/** Exported for tests. */
export function buildWriterUser(
  brief: DraftWriteBrief,
  hasRegister = false,
  conversationText = '',
): string {
  const lines: string[] = []
  if (conversationText.trim()) {
    lines.push(
      `Research conversation (full context — use this; do not rely on the brief alone):\n${conversationText.trim()}`,
    )
  }
  lines.push(`Brief:\n${brief.brief}`)
  if (brief.notes?.trim()) lines.push(`Constraints:\n${brief.notes.trim()}`)
  if (brief.target) lines.push(`Target: ${JSON.stringify(brief.target)}`)
  if (brief.preferredFormat && brief.preferredFormat !== 'auto') {
    const format = brief.preferredFormat
    let rules = `Preferred format: ${format}.`
    if (format === 'post') {
      rules += ' Single block, ≤280 characters, no --- separators.'
    } else if (format === 'thread') {
      rules += ' 2+ posts separated by a line containing only ---.'
    } else if (format === 'longform') {
      rules += ' Single continuous block; may exceed 280 characters.'
    } else if (format === 'article') {
      rules +=
        ' X Article format (not a Premium long-form tweet). Output `# Title`, blank line, markdown body only. Do not include any image/cover prompt in the output.'
    }
    lines.push(rules)
  }
  if (hasRegister) {
    lines.push(
      conversationText.trim()
        ? 'Apply the REGISTER voice from the system prompt to every sentence of the output. Content from conversation + brief; style from REGISTER.'
        : 'Apply the REGISTER voice from the system prompt to every sentence of the output. Content from the brief; style from REGISTER.',
    )
  }
  if (brief.preferredFormat === 'article') {
    lines.push('Write the X Article now (title + body only — no image prompts).')
  } else if (brief.longform || brief.preferredFormat === 'longform') {
    lines.push('Long-form allowed (may exceed 280 characters).')
    lines.push('Write the post now.')
  } else {
    lines.push('Prefer staying under 280 characters unless the brief requires otherwise.')
    lines.push('Write the post now.')
  }
  return lines.join('\n\n')
}

/** Split writer output into thread segments on --- separators. */
export function splitWriterSegments(text: string): string[] {
  const parts = text
    .split(/\n---\n/)
    .map((s) => s.trim())
    .filter(Boolean)
  return parts.length > 0 ? parts : [text.trim()].filter(Boolean)
}

/**
 * Stream draft copy from the writer model. Returns full accumulated text.
 * Caller applies tokens to the draft drawer via onDelta.
 */
export async function runDraftWriter(opts: RunDraftWriterOpts): Promise<string> {
  const isArticle = opts.brief.preferredFormat === 'article'
  const hasRegister = Boolean(opts.registerInject?.trim())
  const conversationText = packConversationForWriter(opts.conversation)
  const hasConversation = Boolean(conversationText)
  const stream = await venice<ReadableStream<Uint8Array>>('/chat/completions', {
    method: 'POST',
    body: JSON.stringify({
      model: opts.modelId,
      messages: [
        {
          role: 'system',
          content: buildWriterSystem(opts.registerInject, { hasConversation }),
        },
        {
          role: 'user',
          content: buildWriterUser(opts.brief, hasRegister, conversationText),
        },
      ],
      stream: true,
      stream_options: { include_usage: true },
      temperature: 0.7,
      // Articles need room for long markdown; posts/threads stay smaller.
      max_tokens: isArticle ? 8192 : 2048,
    }),
    stream: true,
    signal: opts.signal,
  })

  let content = ''
  let usage: { prompt_tokens: number; completion_tokens: number; total_tokens: number } | undefined
  for await (const chunk of parseSSEStream(stream, { signal: opts.signal })) {
    if (chunk.usage) usage = chunk.usage
    const delta = chunk.choices[0]?.delta?.content
    if (delta) {
      content += delta
      opts.onDelta?.(delta)
    }
  }
  useVeniceCostStore.getState().addUsage(opts.modelSpec, usage)
  return content.trim()
}
