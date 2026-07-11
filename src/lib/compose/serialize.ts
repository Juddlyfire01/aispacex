import type { PostDraft } from './types'
import { POST_ID_RE, normalizePostId, postUrl } from '../x-intel/evidence'

/** Rewrite bare / post: snowflakes to permalinks; leave ids inside URLs alone. */
export function rewritePostIdsToUrls(text: string): string {
  return text.replace(new RegExp(POST_ID_RE.source, 'g'), (match, id: string, offset: number) => {
    const before = text.slice(Math.max(0, offset - 32), offset)
    if (/https?:\/\/(?:www\.)?(?:x|twitter)\.com\/(?:i\/status|[^/\s]+\/status)\/?$/i.test(before)) {
      return match
    }
    if (/https?:\/\/\S*$/i.test(before)) return match
    const normalized = normalizePostId(id)
    if (!normalized) return match
    return postUrl(normalized)
  })
}

function targetSuffix(draft: PostDraft): string {
  if (draft.target.kind === 'reply') {
    const u = draft.target.toUsername.replace(/^@/, '')
    return `\n\nReplying to @${u}: ${postUrl(draft.target.toPostId)}`
  }
  if (draft.target.kind === 'quote') {
    const u = draft.target.username.replace(/^@/, '')
    return `\n\nQuoting @${u}: ${postUrl(draft.target.postId)}`
  }
  return ''
}

function serializeArticle(draft: PostDraft): string | null {
  const a = draft.article
  if (!a) return null
  const title = a.title.trim()
  const body = rewritePostIdsToUrls(a.bodyMarkdown ?? '')
  if (!title && !body.trim()) return null
  const head = title ? `${title}\n\n` : ''
  return `${head}${body}`.trim() + targetSuffix(draft)
}

export function serializeDraftForCopy(draft: PostDraft): string {
  const article = serializeArticle(draft)
  if (article) return article

  const parts =
    draft.segments.length > 1
      ? draft.segments.map((s, i) =>
          `${i + 1}/${draft.segments.length} ${rewritePostIdsToUrls(s.text)}`.trim(),
        )
      : [rewritePostIdsToUrls(draft.segments[0]?.text ?? '')]

  return parts.join('\n\n').trimEnd() + targetSuffix(draft)
}
