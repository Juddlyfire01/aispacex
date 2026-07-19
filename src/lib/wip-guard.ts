// Global work-in-progress survival: flush in-memory drip buffers and encrypted
// store snapshots before the tab is torn down (refresh, close, mobile sleep).
//
// Hard refresh still kills the network stream (browsers cannot keep SSE across
// reloads), but partial assistant text, draft body, and agent timelines that
// were already in the store should land in IndexedDB first.

import { flushEncryptedStorage } from './encrypted-storage'

export type WipFlushHandler = () => void

const handlers = new Set<WipFlushHandler>()
let installed = false
let flushing = false

/** Register a settle handler (compose/chat/playground). Returns unsubscribe. */
export function registerWipFlush(handler: WipFlushHandler): () => void {
  handlers.add(handler)
  ensureInstalled()
  return () => {
    handlers.delete(handler)
  }
}

function runHandlers(): void {
  for (const h of handlers) {
    try {
      h()
    } catch (err) {
      console.warn('[wip-guard] flush handler failed', err)
    }
  }
}

/**
 * Best-effort: settle in-memory buffers, then wait for encrypted IDB writes.
 * Safe to call from pagehide (async may be cut short — still runs sync settle).
 */
export async function flushAllWip(opts?: {
  storageKeys?: string[]
}): Promise<void> {
  if (flushing) return
  flushing = true
  try {
    runHandlers()
    const keys = opts?.storageKeys ?? [
      'venice-compose',
      'venice-compose-prefs',
      'venice-chat',
      'venice-playground',
      'venice-settings',
    ]
    await Promise.all(keys.map((k) => flushEncryptedStorage(k)))
  } finally {
    flushing = false
  }
}

function onPageHide(): void {
  // Sync settle first so pending drip buffers hit the zustand store before the
  // document is destroyed. Then kick async IDB flush (may complete).
  // Note: hard refresh still aborts the network stream — we only preserve what
  // already landed in memory/store.
  void flushAllWip()
}

function onVisibilityChange(): void {
  if (document.visibilityState === 'hidden') {
    void flushAllWip()
  }
}

function ensureInstalled(): void {
  if (installed || typeof window === 'undefined') return
  installed = true
  // pagehide is more reliable than beforeunload for bfcache / mobile.
  window.addEventListener('pagehide', onPageHide)
  document.addEventListener('visibilitychange', onVisibilityChange)
}

/** Install listeners early (optional — registerWipFlush also installs). */
export function installWipGuard(): void {
  ensureInstalled()
}
