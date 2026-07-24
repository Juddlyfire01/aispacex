// Draft stage: continues the research agent transcript with a no-tools
// completion (model may match research or differ). Streams publishable copy
// into the Draft drawer.

import { venice } from '../venice-client'
import { parseSSEStream } from '../stream'
import { useVeniceCostStore } from '../../stores/venice-cost-store'
import type { ChatMessage, VeniceModel } from '../../types/venice'
import type { DraftWriteBrief } from './draft-writer-tool'
import { ensureToolResultPairs } from './tool-message-pairs'

export { ensureToolResultPairs, repairToolMessagePairs, toolPairsAreComplete } from './tool-message-pairs'

export { parseArticleFromWriterText, splitArticleImagePrompt } from './article-parse'
export type { ParsedWriterArticle } from './article-parse'

/** Cap agent transcript chars for the draft-stage request. */
export const WRITER_CONVERSATION_MAX_CHARS = 96_000

/** Below this, treat the stream as truncated / non-draft. */
export const MIN_DRAFT_CHARS = 10

const SPENT_DRAFT_RULES = `SPENT / PRIOR ART — HARD FAIL:
- If a ## SPENT / PRIOR ART section appears in the conversation, its openers, slogans, exhibit spines, status ids, and heavy $/@ stacks are forbidden to reuse.
- Reusing spent opener/slogan/spine (including light paraphrase) = FAILED draft.
- Thin novelty → shorter output; never pad with restated prior art.
- Write the current delta only.`

const DRAFT_FORMAT_SPEC = `Output formats:
- Post: single block, ≤280 characters, no --- separators.
- Thread: 2+ posts separated by a line containing only ---. Each beat ≤280 unless long-form.
- Long-form: single continuous block; may exceed 280 (Premium tweet). Deep essay as ONE tweet — NOT an X Article.
- Article: first line \`# Title\`, blank line, markdown body ONLY. Never include image prompts or \`---IMAGE_PROMPT---\`. Articles ≠ Premium long-form tweets.
- For post/thread/long-form: no Markdown (**bold**, _italic_). @mentions, #hashtags, $cashtags, https:// URLs, emojis, and line breaks are fine.
- Cite external posts with https://x.com/i/status/{id} permalinks (not bare [1] footnotes).`

const STYLE_POLICY = `STYLE POLICY:
- Register is the only style authority. If a REGISTER block is present, match it; if not, write plainly — do not invent a viral or finance-Twitter persona.
- No theatre: do not engineer hooks, forced binaries, reply-bait endings, or denser jargon for engagement. Structure follows the claim and the requested format only.
- Live user instructions override Register posture; Register never overrides facts or format.`

export interface RunDraftWriterOpts {
  modelId: string
  modelSpec?: VeniceModel | null
  /** Metadata from compose_write_draft (format/target/intent). */
  brief: DraftWriteBrief
  /**
   * Full research agent transcript (system stripped; user/assistant/tool kept).
   * Continuity: same tape, new model id.
   */
  messages: ChatMessage[]
  registerInject?: string | null
  signal?: AbortSignal
  onDelta?: (token: string) => void
}

/**
 * True when the model echoed a tool call / brief JSON instead of publishable copy.
 */
export function isToolCallShapedDraft(text: string): boolean {
  const t = text.trim()
  if (!t) return false
  if (/compose_write_draft\s*\(/i.test(t)) return true
  if (/^\s*```(?:json|ts|typescript|js|javascript)?\s*\n?\s*compose_write_draft/i.test(t)) {
    return true
  }
  if (t.startsWith('{') && t.endsWith('}')) {
    const planningKeys =
      (t.match(
        /"(?:brief|intent|format|notes|voice|angle|hook|must_include|structure|lever|end|constraints)"\s*:/g,
      ) ?? []).length
    if (planningKeys >= 2) return true
  }
  return false
}

/** Draft-stage system prompt — writing policy only (no tools / research identity). */
export function buildDraftStageSystem(registerInject?: string | null): string {
  const parts = [
    `You are the Xintel draft stage. Your only job is to write publishable X post / article copy.

You inherit the research conversation below as ground truth (facts, tool results, decisions).
Output ONLY the publishable text — plain UTF-8 (or Markdown for articles).

Rules:
- You have NO tools. Never emit function calls, tool JSON, compose_write_draft(...), or a structured brief object.
- No preamble, no "here's a draft", no markdown fences, no JSON.
- Prefer concrete facts and numbers from the conversation over invention.
- If a user instruction asks for a looser / more casual / more novel register, honor it over default formal posture.
- When a REGISTER block is present: match voice identity (diction/stance/rhetoric), but ALWAYS scale length and paragraphing to the requested format.`,
    DRAFT_FORMAT_SPEC,
    SPENT_DRAFT_RULES,
    STYLE_POLICY,
  ]
  if (registerInject?.trim()) {
    parts.push(registerInject.trim())
  }
  return parts.join('\n\n')
}

/** @deprecated Use buildDraftStageSystem — kept for tests during migration. */
export function buildWriterSystem(
  registerInject?: string | null,
  _opts?: { hasConversation?: boolean },
): string {
  return buildDraftStageSystem(registerInject)
}

/** Final user turn that locks the draft stage write. */
export function buildDraftStageWriteNow(brief: DraftWriteBrief): string {
  const format = brief.preferredFormat && brief.preferredFormat !== 'auto'
    ? brief.preferredFormat
    : brief.format ?? (brief.longform ? 'longform' : 'post')
  const lines: string[] = [
    'DRAFT STAGE — write publishable copy now.',
    `Format: ${format}.`,
  ]
  if (format === 'post') {
    lines.push('Single block, ≤280 characters, no --- separators.')
  } else if (format === 'thread') {
    lines.push('2+ posts separated by a line containing only ---.')
  } else if (format === 'longform') {
    lines.push('Single continuous block; may exceed 280 characters.')
  } else if (format === 'article') {
    lines.push(
      'X Article: `# Title`, blank line, markdown body only. No image/cover prompts.',
    )
  }
  if (brief.target) lines.push(`Target: ${JSON.stringify(brief.target)}`)
  if (brief.intent?.trim()) lines.push(`Intent: ${brief.intent.trim()}`)
  if (brief.preferredFormat === 'article' || format === 'article') {
    lines.push('Write the X Article now (title + body only).')
  } else {
    lines.push('Output ONLY the post text. No tools, no JSON, no preamble.')
  }
  return lines.join('\n')
}

/** @deprecated Use buildDraftStageWriteNow. */
export function buildWriterUser(
  brief: DraftWriteBrief,
  _hasRegister = false,
  _conversationText = '',
  _spentText?: string | null,
): string {
  return buildDraftStageWriteNow(brief)
}

/**
 * Prepare agent messages for the draft stage: drop research system, keep
 * user/assistant/tool turns, append write-now. Truncate from the head if over budget.
 * Always runs {@link ensureToolResultPairs} so Claude/Anthropic writers accept the tape.
 */
export function buildDraftStageMessages(
  agentMessages: ChatMessage[],
  brief: DraftWriteBrief,
  registerInject?: string | null,
  maxChars = WRITER_CONVERSATION_MAX_CHARS,
): ChatMessage[] {
  const system: ChatMessage = {
    role: 'system',
    content: buildDraftStageSystem(registerInject),
  }
  const body: ChatMessage[] = []
  for (const m of agentMessages) {
    if (m.role === 'system') continue
    body.push(m)
  }
  const writeNow: ChatMessage = {
    role: 'user',
    content: buildDraftStageWriteNow(brief),
  }

  const serialize = (msgs: ChatMessage[]) =>
    msgs.map((m) => `${m.role}:${typeof m.content === 'string' ? m.content : JSON.stringify(m.content)}`).join('\n')

  // SOP: pair every tool_use before the write-now user turn (Claude rejects orphans).
  let kept = ensureToolResultPairs(body)
  const withEnds = () => [system, ...kept, writeNow]
  if (serialize(withEnds()).length > maxChars && kept.length > 0) {
    while (kept.length > 1 && serialize(withEnds()).length > maxChars) {
      kept = kept.slice(1)
      // Head truncation can split a pair — re-ensure (stubs) rather than strip.
      kept = ensureToolResultPairs(kept)
    }
  }
  return withEnds()
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
 * Stream draft copy from the draft-stage model. Returns full accumulated text.
 * Throws on abort, truncated streams, empty/tool-call-shaped output.
 */
export async function runDraftWriter(opts: RunDraftWriterOpts): Promise<string> {
  const isArticle = opts.brief.preferredFormat === 'article'
  const messages = buildDraftStageMessages(
    opts.messages,
    opts.brief,
    opts.registerInject,
  )
  const stream = await venice<ReadableStream<Uint8Array>>('/chat/completions', {
    method: 'POST',
    body: JSON.stringify({
      model: opts.modelId,
      messages,
      stream: true,
      stream_options: { include_usage: true },
      temperature: 0.7,
      max_tokens: isArticle ? 8192 : 2048,
      venice_parameters: {
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
  if (!finishReason && trimmed.length < 40) {
    throw new Error(
      `${opts.modelId} stream ended early after ${trimmed.length} chars (no finish_reason)`,
    )
  }
  return trimmed
}

/** @deprecated Scrub helper — transcript continuation no longer packs prose. */
export function scrubWriterTurnText(text: string): string {
  return text
    .replace(/```postdraft[\s\S]*?```/gi, '')
    .replace(/compose_write_draft\s*\(\s*\{[\s\S]*?\}\s*\)/gi, '')
    .replace(/compose_write_draft\s*\([^)]*\)/gi, '')
    .replace(/\bcompose_write_draft\b/gi, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

/** @deprecated Use buildDraftStageMessages. */
export function packConversationForWriter(
  messages: ChatMessage[] | null | undefined,
  maxChars = WRITER_CONVERSATION_MAX_CHARS,
): string {
  if (!messages?.length) return ''
  const parts: string[] = []
  for (const m of messages) {
    if (m.role === 'system') continue
    const text = typeof m.content === 'string' ? m.content : ''
    if (!text.trim()) continue
    parts.push(`${m.role}:\n${scrubWriterTurnText(text)}`)
  }
  let packed = parts.filter(Boolean).join('\n\n')
  if (packed.length > maxChars) packed = packed.slice(-maxChars)
  return packed
}
