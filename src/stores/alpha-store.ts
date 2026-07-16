import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import { createEncryptedStorage } from '../lib/encrypted-storage'
import {
  ALPHA_MAX_RAILS,
  buildDefaultSystemRails,
} from '../lib/alpha/default-rails'
import type { AlphaRail, RailCountsCache } from '../lib/alpha/types'

interface AlphaState {
  systemRails: AlphaRail[]
  userRails: AlphaRail[]
  /** railId → last counts series (Band 1 cache). */
  countsByRail: Record<string, RailCountsCache>
  expandedRailId: string | null
  sessionCost: number
  lifetimeCost: number

  allRails: () => AlphaRail[]
  setRailEnabled: (id: string, enabled: boolean) => void
  addUserRail: (label: string, query: string) => string | null
  removeUserRail: (id: string) => void
  updateUserRail: (id: string, patch: Partial<Pick<AlphaRail, 'label' | 'query' | 'enabled'>>) => void
  resetSystemRails: () => void
  setCountsCache: (cache: RailCountsCache) => void
  setExpandedRailId: (id: string | null) => void
  addCost: (usd: number) => void
}

function newUserRailId(): string {
  return `user-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`
}

export const useAlphaStore = create<AlphaState>()(
  persist(
    (set, get) => ({
      systemRails: buildDefaultSystemRails(),
      userRails: [],
      countsByRail: {},
      expandedRailId: null,
      sessionCost: 0,
      lifetimeCost: 0,

      allRails: () => {
        const s = get()
        return [...s.systemRails, ...s.userRails]
      },

      setRailEnabled: (id, enabled) =>
        set((s) => ({
          systemRails: s.systemRails.map((r) => (r.id === id ? { ...r, enabled } : r)),
          userRails: s.userRails.map((r) => (r.id === id ? { ...r, enabled } : r)),
        })),

      addUserRail: (label, query) => {
        const s = get()
        if (s.systemRails.length + s.userRails.length >= ALPHA_MAX_RAILS) return null
        const trimmed = query.trim()
        if (!trimmed) return null
        const id = newUserRailId()
        set({
          userRails: [
            ...s.userRails,
            {
              id,
              label: label.trim() || 'Custom',
              query: trimmed,
              source: 'user',
              enabled: true,
            },
          ],
        })
        return id
      },

      removeUserRail: (id) =>
        set((s) => ({
          userRails: s.userRails.filter((r) => r.id !== id),
          countsByRail: Object.fromEntries(
            Object.entries(s.countsByRail).filter(([k]) => k !== id),
          ),
          expandedRailId: s.expandedRailId === id ? null : s.expandedRailId,
        })),

      updateUserRail: (id, patch) =>
        set((s) => ({
          userRails: s.userRails.map((r) =>
            r.id === id
              ? {
                  ...r,
                  ...patch,
                  query: patch.query != null ? patch.query.trim() : r.query,
                  label: patch.label != null ? patch.label.trim() || r.label : r.label,
                }
              : r,
          ),
        })),

      resetSystemRails: () => set({ systemRails: buildDefaultSystemRails() }),

      setCountsCache: (cache) =>
        set((s) => ({
          countsByRail: { ...s.countsByRail, [cache.railId]: cache },
        })),

      setExpandedRailId: (id) => set({ expandedRailId: id }),

      addCost: (usd) => {
        if (!(usd > 0)) return
        set((s) => ({
          sessionCost: s.sessionCost + usd,
          lifetimeCost: s.lifetimeCost + usd,
        }))
      },
    }),
    {
      name: 'venice-alpha',
      version: 2,
      storage: createJSONStorage(() => createEncryptedStorage()),
      partialize: (s) => ({
        systemRails: s.systemRails,
        userRails: s.userRails,
        countsByRail: s.countsByRail,
        lifetimeCost: s.lifetimeCost,
      }),
      migrate: (persisted) => {
        const p = (persisted ?? {}) as Partial<AlphaState>
        // Always re-seed system rails from product pack (preserve enabled flags by id).
        const defaults = buildDefaultSystemRails()
        const prevEnabled = new Map(
          (Array.isArray(p.systemRails) ? p.systemRails : []).map((r) => [r.id, r.enabled]),
        )
        p.systemRails = defaults.map((r) => ({
          ...r,
          enabled: prevEnabled.has(r.id) ? Boolean(prevEnabled.get(r.id)) : r.enabled,
        }))
        if (!Array.isArray(p.userRails)) p.userRails = []
        if (p.countsByRail == null || typeof p.countsByRail !== 'object') {
          p.countsByRail = {}
        }
        if (typeof p.lifetimeCost !== 'number') p.lifetimeCost = 0
        return p as AlphaState
      },
    },
  ),
)
