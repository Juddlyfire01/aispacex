/** Split publishable article body from a trailing image-prompt section. */

const IMAGE_PROMPT_SPLIT_RE = /\n\s*---\s*IMAGE_PROMPT\s*---\s*\n/i
const IMAGE_PROMPT_HEADING_RE =
  /\n\s*(?:\*{0,2}|#{1,3}\s*)?Image\s*Prompt(?:\s*\([^)]*\))?\s*:?\s*\*{0,2}\s*\n+/i

export interface ParsedWriterArticle {
  title: string
  bodyMarkdown: string
  imagePrompt?: string
}

/**
 * Accepts explicit `---IMAGE_PROMPT---` sentinel or a plain "Image Prompt:" heading.
 */
export function splitArticleImagePrompt(text: string): { body: string; imagePrompt?: string } {
  const trimmed = text.trim()
  const sentinel = trimmed.split(IMAGE_PROMPT_SPLIT_RE)
  if (sentinel.length >= 2) {
    const imagePrompt = sentinel.slice(1).join('\n').trim()
    return { body: sentinel[0]!.trim(), imagePrompt: imagePrompt || undefined }
  }
  const heading = trimmed.split(IMAGE_PROMPT_HEADING_RE)
  if (heading.length >= 2) {
    const imagePrompt = heading.slice(1).join('\n').trim()
    return { body: heading[0]!.trim(), imagePrompt: imagePrompt || undefined }
  }
  return { body: trimmed }
}

/** Parse `# Title` + body markdown (+ optional image prompt) from writer/article text. */
export function parseArticleFromWriterText(text: string): ParsedWriterArticle {
  const { body: withoutPrompt, imagePrompt } = splitArticleImagePrompt(text)
  const trimmed = withoutPrompt.trim()
  const match = trimmed.match(/^#\s+([^\n]+)\n+([\s\S]*)$/)
  if (match) {
    return { title: match[1].trim(), bodyMarkdown: match[2].trim(), imagePrompt }
  }
  const titleOnly = trimmed.match(/^#\s+([^\n]+)$/)
  if (titleOnly) {
    return { title: titleOnly[1].trim(), bodyMarkdown: '', imagePrompt }
  }
  return { title: '', bodyMarkdown: trimmed, imagePrompt }
}
