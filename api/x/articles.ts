// POST /api/x/articles
// Authenticated write to the X API v2 Articles endpoints for the OAuth-connected
// user. Creates a draft Article, publishes it, and returns the seed post URL.
// The browser sends NO token; we attach the user-context access token
// (refreshing if needed) server-side.
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { X_API_BASE } from '../_lib/x-oauth.js'
import { resolveSession, clearSessionCookies } from '../_lib/x-session.js'

interface CoverMedia {
  media_category: string
  media_id: string
}

interface ArticlesBody {
  title?: string
  content_state?: { blocks?: unknown[]; entities?: unknown[] }
  cover_media?: CoverMedia
}

interface DraftResponse {
  data?: { id?: string; title?: string }
  errors?: { title?: string; detail?: string }[]
  detail?: string
  title?: string
}

interface PublishResponse {
  data?: { post_id?: string }
  errors?: { title?: string; detail?: string }[]
  detail?: string
  title?: string
}

function xErrorDetail(
  json: { errors?: { title?: string; detail?: string }[]; detail?: string; title?: string },
  status: number,
): string {
  return json.errors?.[0]?.detail || json.detail || json.title || `X API error (${status})`
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  let session
  try {
    session = await resolveSession(req)
  } catch {
    clearSessionCookies(res)
    return res.status(401).json({ error: 'x_session_expired' })
  }
  if (!session) return res.status(401).json({ error: 'x_not_connected' })
  if (session.setCookies.length) res.setHeader('Set-Cookie', session.setCookies)

  const body = req.body as ArticlesBody
  const title = typeof body?.title === 'string' ? body.title.trim() : ''
  if (!title) return res.status(400).json({ error: 'empty_title' })

  const contentState = body?.content_state
  const blocks = contentState?.blocks
  if (!Array.isArray(blocks) || blocks.length === 0) {
    return res.status(400).json({ error: 'empty_content' })
  }

  const draftPayload: Record<string, unknown> = {
    title,
    content_state: contentState,
  }
  if (body.cover_media?.media_id && body.cover_media?.media_category) {
    draftPayload.cover_media = {
      media_category: body.cover_media.media_category,
      media_id: body.cover_media.media_id,
    }
  }

  let draftRes: Response
  try {
    draftRes = await fetch(`${X_API_BASE}/articles/draft`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${session.accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(draftPayload),
    })
  } catch {
    return res.status(502).json({ error: 'x_upstream_unreachable' })
  }

  const draftJson = (await draftRes.json().catch(() => ({}))) as DraftResponse
  const articleId = draftJson.data?.id
  if (!draftRes.ok || !articleId) {
    const detail = xErrorDetail(draftJson, draftRes.status)
    return res.status(draftRes.status === 200 || draftRes.status === 201 ? 502 : draftRes.status).json({
      error: detail,
      needsReconnect: draftRes.status === 403,
    })
  }

  let publishRes: Response
  try {
    publishRes = await fetch(`${X_API_BASE}/articles/${articleId}/publish`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${session.accessToken}`,
        'Content-Type': 'application/json',
      },
    })
  } catch {
    return res.status(502).json({ error: 'x_upstream_unreachable', articleId })
  }

  const publishJson = (await publishRes.json().catch(() => ({}))) as PublishResponse
  const postId = publishJson.data?.post_id
  if (!publishRes.ok || !postId) {
    const detail = xErrorDetail(publishJson, publishRes.status)
    return res.status(publishRes.status === 200 ? 502 : publishRes.status).json({
      error: detail,
      needsReconnect: publishRes.status === 403,
      articleId,
    })
  }

  return res.status(200).json({
    id: articleId,
    postId,
    url: `https://x.com/i/web/status/${postId}`,
  })
}
