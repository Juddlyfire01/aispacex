export function mimeFromBase64(b64: string): string {
  if (b64.startsWith('data:')) {
    const m = /^data:([^;]+);/.exec(b64)
    return m?.[1] ?? 'application/octet-stream'
  }
  if (b64.startsWith('/9j/')) return 'image/jpeg'
  if (b64.startsWith('iVBOR')) return 'image/png'
  if (b64.startsWith('UklGR')) return 'image/webp'
  return 'image/png'
}

/** Strip a `data:<mime>;base64,` prefix. Venice `/image/upscale` (and often
 * `/image/edit`) expect plain base64 — a data-URL prefix decodes as garbage
 * and surfaces as "incomplete or corrupted". */
export function rawBase64(b64: string): string {
  if (!b64.startsWith('data:')) return b64
  const comma = b64.indexOf(',')
  return comma >= 0 ? b64.slice(comma + 1) : b64
}

export function blobFromBase64(b64: string): Blob {
  const mime = mimeFromBase64(b64)
  const binary = atob(rawBase64(b64))
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return new Blob([bytes], { type: mime })
}

export function extensionForMime(mime: string): string {
  if (mime === 'image/jpeg') return 'jpg'
  if (mime === 'image/webp') return 'webp'
  if (mime === 'image/png') return 'png'
  if (mime === 'audio/mpeg' || mime === 'audio/mp3') return 'mp3'
  if (mime === 'audio/wav' || mime === 'audio/x-wav') return 'wav'
  if (mime.startsWith('audio/')) return 'audio'
  if (mime.startsWith('video/')) return 'mp4'
  return 'bin'
}

export async function blobFromUrl(url: string): Promise<Blob> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Failed to fetch media (${res.status})`)
  return res.blob()
}
