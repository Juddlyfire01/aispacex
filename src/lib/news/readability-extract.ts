// Extract main article text from raw HTML (Readability + linkedom).
// Used by /api/news/extract — not an editorial truncate of the story body.

import { Readability } from '@mozilla/readability'
import { parseHTML } from 'linkedom'

/** Pathological non-article safety only — not normal story clipping. */
export const ARTICLE_SAFETY_MAX_CHARS = 500_000

export interface ExtractedArticle {
  title: string
  text: string
  excerpt: string
  byline: string
  siteName: string
  length: number
}

export type ExtractFailureReason =
  | 'empty_html'
  | 'extract_failed'
  | 'empty_article'
  | 'article_too_large'

export function extractArticleFromHtml(
  html: string,
  url: string,
): { ok: true; article: ExtractedArticle } | { ok: false; reason: ExtractFailureReason } {
  const trimmed = html?.trim() ?? ''
  if (!trimmed) return { ok: false, reason: 'empty_html' }

  const { document } = parseHTML(trimmed)
  // Readability uses document URL for resolving relative links.
  try {
    Object.defineProperty(document, 'documentURI', { value: url, configurable: true })
  } catch {
    /* ignore */
  }

  const reader = new Readability(document as never, {
    charThreshold: 100,
  })
  const parsed = reader.parse()
  if (!parsed) return { ok: false, reason: 'extract_failed' }

  const text = (parsed.textContent ?? '').replace(/\n{3,}/g, '\n\n').trim()
  if (!text) return { ok: false, reason: 'empty_article' }
  if (text.length > ARTICLE_SAFETY_MAX_CHARS) {
    return { ok: false, reason: 'article_too_large' }
  }

  return {
    ok: true,
    article: {
      title: (parsed.title ?? '').trim(),
      text,
      excerpt: (parsed.excerpt ?? '').trim(),
      byline: (parsed.byline ?? '').trim(),
      siteName: (parsed.siteName ?? '').trim(),
      length: text.length,
    },
  }
}
