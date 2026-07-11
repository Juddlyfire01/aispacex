import { b64decode } from '../base64'

/** Parse a `data:<mime>;base64,<payload>` URL into mime type and raw bytes. */
export function parseDataUrl(dataUrl: string): { mime: string; bytes: Uint8Array } {
  const match = /^data:([^;,]+);base64,(.+)$/s.exec(dataUrl)
  if (!match) {
    if (!dataUrl.startsWith('data:')) {
      throw new Error('Invalid data URL: missing data: prefix')
    }
    if (!/;base64,/i.test(dataUrl)) {
      throw new Error('Invalid data URL: only base64 encoding is supported')
    }
    throw new Error('Invalid data URL: missing or empty base64 payload')
  }

  const mime = match[1].trim()
  const b64 = match[2].replace(/\s/g, '')
  if (!b64) {
    throw new Error('Invalid data URL: missing or empty base64 payload')
  }

  return { mime, bytes: b64decode(b64) }
}
