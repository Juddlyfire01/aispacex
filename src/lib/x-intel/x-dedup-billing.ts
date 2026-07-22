// X API daily deduplication pass-through for metering / x402 charges.
//
// X only charges once per resource per UTC day
// (https://docs.x.com/x-api/getting-started/pricing#deduplication). By default
// we still meter at worst-case (every result_count) and keep that savings as
// margin. When VITE_X402_PASS_X_DEDUP=true, we only bill resource IDs not yet
// seen today — matching X's soft guarantee and making refreshes much cheaper.

import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import { createEncryptedStorage } from '../encrypted-storage'
import { X402_PASS_X_DEDUP } from '../x402/config'

export type XDedupKind = 'posts' | 'users' | 'likes'

/** UTC calendar day key (YYYY-MM-DD), matching X's midnight-UTC reset. */
export function utcDayKey(now = Date.now()): string {
  return new Date(now).toISOString().slice(0, 10)
}

const SEEN_CAP = 20_000

interface XDedupBillingState {
  day: string
  seen: Record<XDedupKind, string[]>
  /** Record ids as billed today; returns how many were newly claimed. */
  claim: (kind: XDedupKind, ids: string[]) => number
  resetIfNewDay: () => void
}

function uniqueIds(ids: string[]): string[] {
  const out: string[] = []
  const seen = new Set<string>()
  for (const id of ids) {
    const key = id.trim()
    if (!key || seen.has(key)) continue
    seen.add(key)
    out.push(key)
  }
  return out
}

export const useXDedupBillingStore = create<XDedupBillingState>()(
  persist(
    (set, get) => ({
      day: utcDayKey(),
      seen: { posts: [], users: [], likes: [] },

      resetIfNewDay: () => {
        const today = utcDayKey()
        if (get().day === today) return
        set({ day: today, seen: { posts: [], users: [], likes: [] } })
      },

      claim: (kind, ids) => {
        get().resetIfNewDay()
        const fresh = uniqueIds(ids)
        if (fresh.length === 0) return 0
        const prev = new Set(get().seen[kind])
        const newly: string[] = []
        for (const id of fresh) {
          if (prev.has(id)) continue
          prev.add(id)
          newly.push(id)
        }
        if (newly.length === 0) return 0
        let next = [...get().seen[kind], ...newly]
        if (next.length > SEEN_CAP) next = next.slice(next.length - SEEN_CAP)
        set((s) => ({ seen: { ...s.seen, [kind]: next } }))
        return newly.length
      },
    }),
    {
      name: 'x-dedup-billing',
      version: 1,
      storage: createJSONStorage(() => createEncryptedStorage()),
      partialize: (s) => ({ day: s.day, seen: s.seen }),
    },
  ),
)

/**
 * Billable X resource count for metering / x402.
 *
 * - Flag off: returns `fallbackUnits` (typically `meta.result_count`).
 * - Flag on: returns newly-seen resource IDs today (+ any result_count surplus
 *   beyond returned ids, billed conservatively as new).
 */
export function billableXUnits(
  kind: XDedupKind,
  resourceIds: string[],
  fallbackUnits: number,
): number {
  const fallback = Math.max(0, fallbackUnits)
  if (!X402_PASS_X_DEDUP) return fallback

  const claimed = useXDedupBillingStore.getState().claim(kind, resourceIds)
  // Rows dropped in normalize still show up in result_count — treat the gap as
  // new so we don't under-charge relative to what X may have billed us.
  const missing = Math.max(0, fallback - uniqueIds(resourceIds).length)
  return claimed + missing
}
