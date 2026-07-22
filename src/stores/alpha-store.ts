import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import { createEncryptedStorage } from '../lib/encrypted-storage'
import {
  ALPHA_MAX_RAILS,
  buildDefaultSystemRails,
} from '../lib/alpha/default-rails'
import {
  pruneAlphaArchive,
  setPinned,
  upsertBrief,
  upsertPosts,
  upsertStory,
  type AlphaArchiveState,
} from '../lib/alpha/archive'
import { recordCost } from './cost-ledger-store'

/** Optional grouping/metadata forwarded to the unified cost ledger. */
export interface AlphaLedgerContext {
  kind?: 'counts' | 'posts' | 'news_search'
  units?: number
  meta?: Record<string, unknown>
}
import type {
  AlphaColdBrief,
  AlphaColdPost,
  AlphaColdStory,
  AlphaNewsScanCache,
  AlphaRail,
  RailCountsCache,
} from '../lib/alpha/types'

interface AlphaState {
  systemRails: AlphaRail[]
  userRails: AlphaRail[]
  /** railId → last counts series (Band 1 cache). */
  countsByRail: Record<string, RailCountsCache>
  /** Last Breaking X News scan (show while fresh; refetch when stale). */
  newsScan: AlphaNewsScanCache | null
  expandedRailId: string | null
  sessionCost: number
  lifetimeCost: number
  /** Cold archive (24h + pins). */
  briefs: Record<string, AlphaColdBrief>
  stories: Record<string, AlphaColdStory>
  posts: Record<string, AlphaColdPost>

  allRails: () => AlphaRail[]
  setRailEnabled: (id: string, enabled: boolean) => void
  addUserRail: (label: string, query: string) => string | null
  removeUserRail: (id: string) => void
  updateUserRail: (id: string, patch: Partial<Pick<AlphaRail, 'label' | 'query' | 'enabled'>>) => void
  resetSystemRails: () => void
  setCountsCache: (cache: RailCountsCache) => void
  setNewsScan: (scan: AlphaNewsScanCache) => void
  setExpandedRailId: (id: string | null) => void
  addCost: (usd: number, ledger?: AlphaLedgerContext) => void
  keepBrief: (brief: AlphaColdBrief) => void
  keepStory: (story: AlphaColdStory) => void
  keepPosts: (posts: AlphaColdPost[]) => void
  setColdPinned: (kind: 'brief' | 'story' | 'post', id: string, pinned: boolean) => void
  pruneCold: (now?: number) => void
}

function newUserRailId(): string {
  return `user-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`
}

function archiveSlice(s: {
  briefs: Record<string, AlphaColdBrief>
  stories: Record<string, AlphaColdStory>
  posts: Record<string, AlphaColdPost>
}): AlphaArchiveState {
  return { briefs: s.briefs, stories: s.stories, posts: s.posts }
}

export const useAlphaStore = create<AlphaState>()(
  persist(
    (set, get) => ({
      systemRails: buildDefaultSystemRails(),
      userRails: [],
      countsByRail: {},
      newsScan: null,
      expandedRailId: null,
      sessionCost: 0,
      lifetimeCost: 0,
      briefs: {},
      stories: {},
      posts: {},

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

      setNewsScan: (scan) => set({ newsScan: scan }),

      setExpandedRailId: (id) => set({ expandedRailId: id }),

      addCost: (usd, ledger) => {
        if (!(usd > 0)) return
        set((s) => ({
          sessionCost: s.sessionCost + usd,
          lifetimeCost: s.lifetimeCost + usd,
        }))
        recordCost({
          action: 'alpha',
          provider: 'x',
          kind: ledger?.kind ?? 'posts',
          units: ledger?.units ?? 1,
          unitPriceUsd: ledger?.units ? usd / ledger.units : usd,
          rawUsd: usd,
          meta: ledger?.meta,
        })
      },

      pruneCold: (now = Date.now()) => {
        const next = pruneAlphaArchive(archiveSlice(get()), now)
        set({ briefs: next.briefs, stories: next.stories, posts: next.posts })
      },

      keepBrief: (brief) => {
        get().pruneCold()
        const next = upsertBrief(archiveSlice(get()), brief)
        set({ briefs: next.briefs, stories: next.stories, posts: next.posts })
      },

      keepStory: (story) => {
        get().pruneCold()
        const next = upsertStory(archiveSlice(get()), story)
        set({ briefs: next.briefs, stories: next.stories, posts: next.posts })
      },

      keepPosts: (posts) => {
        get().pruneCold()
        const next = upsertPosts(archiveSlice(get()), posts)
        set({ briefs: next.briefs, stories: next.stories, posts: next.posts })
      },

      setColdPinned: (kind, id, pinned) => {
        const next = setPinned(archiveSlice(get()), kind, id, pinned)
        set({ briefs: next.briefs, stories: next.stories, posts: next.posts })
      },
    }),
    {
      name: 'venice-alpha',
      version: 4,
      storage: createJSONStorage(() => createEncryptedStorage()),
      partialize: (s) => ({
        systemRails: s.systemRails,
        userRails: s.userRails,
        countsByRail: s.countsByRail,
        newsScan: s.newsScan,
        lifetimeCost: s.lifetimeCost,
        briefs: s.briefs,
        stories: s.stories,
        posts: s.posts,
      }),
      migrate: (persisted) => {
        const p = (persisted ?? {}) as Partial<AlphaState>
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
        if (p.briefs == null || typeof p.briefs !== 'object') p.briefs = {}
        if (p.stories == null || typeof p.stories !== 'object') p.stories = {}
        if (p.posts == null || typeof p.posts !== 'object') p.posts = {}
        if (
          p.newsScan != null &&
          (typeof p.newsScan !== 'object' ||
            !Array.isArray(p.newsScan.stories) ||
            typeof p.newsScan.fetchedAt !== 'number')
        ) {
          p.newsScan = null
        }
        if (p.newsScan === undefined) p.newsScan = null
        const pruned = pruneAlphaArchive({
          briefs: p.briefs,
          stories: p.stories,
          posts: p.posts,
        })
        p.briefs = pruned.briefs
        p.stories = pruned.stories
        p.posts = pruned.posts
        return p as AlphaState
      },
    },
  ),
)
