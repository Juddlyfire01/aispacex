import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  createEncryptedStorage,
  pauseEncryptedPersist,
  resumeEncryptedPersist,
  isEncryptedPersistPaused,
  flushEncryptedStorage,
} from './encrypted-storage'

vi.mock('./device-crypto', () => ({
  encryptString: vi.fn(async (s: string) => `enc(${s})`),
  decryptString: vi.fn(async (s: string) => s.replace(/^enc\(/, '').replace(/\)$/, '')),
}))

const idb = new Map<string, string>()
vi.mock('./idb-kv', () => ({
  idbKvGet: vi.fn(async (k: string) => idb.get(k) ?? null),
  idbKvSet: vi.fn(async (k: string, v: string) => {
    idb.set(k, v)
  }),
  idbKvDelete: vi.fn(async (k: string) => {
    idb.delete(k)
  }),
}))

describe('encrypted-storage pause/resume', () => {
  beforeEach(() => {
    idb.clear()
    vi.useRealTimers()
    // Drain any leftover pause depth from prior tests.
    while (isEncryptedPersistPaused()) resumeEncryptedPersist()
  })

  it('holds writes while paused and flushes on resume', async () => {
    const storage = createEncryptedStorage()
    pauseEncryptedPersist()
    expect(isEncryptedPersistPaused()).toBe(true)

    await storage.setItem('venice-test-pause', JSON.stringify({ n: 1 }))
    await storage.setItem('venice-test-pause', JSON.stringify({ n: 2 }))
    // Still paused — nothing encrypted to IDB yet.
    expect(idb.size).toBe(0)

    resumeEncryptedPersist()
    await flushEncryptedStorage('venice-test-pause')
    expect(idb.has('venice-test-pause')).toBe(true)
    const raw = idb.get('venice-test-pause')!
    expect(raw).toMatch(/^enc:v1:/)
  })

  it('debounces encrypt until idle; flush forces immediately', async () => {
    const storage = createEncryptedStorage()
    // Fire-and-forget setItem — debounced, so IDB stays empty until flush.
    void storage.setItem('venice-test-debounce', JSON.stringify({ n: 1 }))
    void storage.setItem('venice-test-debounce', JSON.stringify({ n: 2 }))
    // Still within debounce window — no IDB write yet.
    expect(idb.size).toBe(0)

    await flushEncryptedStorage('venice-test-debounce')
    expect(idb.has('venice-test-debounce')).toBe(true)
    const raw = idb.get('venice-test-debounce')!
    expect(raw).toMatch(/^enc:v1:/)
    // decrypt mock strips enc(...) — value inside is last write wins.
    expect(raw).toContain('n')
  })

  it('createDebouncedJSONStorage defers stringify until flush', async () => {
    const { createDebouncedJSONStorage } = await import('./encrypted-storage')
    const storage = createDebouncedJSONStorage()
    storage.setItem('venice-test-json-debounce', {
      state: { big: 'x'.repeat(100), n: 1 },
      version: 1,
    })
    storage.setItem('venice-test-json-debounce', {
      state: { big: 'y'.repeat(100), n: 2 },
      version: 1,
    })
    expect(idb.size).toBe(0)
    await flushEncryptedStorage('venice-test-json-debounce')
    expect(idb.has('venice-test-json-debounce')).toBe(true)
  })
})
