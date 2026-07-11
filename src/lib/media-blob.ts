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

export function blobFromBase64(b64: string): Blob {
  const mime = mimeFromBase64(b64)
  const raw = b64.startsWith('data:') ? b64.slice(b64.indexOf(',') + 1) : b64
  const binary = atob(raw)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return new Blob([bytes], { type: mime })
}

export function extensionForMime(mime: string): string {
  if (mime === 'image/jpeg') return 'jpg'
  if (mime === 'image/webp') return 'webp'
  if (mime === 'image/png') return 'png'
  if (mime.startsWith('video/')) return 'mp4'
  return 'bin'
}

export async function blobFromUrl(url: string): Promise<Blob> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Failed to fetch media (${res.status})`)
  return res.blob()
}
