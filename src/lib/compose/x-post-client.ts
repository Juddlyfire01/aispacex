import type { MediaItem, PostDraft } from './types'
import { setMediaAltText, uploadImageDataUrl, XMediaError } from './x-media-client'
import type { SegmentInput } from './x-post-payload'

// Browser helper to post a draft through the server-side write proxy
// (/api/x/post). The browser sends no token; the serverless function attaches
// the user-context access token. Errors carry a flag so the UI can prompt a
// reconnect when the write scope is missing.
//
// Images/GIFs are uploaded first via /api/x/media; media_ids are then attached
// on create. Videos are not supported on this path (copy-only in postability).

export class XPostError extends Error {
  status: number
  needsReconnect: boolean

  constructor(message: string, status: number, needsReconnect: boolean) {
    super(message)
    this.name = 'XPostError'
    this.status = status
    this.needsReconnect = needsReconnect
  }
}

export interface PostResult {
  id: string
  ids: string[]
  url: string
}

async function resolveMediaId(item: MediaItem): Promise<string> {
  if (item.kind === 'video') {
    throw new XMediaError('Video upload through the API is not enabled yet.', 400, false)
  }

  let mediaId = item.mediaId
  if (!mediaId) {
    if (!item.dataUrl) {
      throw new XMediaError(`Media "${item.id}" has no dataUrl or mediaId to upload.`, 400, false)
    }
    const category = item.kind === 'gif' ? 'tweet_gif' : 'tweet_image'
    const uploaded = await uploadImageDataUrl(item.dataUrl, category)
    mediaId = uploaded.mediaId
  }

  if (item.altText?.trim()) {
    await setMediaAltText(mediaId, item.altText)
  }

  return mediaId
}

/** Normalize a draft into the write-proxy body (originals/threads + summoned replies). */
export async function draftToPostBody(draft: PostDraft): Promise<{
  segments: SegmentInput[]
  target: { kind: 'reply'; toPostId: string; toUsername: string } | { kind: 'original' }
  replySettings?: PostDraft['replySettings']
  madeWithAi: boolean
}> {
  const segments: SegmentInput[] = []
  for (const s of draft.segments) {
    const mediaIds =
      s.media.length > 0
        ? await Promise.all(s.media.slice(0, 4).map((m) => resolveMediaId(m)))
        : undefined
    segments.push({
      text: s.text,
      poll: s.poll ? { options: s.poll.options, durationMinutes: s.poll.durationMinutes } : undefined,
      ...(mediaIds && mediaIds.length > 0 ? { mediaIds } : {}),
    })
  }

  return {
    segments,
    target:
      draft.target.kind === 'reply'
        ? {
            kind: 'reply' as const,
            toPostId: draft.target.toPostId,
            toUsername: draft.target.toUsername,
          }
        : { kind: 'original' as const },
    replySettings: draft.replySettings,
    madeWithAi: draft.madeWithAi,
  }
}

export async function postDraft(draft: PostDraft): Promise<PostResult> {
  const body = await draftToPostBody(draft)

  const res = await fetch('/api/x/post', {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })

  const json = await res.json().catch(() => ({}))

  if (!res.ok) {
    const message =
      json?.error === 'x_not_connected'
        ? 'Connect your X account to post.'
        : json?.error === 'x_session_expired'
          ? 'Your X session expired — reconnect to post.'
          : json?.error || `Post failed (HTTP ${res.status})`
    const needsReconnect = Boolean(json?.needsReconnect) || res.status === 401
    throw new XPostError(message, res.status, needsReconnect)
  }

  return json as PostResult
}
