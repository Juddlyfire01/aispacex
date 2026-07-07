import { describe, it, expect } from 'vitest'
import { b64encode, b64decode } from './base64'

describe('b64encode / b64decode', () => {
  it('round-trips small buffers', () => {
    const bytes = new Uint8Array([0, 1, 2, 250, 255])
    const out = b64decode(b64encode(bytes.buffer))
    expect([...out]).toEqual([...bytes])
  })

  it('round-trips buffers larger than the 32KB chunk without overflowing', () => {
    // Regression: a >100KB ciphertext (gathered corpus + report history) used to
    // blow the call stack in String.fromCharCode(...bytes), so persists failed
    // silently and reports vanished on reload/reconnect.
    const big = new Uint8Array(512 * 1024)
    for (let i = 0; i < big.length; i++) big[i] = i % 256
    const encoded = b64encode(big.buffer)
    const decoded = b64decode(encoded)
    expect(decoded.length).toBe(big.length)
    expect(decoded[0]).toBe(0)
    expect(decoded[100_000]).toBe(100_000 % 256)
    expect(decoded[decoded.length - 1]).toBe((big.length - 1) % 256)
  })

  it('round-trips the empty buffer', () => {
    expect(b64encode(new ArrayBuffer(0))).toBe('')
    expect(b64decode('').length).toBe(0)
  })
})
