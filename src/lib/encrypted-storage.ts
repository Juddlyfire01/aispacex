import type { StateStorage } from 'zustand/middleware'
import { encryptString, decryptString } from './device-crypto'
import { toast } from '../stores/toast-store'

// Async zustand `StateStorage` that transparently encrypts persisted values at
// rest using the device-bound key (see device-crypto.ts). zustand/persist fully
// supports async storage, so getItem/setItem may return promises.
//
// Values are stored as `enc:v1:<iv.ct>`. On read we detect the prefix: encrypted
// values are decrypted; anything else is treated as legacy plaintext and passed
// through unchanged (so existing users' caches survive the upgrade and get
// re-written encrypted on the next persist). If decryption fails (e.g. the
// device key was cleared), we drop the entry rather than crash hydration.

const ENC_PREFIX = 'enc:v1:'

// Per-key coalesced write loop. Rapid setItem calls (e.g. every streamed token
// into a persisted store) must NOT each AES-GCM encrypt + localStorage write —
// that freezes the main thread and makes streaming feel click-clunky.
//
// Pattern: keep only the latest pending value per key. While a write is in
// flight, newer setItems overwrite the pending slot; when the flight finishes
// we write that latest snapshot once. Guarantees last-write-wins without
// encrypting intermediate frames.
const pendingValues = new Map<string, string>()
const writeLoops = new Map<string, Promise<void>>()

// A silent persist failure means data loss on the next reload — exactly the bug
// where reports vanished across disconnect/reconnect. Surface it loudly, but
// only once per key per session so a failing store doesn't spam toasts.
const warnedKeys = new Set<string>()
function reportPersistFailure(name: string, reason: string, err?: unknown): void {
  console.warn(`[encrypted-storage] ${reason}; skipped persisting ${name}`, err ?? '')
  if (warnedKeys.has(name)) return
  warnedKeys.add(name)
  try {
    toast.error(
      'Saving data failed',
      `Could not persist "${name}" (${reason}). Changes will be lost when you close or reload this tab.`,
    )
  } catch { /* toast store unavailable (e.g. tests) */ }
}

async function encryptAndStore(name: string, value: string): Promise<void> {
  let payload: string
  try {
    payload = ENC_PREFIX + (await encryptString(value))
  } catch (err) {
    // Encryption unavailable → fail closed: never persist the sensitive
    // corpus in plaintext. Data stays in memory for the session only —
    // tell the user instead of losing their reports silently.
    reportPersistFailure(name, 'encryption unavailable', err)
    return
  }
  try {
    localStorage.setItem(name, payload)
  } catch (err) {
    reportPersistFailure(name, 'storage write failed (quota?)', err)
  }
}

function enqueueWrite(name: string, value: string): Promise<void> {
  pendingValues.set(name, value)
  const existing = writeLoops.get(name)
  if (existing) return existing

  const loop = (async () => {
    try {
      while (pendingValues.has(name)) {
        const next = pendingValues.get(name)
        pendingValues.delete(name)
        if (next == null) continue
        await encryptAndStore(name, next)
      }
    } finally {
      if (writeLoops.get(name) === loop) writeLoops.delete(name)
    }
  })()

  writeLoops.set(name, loop)
  return loop
}

export function createEncryptedStorage(): StateStorage {
  return {
    getItem: async (name) => {
      let raw: string | null
      try { raw = localStorage.getItem(name) } catch { return null }
      if (raw == null) return null
      if (!raw.startsWith(ENC_PREFIX)) return raw // legacy plaintext passthrough
      try {
        return await decryptString(raw.slice(ENC_PREFIX.length))
      } catch {
        // Key missing/rotated or ciphertext corrupt — treat as no data.
        try { localStorage.removeItem(name) } catch { /* noop */ }
        return null
      }
    },
    setItem: (name, value) => enqueueWrite(name, value),
    removeItem: (name) => {
      // Drop any coalesced snapshot and sequence removal after the current loop.
      pendingValues.delete(name)
      const prev = writeLoops.get(name) ?? Promise.resolve()
      const next = prev
        .catch(() => { /* ignore prior write failure */ })
        .then(() => { try { localStorage.removeItem(name) } catch { /* noop */ } })
      writeLoops.set(name, next)
      next.finally(() => { if (writeLoops.get(name) === next) writeLoops.delete(name) })
      return next
    },
  }
}
