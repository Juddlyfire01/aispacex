// POST /api/x/media
// Authenticated simple image upload to X API v2 for the OAuth-connected user.
// The browser sends a data URL (no token); we attach the user-context access
// token (refreshing if needed) and forward multipart bytes to X.
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { X_API_BASE } from '../_lib/x-oauth.js'
import { resolveSession, clearSessionCookies } from '../_lib/x-session.js'
import { parseDataUrl } from '../../src/lib/compose/data-url.js'

interface MediaBody {
  dataUrl?: string
  mediaCategory?: string
}

interface XMediaResponse {
  data?: { id?: string; media_key?: string }
  media_id_string?: string
  media_id?: number | string
  errors?: { title?: string; detail?: string }[]
  detail?: string
  title?: string
  message?: string
}

function extForMime(mime: string): string {
  if (mime === 'image/jpeg' || mime === 'image/pjpeg') return 'jpg'
  if (mime === 'image/png') return 'png'
  if (mime === 'image/webp') return 'webp'
  if (mime === 'image/gif') return 'gif'
  if (mime === 'image/bmp') return 'bmp'
  if (mime === 'image/tiff') return 'tiff'
  return 'bin'
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

  const body = req.body as MediaBody
  const dataUrl = typeof body?.dataUrl === 'string' ? body.dataUrl : ''
  if (!dataUrl) return res.status(400).json({ error: 'missing_data_url' })

  let mime: string
  let bytes: Uint8Array
  try {
    ;({ mime, bytes } = parseDataUrl(dataUrl))
  } catch (err) {
    return res.status(400).json({
      error: err instanceof Error ? err.message : 'invalid_data_url',
    })
  }

  const mediaCategory =
    typeof body.mediaCategory === 'string' && body.mediaCategory.trim()
      ? body.mediaCategory.trim()
      : 'tweet_image'

  const form = new FormData()
  const filename = `upload.${extForMime(mime)}`
  form.append('media', new Blob([bytes], { type: mime }), filename)
  form.append('media_category', mediaCategory)
  form.append('media_type', mime)

  let xRes: Response
  try {
    xRes = await fetch(`${X_API_BASE}/media/upload`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${session.accessToken}`,
        // Let fetch set multipart boundary — do not set Content-Type manually.
      },
      body: form,
    })
  } catch {
    return res.status(502).json({ error: 'x_upstream_unreachable' })
  }

  const json = (await xRes.json().catch(() => ({}))) as XMediaResponse
  const mediaId =
    json.data?.id ||
    json.media_id_string ||
    (json.media_id != null ? String(json.media_id) : undefined)

  if (!xRes.ok || !mediaId) {
    const detail =
      json.errors?.[0]?.detail ||
      json.detail ||
      json.title ||
      json.message ||
      `X API error (${xRes.status})`
    return res.status(xRes.status === 200 ? 502 : xRes.status).json({
      error: detail,
      needsReconnect: xRes.status === 403,
    })
  }

  const result: { mediaId: string; mediaKey?: string } = { mediaId }
  if (json.data?.media_key) result.mediaKey = json.data.media_key
  return res.status(200).json(result)
}
