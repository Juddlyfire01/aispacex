import type { PostDraft } from './types'
import { POST_ID_RE, normalizePostId, postUrl } from '../x-intel/evidence'
import { splitArticleImagePrompt } from './article-parse'
import { markdownToArticleHtml, markdownToArticlePlain } from './article-html'

/** Rewrite bare / post: snowflakes to permalinks; leave ids inside URLs alone. */
export function rewritePostIdsToUrls(text: string): string {
  return text.replace(new RegExp(POST_ID_RE.source, 'g'), (match, id: string, offset: number) => {
    if (/status\/$/i.test(text.slice(Math.max(0, offset - 8), offset))) return match
    const before = text.slice(Math.max(0, offset - 32), offset)
    if (/https?:\/\/\S*$/i.test(before)) return match
    const normalized = normalizePostId(id)
    if (!normalized) return match
    return postUrl(normalized)
  })
}

function targetSuffix(draft: PostDraft): string {
  if (draft.target.kind === 'reply') {
    const u = draft.target.toUsername.replace(/^@/, '')
    const id = normalizePostId(draft.target.toPostId) ?? draft.target.toPostId
    return `\n\nReplying to @${u}: ${postUrl(id)}`
  }
  if (draft.target.kind === 'quote') {
    const u = draft.target.username.replace(/^@/, '')
    const id = normalizePostId(draft.target.postId) ?? draft.target.postId
    return `\n\nQuoting @${u}: ${postUrl(id)}`
  }
  return ''
}

function serializeArticlePlain(draft: PostDraft): string | null {
  const a = draft.article
  if (!a) return null
  const title = a.title.trim()
  const { body: cleanBody } = splitArticleImagePrompt(a.bodyMarkdown ?? '')
  const body = markdownToArticlePlain(rewritePostIdsToUrls(cleanBody))
  if (!title && !body.trim()) return null
  const head = title ? `${title}\n\n` : ''
  return `${head}${body}`.trim() + targetSuffix(draft)
}

/** Rich HTML for article clipboard paste into X Articles (title + body). */
export function serializeDraftForCopyHtml(draft: PostDraft): string | null {
  const a = draft.article
  if (!a) return null
  const title = a.title.trim()
  const { body: cleanBody } = splitArticleImagePrompt(a.bodyMarkdown ?? '')
  const bodyHtml = markdownToArticleHtml(rewritePostIdsToUrls(cleanBody))
  if (!title && !bodyHtml) return null
  const titleHtml = title
    ? `<h1>${title.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</h1>`
    : ''
  return `${titleHtml}${bodyHtml}`
}

export function serializeDraftForCopy(draft: PostDraft): string {
  const article = serializeArticlePlain(draft)
  if (article) return article

  const parts =
    draft.segments.length > 1
      ? draft.segments.map((s, i) =>
          `${i + 1}/${draft.segments.length} ${rewritePostIdsToUrls(s.text)}`.trim(),
        )
      : [rewritePostIdsToUrls(draft.segments[0]?.text ?? '')]

  return parts.join('\n\n').trimEnd() + targetSuffix(draft)
}

/** Prefer rich HTML for articles; plain text for posts/threads. */
export async function copyDraftToClipboard(draft: PostDraft): Promise<void> {
  const html = serializeDraftForCopyHtml(draft)
  const plain = serializeDraftForCopy(draft)
  if (html && typeof ClipboardItem !== 'undefined' && navigator.clipboard.write) {
    await navigator.clipboard.write([
      new ClipboardItem({
        'text/plain': new Blob([plain], { type: 'text/plain' }),
        'text/html': new Blob([html], { type: 'text/html' }),
      }),
    ])
    return
  }
  await navigator.clipboard.writeText(plain)
}
