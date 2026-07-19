// Browser helper to upload an image data URL through the server-side media
// proxy (/api/x/media). The browser sends no token; the serverless function
// attaches the user-context access token. Errors carry a flag so the UI can
// prompt a reconnect when the write scope is missing.

export class XMediaError extends Error {
  status: number
  needsReconnect: boolean

  constructor(message: string, status: number, needsReconnect: boolean) {
    super(message)
    this.name = 'XMediaError'
    this.status = status
    this.needsReconnect = needsReconnect
  }
}

export interface MediaUploadResult {
  mediaId: string
  mediaKey?: string
}

export type MediaCategory = 'tweet_image' | 'tweet_gif'

function mediaErrorMessage(json: { error?: string }, status: number, verb: string): string {
  return json?.error === 'x_not_connected'
    ? `Connect your X account to ${verb}.`
    : json?.error === 'x_session_expired'
      ? `Your X session expired — reconnect to ${verb}.`
      : json?.error || `Media ${verb} failed (HTTP ${status})`
}

export async function uploadImageDataUrl(
  dataUrl: string,
  mediaCategory: MediaCategory = 'tweet_image',
): Promise<MediaUploadResult> {
  const res = await fetch('/api/x/media', {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ dataUrl, mediaCategory }),
  })

  const json = await res.json().catch(() => ({}))

  if (!res.ok) {
    const needsReconnect = Boolean(json?.needsReconnect) || res.status === 401
    throw new XMediaError(mediaErrorMessage(json, res.status, 'upload media'), res.status, needsReconnect)
  }

  return json as MediaUploadResult
}

/** Set alt text on an already-uploaded media id. No-op when text is empty. */
export async function setMediaAltText(mediaId: string, altText: string): Promise<void> {
  const text = altText.trim()
  if (!text) return

  const res = await fetch('/api/x/media-metadata', {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ mediaId, altText: text.slice(0, 1000) }),
  })

  const json = await res.json().catch(() => ({}))

  if (!res.ok) {
    const needsReconnect = Boolean(json?.needsReconnect) || res.status === 401
    throw new XMediaError(mediaErrorMessage(json, res.status, 'set media alt text'), res.status, needsReconnect)
  }
}
