import { parseArticleFromWriterText } from './article-parse'
import {
  emptyArticleDraft,
  emptySegment,
  type PostDraft,
} from './types'

export type PreferredFormat = 'auto' | 'post' | 'thread' | 'longform' | 'article'
export type ResolvedFormat = Exclude<PreferredFormat, 'auto'>

export const PREFERRED_FORMATS: { value: PreferredFormat; label: string }[] = [
  { value: 'auto', label: 'Auto' },
  { value: 'post', label: 'Post' },
  { value: 'thread', label: 'Thread' },
  { value: 'longform', label: 'Long-form' },
  { value: 'article', label: 'Article' },
]

export function resolveDraftFormat(draft: PostDraft): ResolvedFormat {
  const a = draft.article
  if (a && (a.title.trim() || a.bodyMarkdown.trim())) return 'article'
  if (draft.segments.length > 1) return 'thread'
  if (draft.longform) return 'longform'
  return 'post'
}

/** Clear stale article when switching to a non-article shape. */
export function clearArticleIfStale<T extends Partial<PostDraft>>(
  patch: T,
  nextResolved: ResolvedFormat,
): T {
  if (nextResolved !== 'article') {
    return { ...patch, article: undefined }
  }
  return patch
}

/**
 * When the user picks Article preference, promote any segment copy into the
 * article fields instead of wiping it for an empty shell.
 * Returns null when the draft already has article content (or an empty shell
 * with no segment text to migrate).
 */
export function promoteDraftToArticle(draft: PostDraft): Partial<PostDraft> | null {
  const existing = draft.article
  const hasArticleContent = Boolean(
    existing && (existing.title.trim() || existing.bodyMarkdown.trim()),
  )
  if (hasArticleContent) return null

  const segmentText = draft.segments
    .map((s) => s.text)
    .filter((t) => t.trim())
    .join('\n\n---\n\n')
    .trim()

  if (segmentText) {
    const parsed = parseArticleFromWriterText(segmentText)
    return {
      article: {
        title: parsed.title,
        bodyMarkdown: parsed.bodyMarkdown,
        cover: existing?.cover,
        inlineMedia: existing?.inlineMedia ?? [],
        contentState: existing?.contentState,
      },
      longform: false,
      target: { kind: 'original' },
      segments: [emptySegment()],
    }
  }

  if (existing) return null

  return {
    article: emptyArticleDraft(),
    longform: false,
    segments: [emptySegment()],
  }
}
