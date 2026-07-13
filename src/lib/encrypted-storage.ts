import type { StateStorage } from 'zustand/middleware'
import { encryptString, decryptString } from './device-crypto'
import { idbKvGet, idbKvSet, idbKvDelete } from './idb-kv'
import { toast } from '../stores/toast-store'

// Async zustand `StateStorage` that transparently encrypts persisted values at
// rest using the device-bound key (see device-crypto.ts). zustand/persist fully
// supports async storage, so getItem/setItem may return promises.
//
// Backend: IndexedDB (see idb-kv.ts). We MOVED off localStorage because its
// ~5MB per-origin cap (independent of disk space) made large X-intel corpora +
// stacked report snapshots throw QuotaExceededError — reports built in memory
// but never persisted. IndexedDB quotas are far larger. On read we migrate any
// value still sitting in legacy localStorage into IndexedDB, then clear it.
//
// Values are stored as `enc:v1:<iv.ct>`. On read we detect the prefix: encrypted
// values are decrypted; anything else is treated as legacy plaintext and passed
// through unchanged (so existing users' caches survive the upgrade and get
// re-written encrypted on the next persist). If decryption fails (e.g. the
// device key was cleared), we drop the entry rather than crash hydration.

const ENC_PREFIX = 'enc:v1:'

// Per-key coalesced write loop. Rapid setItem calls (e.g. every streamed token
// into a persisted store) must NOT each AES-GCM encrypt + IndexedDB write —
// that freezes the main thread and makes streaming feel click-clunky.
//
// Pattern: keep only the latest pending value per key. While a write is in
// flight, newer setItems overwrite the pending slot; when the flight finishes
// we write that latest snapshot once. Guarantees last-write-wins without
// encrypting intermediate frames.
const pendingValues = new Map<string, string>()
const writeLoops = new Map<string, Promise<void>>()
/** Last completed write outcome per key (for callers that await flush). */
const lastWriteOk = new Map<string, boolean>()

// A silent persist failure means data loss on the next reload — exactly the bug
// where reports vanished across disconnect/reconnect. Surface it loudly, but
// only once per key per session so a failing store doesn't spam toasts.
const warnedKeys = new Set<string>()

function reportPersistFailure(name: string, reason: string, err?: unknown): void {
  console.warn(`[encrypted-storage] ${reason}; skipped persisting ${name}`, err ?? '')
  if (warnedKeys.has(name)) return
  warnedKeys.add(name)
  try {
    const isQuota =
      reason.includes('quota') ||
      (err instanceof DOMException && (err.name === 'QuotaExceededError' || err.code === 22))
    toast.error(
      'Could not save data',
      isQuota
        ? 'Browser storage quota exceeded. Delete old reports or targets to free room. Data stays in this tab until you reload.'
        : `Save failed (${reason}). Data stays in this tab until you reload.`,
    )
  } catch { /* toast store unavailable (e.g. tests) */ }
}

async function encryptAndStore(name: string, value: string): Promise<boolean> {
  let payload: string
  try {
    payload = ENC_PREFIX + (await encryptString(value))
  } catch (err) {
    // Encryption unavailable → fail closed: never persist the sensitive
    // corpus in plaintext. Data stays in memory for the session only —
    // tell the user instead of losing their reports silently.
    reportPersistFailure(name, 'encryption unavailable', err)
    lastWriteOk.set(name, false)
    return false
  }
  try {
    await idbKvSet(name, payload)
    lastWriteOk.set(name, true)
    // Successful write → allow a future failure to toast again.
    warnedKeys.delete(name)
    return true
  } catch (err) {
    reportPersistFailure(name, 'storage write failed (quota?)', err)
    lastWriteOk.set(name, false)
    return false
  }
}

function enqueueWrite(name: string, value: string): Promise<void> {
  pendingValues.set(name, value)
  const existing = writeLoops.get(name)
  if (existing) return existing

  // Declare first so the async body can compare identity in `finally`
  // without TS2454 (used before assigned).
  let loop!: Promise<void>
  loop = (async () => {
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

/**
 * Wait until all coalesced encrypted writes for `name` have finished.
 * Returns false if the last write for that key failed (quota, crypto, etc.).
 * Call after critical mutations (e.g. appendReport) so the UI can report save failure.
 */
export async function flushEncryptedStorage(name: string): Promise<boolean> {
  const loop = writeLoops.get(name)
  if (loop) await loop
  // If nothing was queued, treat as ok (no pending loss).
  if (!lastWriteOk.has(name)) return true
  return lastWriteOk.get(name) === true
}

/**
 * Read the raw stored envelope for `name`, preferring IndexedDB. If nothing is
 * there yet, migrate a legacy localStorage value (from before the IDB move) into
 * IndexedDB and clear the localStorage copy so the ~5MB cap is never hit again.
 */
async function readRaw(name: string): Promise<string | null> {
  let raw: string | null = null
  try { raw = await idbKvGet(name) } catch { raw = null }
  if (raw != null) return raw

  // One-time migration from legacy localStorage.
  let legacy: string | null = null
  try { legacy = localStorage.getItem(name) } catch { legacy = null }
  if (legacy == null) return null
  // Best-effort copy into IDB, then drop the localStorage entry to free the cap.
  try { await idbKvSet(name, legacy) } catch { /* keep serving from legacy this session */ }
  try { localStorage.removeItem(name) } catch { /* noop */ }
  return legacy
}

export function createEncryptedStorage(): StateStorage {
  return {
    getItem: async (name) => {
      const raw = await readRaw(name)
      if (raw == null) return null
      if (!raw.startsWith(ENC_PREFIX)) return raw // legacy plaintext passthrough
      try {
        return await decryptString(raw.slice(ENC_PREFIX.length))
      } catch {
        // Key missing/rotated or ciphertext corrupt — treat as no data.
        try { await idbKvDelete(name) } catch { /* noop */ }
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
        .then(async () => {
          try { await idbKvDelete(name) } catch { /* noop */ }
          try { localStorage.removeItem(name) } catch { /* noop */ }
        })
      writeLoops.set(name, next)
      next.finally(() => { if (writeLoops.get(name) === next) writeLoops.delete(name) })
      return next
    },
  }
}
