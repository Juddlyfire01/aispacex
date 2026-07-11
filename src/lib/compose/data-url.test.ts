import { describe, it, expect } from 'vitest'
import { parseDataUrl } from './data-url'

describe('parseDataUrl', () => {
  it('parses a PNG data URL into mime + bytes', () => {
    // 1x1 transparent PNG
    const b64 =
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='
    const { mime, bytes } = parseDataUrl(`data:image/png;base64,${b64}`)
    expect(mime).toBe('image/png')
    expect(bytes).toBeInstanceOf(Uint8Array)
    expect(bytes.length).toBeGreaterThan(0)
    expect(Buffer.from(bytes).toString('base64')).toBe(b64)
  })

  it('parses jpeg mime', () => {
    const { mime, bytes } = parseDataUrl('data:image/jpeg;base64,/9j/4AAQ')
    expect(mime).toBe('image/jpeg')
    expect(bytes.length).toBeGreaterThan(0)
  })

  it('throws on missing data: prefix', () => {
    expect(() => parseDataUrl('image/png;base64,abc')).toThrow(/data url/i)
  })

  it('throws on missing base64 payload', () => {
    expect(() => parseDataUrl('data:image/png;base64,')).toThrow()
  })

  it('throws on non-base64 encoding', () => {
    expect(() => parseDataUrl('data:text/plain,hello')).toThrow(/base64/i)
  })
})
