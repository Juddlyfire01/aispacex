import type { PostDraft } from './types'

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
  if (nextResolved !== 'article' && patch.article !== undefined) {
    return { ...patch, article: undefined }
  }
  return patch
}
