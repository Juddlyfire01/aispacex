// Draft writer: distinct-model handoff streams post copy (no tools) into the
// compose draft. Same-as-main continues the research agent turn instead.

import { venice } from '../venice-client'
import { parseSSEStream } from '../stream'
import { useVeniceCostStore } from '../../stores/venice-cost-store'
import type { ChatMessage, VeniceModel } from '../../types/venice'
import type { DraftWriteBrief } from './draft-writer-tool'
import { messageContentString } from './thread-meta'
import { buildCraftInject } from './skills'

export { parseArticleFromWriterText, splitArticleImagePrompt } from './article-parse'
export type { ParsedWriterArticle } from './article-parse'

/** Cap conversation payload so the writer stays within context. */
export const WRITER_CONVERSATION_MAX_CHARS = 48_000

/** Below this, treat the stream as truncated / non-draft. */
export const MIN_DRAFT_CHARS = 10

const SPENT_WRITER_RULES = `SPENT / PRIOR ART — HARD FAIL:
- If a ## SPENT / PRIOR ART section is present (user message or conversation), its openers, slogans, exhibit spines, status ids, and heavy $/@ stacks are forbidden to reuse.
- Reusing spent opener/slogan/spine (including light paraphrase) = FAILED draft.
- Thin novelty → shorter output; never pad with restated prior art.
- Write the current delta only.`

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
  /** Engineered SPENT / PRIOR ART pack (always prefer this over conversation alone). */
  spentText?: string | null
  signal?: AbortSignal
  onDelta?: (token: string) => void
}

function contentAsText(content: ChatMessage['content']): string {
  return messageContentString({ content }).trim()
}

/**
 * True when the model echoed a tool call / brief JSON instead of publishable copy.
 * GLM and other tool-trained writers do this when research context mentions
 * compose_write_draft.
 */
export function isToolCallShapedDraft(text: string): boolean {
  const t = text.trim()
  if (!t) return false
  if (/compose_write_draft\s*\(/i.test(t)) return true
  if (/^\s*```(?:json|ts|typescript|js|javascript)?\s*\n?\s*compose_write_draft/i.test(t)) {
    return true
  }
  // Structured brief echo: JSON object dominated by planning keys, not prose.
  if (t.startsWith('{') && t.endsWith('}')) {
    const planningKeys =
      (t.match(
        /"(?:brief|format|notes|voice|angle|hook|must_include|structure|lever|end|constraints)"\s*:/g,
      ) ?? []).length
    if (planningKeys >= 2) return true
  }
  return false
}

/** Strip research-agent tool ritual so the writer does not mimic it. */
export function scrubWriterTurnText(text: string): string {
  return text
    .replace(/```postdraft[\s\S]*?```/gi, '')
    .replace(/compose_write_draft\s*\(\s*\{[\s\S]*?\}\s*\)/gi, '')
    .replace(/compose_write_draft\s*\([^)]*\)/gi, '')
    .replace(/\bcompose_write_draft\b/gi, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

/**
 * Pack research chat into a transcript for the draft writer.
 * Keeps user/assistant prose; drops system, tool results, empty turns, and
 * tool-call ritual that causes writers to echo compose_write_draft(...).
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
    const cleaned = scrubWriterTurnText(text)
    if (!cleaned) continue
    // Skip turns that are only handoff chatter after scrubbing.
    if (/^handed off to draft/i.test(cleaned) && cleaned.length < 80) continue
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
- You have NO tools. Never emit function calls, tool JSON, compose_write_draft(...), or a structured brief object. The brief below is instructions FOR YOU — write the post, do not echo the brief.
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
    ? `- You receive research conversation context AND a writing brief. Use both for facts, angle, and constraints. Treat the brief as writing instructions — do not discard conversation detail the brief omitted.
- Prefer concrete facts and numbers from the conversation and brief over invention.
- If the brief or a user instruction asks for a looser / more casual / more novel register, honor it — that overrides any default formal posture, including the REGISTER block's defaults.
- When a REGISTER block is present: match voice identity (diction/stance/rhetoric), but ALWAYS scale length and paragraphing to the requested format. Articles and long-form must read as coherent prose, not a stack of short posts.`
    : `- Follow the brief tightly. Prefer concrete facts and numbers from the brief over invention.
- If the brief asks for a looser / more casual / more novel register, honor it over any default formal posture.
- When a REGISTER block is present: match voice identity (diction/stance/rhetoric), but ALWAYS scale length and paragraphing to the requested format. Articles and long-form must read as coherent prose, not a stack of short posts.`
}`,
    SPENT_WRITER_RULES,
    buildCraftInject(),
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
  spentText?: string | null,
): string {
  const lines: string[] = []
  if (spentText?.trim()) {
    lines.push(spentText.trim())
  }
  if (conversationText.trim()) {
    lines.push(
      `Research context (facts and decisions — write the post; do not call tools):\n${conversationText.trim()}`,
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
    const formatNote =
      brief.preferredFormat === 'article' || brief.preferredFormat === 'longform'
        ? ' FORMAT=article/long-form: use full paragraphs and transitions; do NOT collapse into tweet-length punches even if Cadence describes a short-form corpus.'
        : brief.preferredFormat === 'thread'
          ? ' FORMAT=thread: each beat may be short, but the thread must cohere; do not imitate character-count averages from the register.'
          : brief.preferredFormat === 'post'
            ? ' FORMAT=post: compact is fine; still invent fresh wording.'
            : ' Scale sentence length and paragraphing to whatever format you are writing; register averages are not caps.'
    lines.push(
      conversationText.trim()
        ? `Apply the REGISTER voice from the system prompt (diction, stance, rhetoric) to every sentence. Content from conversation + brief; style from REGISTER.${formatNote}`
        : `Apply the REGISTER voice from the system prompt (diction, stance, rhetoric) to every sentence. Content from the brief; style from REGISTER.${formatNote}`,
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
 * Throws on abort, truncated streams, empty/tool-call-shaped output.
 */
export async function runDraftWriter(opts: RunDraftWriterOpts): Promise<string> {
  const isArticle = opts.brief.preferredFormat === 'article'
  const hasRegister = Boolean(opts.registerInject?.trim())
  const conversationText = packConversationForWriter(opts.conversation)
  const hasConversation = Boolean(conversationText)
  const spentText = opts.spentText?.trim() || null
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
          content: buildWriterUser(opts.brief, hasRegister, conversationText, spentText),
        },
      ],
      stream: true,
      stream_options: { include_usage: true },
      temperature: 0.7,
      // Articles need room for long markdown; posts/threads stay smaller.
      max_tokens: isArticle ? 8192 : 2048,
      venice_parameters: {
        // Writer needs full control — Venice's default system prompt confuses
        // tool-trained models into emitting compose_write_draft echoes.
        include_venice_system_prompt: false,
      },
    }),
    stream: true,
    signal: opts.signal,
  })

  let content = ''
  let finishReason: string | null = null
  let usage: { prompt_tokens: number; completion_tokens: number; total_tokens: number } | undefined
  for await (const chunk of parseSSEStream(stream, { signal: opts.signal })) {
    if (opts.signal?.aborted) break
    if (chunk.usage) usage = chunk.usage
    const choice = chunk.choices[0]
    if (choice?.finish_reason) finishReason = choice.finish_reason
    const delta = choice?.delta?.content
    if (delta) {
      content += delta
      opts.onDelta?.(delta)
    }
  }
  useVeniceCostStore.getState().addUsage(opts.modelSpec, usage)

  if (opts.signal?.aborted) {
    throw new DOMException('Aborted', 'AbortError')
  }

  const trimmed = content.trim()
  if (!trimmed) {
    throw new Error(`${opts.modelId} returned empty content`)
  }
  if (isToolCallShapedDraft(trimmed)) {
    throw new Error(
      `${opts.modelId} echoed a tool call / brief JSON instead of post copy`,
    )
  }
  if (trimmed.length < MIN_DRAFT_CHARS) {
    throw new Error(
      `${opts.modelId} returned only ${trimmed.length} chars — likely truncated`,
    )
  }
  if (finishReason && finishReason !== 'stop') {
    throw new Error(
      `${opts.modelId} stream ended with finish_reason="${finishReason}" after ${trimmed.length} chars`,
    )
  }
  // Stream died without a normal stop and without enough body — treat as cut off.
  if (!finishReason && trimmed.length < 40) {
    throw new Error(
      `${opts.modelId} stream ended early after ${trimmed.length} chars (no finish_reason)`,
    )
  }
  return trimmed
}
