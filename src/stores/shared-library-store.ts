// Ephemeral (non-persisted) store for the shared "Others" profile library.
//
// Holds the lightweight index fetched from /api/intel/list plus transient
// pull state, so both the rail browse section and the Add type-ahead read one
// source of truth. Deliberately NOT persisted — the index is cheap to refetch
// on mount and should never go stale on disk. All the actual profile data lives
// in x-intel-store once pulled; this store only tracks what is *available*.
import { create } from 'zustand'
import { fetchSharedIndex, pullSharedBundle } from '../lib/x-intel/shared-sync'
import type { SharedIndexEntry } from '../lib/x-intel/shared-types'

interface SharedLibraryState {
  /** Index rows from the server, newest-first. Empty when KV is unconfigured. */
  entries: SharedIndexEntry[]
  /** True after the first successful (or failed) load — gates empty-state copy. */
  loaded: boolean
  /** True while the index request is in flight. */
  loading: boolean
  /** Usernames (lowercased) currently downloading a bundle. */
  pulling: Record<string, true>

  /** Fetch the index once; safe to call repeatedly (no-ops while loading). */
  refreshIndex: () => Promise<void>
  /** Download a shared bundle into x-intel-store; tracks per-username spinner state. */
  pull: (username: string) => Promise<string | null>
}

export const useSharedLibraryStore = create<SharedLibraryState>()((set, get) => ({
  entries: [],
  loaded: false,
  loading: false,
  pulling: {},

  refreshIndex: async () => {
    if (get().loading) return
    set({ loading: true })
    const entries = await fetchSharedIndex()
    set({ entries, loaded: true, loading: false })
  },

  pull: async (username) => {
    const lower = username.trim().replace(/^@/, '').toLowerCase()
    if (!lower) return null
    set((s) => ({ pulling: { ...s.pulling, [lower]: true } }))
    try {
      return await pullSharedBundle(username)
    } finally {
      set((s) => {
        const pulling = { ...s.pulling }
        delete pulling[lower]
        return { pulling }
      })
    }
  },
}))
