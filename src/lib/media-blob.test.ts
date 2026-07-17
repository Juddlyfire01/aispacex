import { describe, expect, it } from 'vitest'
import { blobFromBase64, extensionForMime, mimeFromBase64, rawBase64 } from './media-blob'

describe('mimeFromBase64', () => {
  it('detects png/jpeg/webp prefixes and data URLs', () => {
    expect(mimeFromBase64('iVBOR')).toBe('image/png')
    expect(mimeFromBase64('/9j/')).toBe('image/jpeg')
    expect(mimeFromBase64('UklGR')).toBe('image/webp')
    expect(mimeFromBase64('data:image/png;base64,aaa')).toBe('image/png')
  })
})

describe('rawBase64', () => {
  it('strips data URL prefix and leaves plain base64 unchanged', () => {
    expect(rawBase64('data:image/png;base64,iVBOR')).toBe('iVBOR')
    expect(rawBase64('data:image/jpeg;base64,/9j/4AAQ')).toBe('/9j/4AAQ')
    expect(rawBase64('iVBOR')).toBe('iVBOR')
  })
})

describe('blobFromBase64', () => {
  it('returns a Blob with the detected mime type', () => {
    const b64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='
    const blob = blobFromBase64(b64)
    expect(blob.type).toBe('image/png')
    expect(blob.size).toBeGreaterThan(0)
  })
})

describe('extensionForMime', () => {
  it('maps common mime types', () => {
    expect(extensionForMime('image/png')).toBe('png')
    expect(extensionForMime('image/jpeg')).toBe('jpg')
    expect(extensionForMime('video/mp4')).toBe('mp4')
  })
})
