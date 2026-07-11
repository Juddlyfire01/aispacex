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

export async function uploadImageDataUrl(dataUrl: string): Promise<MediaUploadResult> {
  const res = await fetch('/api/x/media', {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ dataUrl, mediaCategory: 'tweet_image' }),
  })

  const json = await res.json().catch(() => ({}))

  if (!res.ok) {
    const message =
      json?.error === 'x_not_connected'
        ? 'Connect your X account to upload media.'
        : json?.error === 'x_session_expired'
          ? 'Your X session expired — reconnect to upload media.'
          : json?.error || `Media upload failed (HTTP ${res.status})`
    const needsReconnect = Boolean(json?.needsReconnect) || res.status === 401
    throw new XMediaError(message, res.status, needsReconnect)
  }

  return json as MediaUploadResult
}
