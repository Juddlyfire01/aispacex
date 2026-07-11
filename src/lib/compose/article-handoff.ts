import { parseArticleFromWriterText } from './article-parse'
import type { ArticleDraft } from './types'
import { emptyArticleDraft } from './types'

const DRAFT_INTENT_RE =
  /\b(draft|write|rewrite|revise|compose|hand\s*off|use\s+the\s+draft\s+tool|postdraft|article\s+for\s+x)\b/i

/** True when the user message looks like a request to produce publishable copy. */
export function looksLikeDraftIntent(userMessage: string): boolean {
  return DRAFT_INTENT_RE.test(userMessage)
}

/**
 * Detect a full article dumped into chat instead of handed to the draft writer.
 * Heuristic: long body with a title line and/or multiple section headers / image prompt.
 */
export function looksLikeLeakedArticle(content: string, preferArticle = false): boolean {
  const text = content.trim()
  if (!text) return false
  const minLen = preferArticle ? 600 : 1200
  if (text.length < minLen) return false
  if (/^#\s+\S/m.test(text)) return true
  const sectionHeaders = text.match(/^##\s+\S/gm)
  if (sectionHeaders && sectionHeaders.length >= 2) return true
  if (/Image\s*Prompt/i.test(text) && text.length >= minLen) return true
  return preferArticle && text.length >= 1500
}

export interface SalvagedArticleChat {
  article: ArticleDraft
  chatMessage: string
}

/**
 * Move a leaked chat article into draft.article and return short chat replacement text.
 * Any stripped image-prompt section is returned in chat (not stored on the draft).
 */
export function salvageLeakedArticleFromChat(content: string): SalvagedArticleChat | null {
  const prefer = looksLikeLeakedArticle(content, true)
  const general = looksLikeLeakedArticle(content, false)
  const titled = /^#\s+\S/m.test(content.trim()) && content.trim().length >= 400
  if (!prefer && !general && !titled) return null

  const parsed = parseArticleFromWriterText(content)
  if (!parsed.title.trim() && parsed.bodyMarkdown.trim().length < 400) return null

  const article: ArticleDraft = {
    ...emptyArticleDraft(),
    title: parsed.title || 'Untitled',
    bodyMarkdown: parsed.bodyMarkdown,
  }

  let chatMessage =
    'Draft is in the drawer (Article). I moved the copy out of chat so you can edit/publish there. Say if you want changes.'
  if (parsed.imagePrompt?.trim()) {
    chatMessage += `\n\nImage prompt:\n${parsed.imagePrompt.trim()}`
  }

  return { article, chatMessage }
}
