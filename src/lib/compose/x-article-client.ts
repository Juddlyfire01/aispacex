// Browser helper to publish an X Article through media upload + /api/x/articles.
// Uploads cover/inline images first, converts markdown to DraftJS content_state,
// then creates + publishes the article. Errors mirror XPostError / XMediaError.

import { markdownToContentState } from './article-draftjs'
import type { MediaItem, PostDraft } from './types'
import { uploadImageDataUrl, XMediaError } from './x-media-client'
import type { PostResult } from './x-post-client'

export class XArticleError extends Error {
  status: number
  needsReconnect: boolean

  constructor(message: string, status: number, needsReconnect: boolean) {
    super(message)
    this.name = 'XArticleError'
    this.status = status
    this.needsReconnect = needsReconnect
  }
}

const MEDIA_REF_RE = /\(media:([^)]+)\)/g

/**
 * Ensure every inline media id appears as `![…](media:id)` in the markdown so
 * markdownToContentState can emit atomic image blocks for the images map.
 */
export function buildArticleMarkdownWithMedia(
  bodyMarkdown: string,
  inlineMedia: Array<{ id: string }>,
): string {
  let md = bodyMarkdown ?? ''
  const referenced = new Set<string>()
  const re = new RegExp(MEDIA_REF_RE.source, 'g')
  let m: RegExpExecArray | null
  while ((m = re.exec(md)) !== null) referenced.add(m[1].trim())

  for (const item of inlineMedia) {
    if (!item.id || referenced.has(item.id)) continue
    md += `\n\n![image](media:${item.id})\n`
    referenced.add(item.id)
  }
  return md
}

async function resolveUploadedMedia(item: MediaItem): Promise<{ mediaId: string; mediaKey?: string }> {
  if (item.mediaId) {
    return { mediaId: item.mediaId }
  }
  if (!item.dataUrl) {
    throw new XMediaError(`Media "${item.id}" has no dataUrl or mediaId to upload.`, 400, false)
  }
  return uploadImageDataUrl(item.dataUrl)
}

export async function publishArticleDraft(draft: PostDraft): Promise<PostResult> {
  const article = draft.article
  if (!article) throw new XArticleError('Draft has no article payload.', 400, false)

  const title = article.title.trim()
  const bodyMarkdown = article.bodyMarkdown ?? ''
  if (!title) throw new XArticleError('Article title is required.', 400, false)
  if (!bodyMarkdown.trim() && article.inlineMedia.length === 0) {
    throw new XArticleError('Article body is required.', 400, false)
  }

  let cover_media: { media_category: string; media_id: string } | undefined
  if (article.cover) {
    const uploaded = await resolveUploadedMedia(article.cover)
    cover_media = { media_category: 'TWEET_IMAGE', media_id: uploaded.mediaId }
  }

  const images: Record<string, { mediaId: string; mediaKey?: string }> = {}
  for (const item of article.inlineMedia) {
    const uploaded = await resolveUploadedMedia(item)
    images[item.id] = uploaded
  }

  const md = buildArticleMarkdownWithMedia(bodyMarkdown, article.inlineMedia)
  const content_state = markdownToContentState(md, { images })

  if (content_state.blocks.length === 0) {
    throw new XArticleError('Article content is empty after conversion.', 400, false)
  }

  const res = await fetch('/api/x/articles', {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      title,
      content_state,
      ...(cover_media ? { cover_media } : {}),
    }),
  })

  const json = await res.json().catch(() => ({}))

  if (!res.ok) {
    const message =
      json?.error === 'x_not_connected'
        ? 'Connect your X account to publish an article.'
        : json?.error === 'x_session_expired'
          ? 'Your X session expired — reconnect to publish.'
          : json?.error || `Article publish failed (HTTP ${res.status})`
    const needsReconnect = Boolean(json?.needsReconnect) || res.status === 401
    throw new XArticleError(message, res.status, needsReconnect)
  }

  const postId = typeof json.postId === 'string' ? json.postId : ''
  const url = typeof json.url === 'string' ? json.url : ''
  if (!postId || !url) {
    throw new XArticleError('Article publish response missing post id or url.', 502, false)
  }

  return { id: postId, ids: [postId], url }
}
