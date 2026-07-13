// Stream post copy from the draft-writer model (no tools) into the compose draft.

import { venice } from '../venice-client'
import { parseSSEStream } from '../stream'
import { useVeniceCostStore } from '../../stores/venice-cost-store'
import type { VeniceModel } from '../../types/venice'
import type { DraftWriteBrief } from './draft-writer-tool'

export { parseArticleFromWriterText, splitArticleImagePrompt } from './article-parse'
export type { ParsedWriterArticle } from './article-parse'

export interface RunDraftWriterOpts {
  modelId: string
  modelSpec?: VeniceModel | null
  brief: DraftWriteBrief
  registerInject?: string | null
  signal?: AbortSignal
  onDelta?: (token: string) => void
}

/** Exported for tests. */
export function buildWriterSystem(registerInject?: string | null): string {
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
- Match X conventions: natural voice, no hashtag spam, no "As an AI".
- Follow the brief tightly. Prefer concrete facts and numbers from the brief over invention.`,
  ]
  if (registerInject?.trim()) {
    parts.push(registerInject.trim())
    parts.push(
      `REGISTER OVERRIDE — highest priority after factual accuracy in the brief:
- Voice and texture come from REGISTER, not from a generic social-media template.
- If REGISTER and a softer "helpful" tone conflict, REGISTER wins.
- Mirror anchor sentence length, punctuation, and metric stacking even when the brief is factual/dense.
- Do not pad with enthusiasm, disclaimers, or essay transitions the anchors would not use.`,
    )
  }
  return parts.join('\n\n')
}

/** Exported for tests. */
export function buildWriterUser(brief: DraftWriteBrief, hasRegister = false): string {
  const lines = [`Brief:\n${brief.brief}`]
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
      'Apply the REGISTER voice from the system prompt to every sentence of the output. Content from the brief; style from REGISTER.',
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
  const stream = await venice<ReadableStream<Uint8Array>>('/chat/completions', {
    method: 'POST',
    body: JSON.stringify({
      model: opts.modelId,
      messages: [
        { role: 'system', content: buildWriterSystem(opts.registerInject) },
        { role: 'user', content: buildWriterUser(opts.brief, hasRegister) },
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
