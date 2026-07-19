// POST /api/x/media-metadata
// Sets alt text (and optionally other metadata) on an already-uploaded media
// id via X API v2 POST /2/media/metadata. Browser sends no token.
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { X_API_BASE } from '../_lib/x-oauth.js'
import { resolveSession, clearSessionCookies } from '../_lib/x-session.js'

interface MetadataBody {
  mediaId?: string
  altText?: string
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

  const body = req.body as MetadataBody
  const mediaId = typeof body?.mediaId === 'string' ? body.mediaId.trim() : ''
  const altText = typeof body?.altText === 'string' ? body.altText.trim() : ''
  if (!mediaId) return res.status(400).json({ error: 'missing_media_id' })
  if (!altText) return res.status(400).json({ error: 'missing_alt_text' })

  let xRes: Response
  try {
    xRes = await fetch(`${X_API_BASE}/media/metadata`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${session.accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        id: mediaId,
        metadata: { alt_text: { text: altText.slice(0, 1000) } },
      }),
    })
  } catch {
    return res.status(502).json({ error: 'x_upstream_unreachable' })
  }

  if (!xRes.ok) {
    const json = (await xRes.json().catch(() => ({}))) as {
      errors?: { detail?: string }[]
      detail?: string
      title?: string
      message?: string
    }
    const needsReconnect = xRes.status === 403
    const detail = needsReconnect
      ? 'Missing media upload permission — reconnect X to grant media.write.'
      : json.errors?.[0]?.detail ||
        json.detail ||
        json.title ||
        json.message ||
        `X API error (${xRes.status})`
    return res.status(xRes.status).json({ error: detail, needsReconnect })
  }

  return res.status(200).json({ ok: true })
}
