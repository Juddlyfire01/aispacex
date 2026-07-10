// Store for the OAuth-connected user's OWN X data (the "Profile" tab). Kept
// separate from the target-oriented x-intel-store: this is sourced from the
// user-context OAuth session rather than the app-only bearer token, and carries
// OAuth-only extras (bookmarks, likes).
//
// Multi-account model: each connected X account (its own OAuth grant) has its
// own SelfAccount entry keyed by X user id. `activeAccountId` selects which one
// the UI shows; switching it triggers a server-side cookie change so subsequent
// /api/x/proxy calls hit that account. Mirrors how useXIntelStore already
// stores per-target reports.
import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import { createEncryptedStorage } from '../lib/encrypted-storage'
import { moveItemInArray } from '../lib/array-order'
import type { Profile, Post, Edge, IntelReportSnapshot, SynthesisSettings } from '../lib/x-intel/types'
import { DEFAULT_SYNTHESIS_SETTINGS } from '../lib/x-intel/types'
import { shouldUpgradeSynthesisModel } from '../lib/x-intel/synthesis-model'

export interface SelfSectionsRefreshed {
  profile?: string
  posts?: string
  bookmarks?: string
  likes?: string
}

/** One connected X account's cached data. */
export interface SelfAccount {
  id: string
  username: string
  profile: Profile | null
  posts: Post[]
  bookmarks: Post[]
  likes: Post[]
  edges: Edge[]
  reportHistory: IntelReportSnapshot[]
  activeReportId: string | null
  refreshedAt: SelfSectionsRefreshed
  synthesisSettings: SynthesisSettings
}

function emptyAccount(id: string, username: string, synthesisSettings: SynthesisSettings): SelfAccount {
  return {
    id,
    username,
    profile: null,
    posts: [],
    bookmarks: [],
    likes: [],
    edges: [],
    reportHistory: [],
    activeReportId: null,
    refreshedAt: {},
    synthesisSettings,
  }
}

interface XSelfState {
  /** Per-account cache keyed by X user id. Holds BOTH currently-connected
   *  accounts and disconnected-but-cached ones (data survives disconnect,
   *  encrypted at rest). `accountOrder` decides which are shown in the rail. */
  accounts: Record<string, SelfAccount>
  /** Rail display order — only currently-connected accounts (X user ids).
   *  Disconnecting removes an id here but keeps its bucket in `accounts`. */
  accountOrder: string[]
  /** The currently-selected account; matches the server-side x_active_account. */
  activeAccountId: string | null
  /** True while the OAuth round-trip is in flight. Not persisted. */
  connecting: boolean
  /** True when at least one account has a live server session. Not persisted —
   *  re-derived from the session probe by reconcileAccounts(). Kept for the
   *  many components that gate on `connected` (header, rails, refresh buttons). */
  connected: boolean
  defaultSynthesisSettings: SynthesisSettings
  /**
   * Ephemeral: account ids currently synthesizing a self report. Survives
   * SelfReport unmount so navigate-away does not drop "Generating…".
   */
  generatingReports: Record<string, true>
  /** Ephemeral: last generate-report error per account id. */
  reportGenerateErrors: Record<string, string>
  /**
   * Ephemeral: account ids currently running gatherSelf. Shared by the You rail
   * subtitle and Profile refresh bar so both show "updating…" together.
   */
  gatheringAccounts: Record<string, true>

  // Account lifecycle
  upsertAccount: (account: { id: string; username: string }) => void
  /** Soft disconnect: drop from the rail (accountOrder) but KEEP the cached
   *  bucket in `accounts` so reconnecting the same X id revives it instantly. */
  disconnectAccount: (id: string) => void
  /** Reorder the You rail by moving one account from `fromIndex` to `toIndex`. */
  reorderAccounts: (fromIndex: number, toIndex: number) => void
  /** Hard delete: purge one account's cached data entirely (rail + bucket). */
  purgeAccount: (id: string) => void
  /** Hard delete every account's cached data (connected or not). */
  purgeAllAccounts: () => void
  setActiveAccount: (id: string | null) => void
  setConnecting: (connecting: boolean) => void
  setConnected: (connected: boolean) => void
  setDefaultSynthesisSettings: (s: SynthesisSettings) => void
  setGlobalSynthesisModel: (model: string) => void
  upgradeSynthesisModelDefaults: (model: string, models: { id: string }[]) => void

  // Per-account mutations (operate on the active account when id omitted)
  updateAccount: (id: string, patch: Partial<SelfAccount>) => void
  setProfile: (id: string, profile: Profile | null) => void
  setPosts: (id: string, posts: Post[]) => void
  setBookmarks: (id: string, bookmarks: Post[]) => void
  setLikes: (id: string, likes: Post[]) => void
  setEdges: (id: string, edges: Edge[]) => void
  markRefreshed: (id: string, section: keyof SelfSectionsRefreshed) => void
  setSynthesisSettings: (id: string, patch: Partial<SynthesisSettings>) => void
  appendReport: (id: string, snapshot: IntelReportSnapshot) => void
  patchActiveReportRegister: (
    id: string,
    register: IntelReportSnapshot['narrative']['register'],
  ) => void
  setActiveReport: (id: string, reportId: string) => void
  deleteReport: (id: string, reportId: string) => void
  setReportGenerating: (id: string, generating: boolean) => void
  setReportGenerateError: (id: string, error: string | null) => void
  setGathering: (id: string, gathering: boolean) => void

  /** Drop all live connection flags but keep cached data. */
  disconnectAll: () => void
  /** Hard-clear everything (cached data + flags). */
  reset: () => void
}

export const useXSelfStore = create<XSelfState>()(
  persist(
    (set) => ({
      accounts: {},
      accountOrder: [],
      activeAccountId: null,
      connecting: false,
      connected: false,
      defaultSynthesisSettings: DEFAULT_SYNTHESIS_SETTINGS,
      generatingReports: {},
      reportGenerateErrors: {},
      gatheringAccounts: {},

      upsertAccount: ({ id, username }) =>
        set((s) => {
          const inRail = s.accountOrder.includes(id)
          if (s.accounts[id]) {
            // Bucket exists. Refresh username, keeping all cached data. If it was
            // disconnected (cached but not in the rail), reviving it here restores
            // the full profile/posts/bookmarks/likes/reports — this is the
            // "reconnect revives your data" path.
            return {
              accounts: { ...s.accounts, [id]: { ...s.accounts[id], username } },
              accountOrder: inRail ? s.accountOrder : [...s.accountOrder, id],
            }
          }
          return {
            accounts: { ...s.accounts, [id]: emptyAccount(id, username, s.defaultSynthesisSettings) },
            accountOrder: [...s.accountOrder, id],
          }
        }),

      disconnectAccount: (id) =>
        set((s) => {
          // Keep accounts[id] (encrypted cache); only remove it from the rail.
          const accountOrder = s.accountOrder.filter((a) => a !== id)
          const activeAccountId = s.activeAccountId === id ? (accountOrder[0] ?? null) : s.activeAccountId
          return { accountOrder, activeAccountId }
        }),

      reorderAccounts: (fromIndex, toIndex) =>
        set((s) => {
          const accountOrder = moveItemInArray(s.accountOrder, fromIndex, toIndex)
          return accountOrder === s.accountOrder ? s : { accountOrder }
        }),

      purgeAccount: (id) =>
        set((s) => {
          const accounts = { ...s.accounts }
          delete accounts[id]
          const accountOrder = s.accountOrder.filter((a) => a !== id)
          const activeAccountId = s.activeAccountId === id ? (accountOrder[0] ?? null) : s.activeAccountId
          return { accounts, accountOrder, activeAccountId }
        }),

      purgeAllAccounts: () =>
        set((s) => ({
          accounts: {},
          accountOrder: [],
          // Keep any still-live server session flag as-is; only the active
          // pointer is invalidated since its bucket is gone.
          activeAccountId: s.accountOrder.length ? null : s.activeAccountId,
        })),

      setActiveAccount: (id) => set({ activeAccountId: id }),
      setConnecting: (connecting) => set({ connecting }),
      setConnected: (connected) => set({ connected }),
      setDefaultSynthesisSettings: (settings) => set({ defaultSynthesisSettings: settings }),

      setGlobalSynthesisModel: (model) =>
        set((s) => ({
          defaultSynthesisSettings: { ...s.defaultSynthesisSettings, model },
          accounts: Object.fromEntries(
            Object.entries(s.accounts).map(([id, account]) => [
              id,
              {
                ...account,
                synthesisSettings: { ...account.synthesisSettings, model },
              },
            ]),
          ),
        })),

      upgradeSynthesisModelDefaults: (model, models) =>
        set((s) => {
          const nextDefault = shouldUpgradeSynthesisModel(s.defaultSynthesisSettings.model, models)
            ? model
            : s.defaultSynthesisSettings.model
          return {
            defaultSynthesisSettings: { ...s.defaultSynthesisSettings, model: nextDefault },
            accounts: Object.fromEntries(
              Object.entries(s.accounts).map(([id, account]) => {
                const current = account.synthesisSettings.model
                const next = shouldUpgradeSynthesisModel(current, models) ? model : current
                return [
                  id,
                  {
                    ...account,
                    synthesisSettings: { ...account.synthesisSettings, model: next },
                  },
                ]
              }),
            ),
          }
        }),

      updateAccount: (id, patch) =>
        set((s) => {
          const a = s.accounts[id]
          if (!a) return s
          return { accounts: { ...s.accounts, [id]: { ...a, ...patch } } }
        }),

      setProfile: (id, profile) =>
        set((s) => {
          const a = s.accounts[id]
          if (!a) return s
          return { accounts: { ...s.accounts, [id]: { ...a, profile } } }
        }),

      setPosts: (id, posts) =>
        set((s) => {
          const a = s.accounts[id]
          if (!a) return s
          return { accounts: { ...s.accounts, [id]: { ...a, posts } } }
        }),

      setBookmarks: (id, bookmarks) =>
        set((s) => {
          const a = s.accounts[id]
          if (!a) return s
          return { accounts: { ...s.accounts, [id]: { ...a, bookmarks } } }
        }),

      setLikes: (id, likes) =>
        set((s) => {
          const a = s.accounts[id]
          if (!a) return s
          return { accounts: { ...s.accounts, [id]: { ...a, likes } } }
        }),

      setEdges: (id, edges) =>
        set((s) => {
          const a = s.accounts[id]
          if (!a) return s
          return { accounts: { ...s.accounts, [id]: { ...a, edges } } }
        }),

      markRefreshed: (id, section) =>
        set((s) => {
          const a = s.accounts[id]
          if (!a) return s
          return {
            accounts: {
              ...s.accounts,
              [id]: { ...a, refreshedAt: { ...a.refreshedAt, [section]: new Date().toISOString() } },
            },
          }
        }),

      setSynthesisSettings: (id, patch) =>
        set((s) => {
          const a = s.accounts[id]
          if (!a) return s
          return {
            accounts: {
              ...s.accounts,
              [id]: { ...a, synthesisSettings: { ...a.synthesisSettings, ...patch } },
            },
          }
        }),

      appendReport: (id, snapshot) =>
        set((s) => {
          const a = s.accounts[id]
          if (!a) return s
          return {
            accounts: {
              ...s.accounts,
              [id]: {
                ...a,
                reportHistory: [snapshot, ...a.reportHistory],
                activeReportId: snapshot.id,
              },
            },
          }
        }),

      patchActiveReportRegister: (id, register) =>
        set((s) => {
          const a = s.accounts[id]
          if (!a) return s
          const activeId = a.activeReportId ?? a.reportHistory[0]?.id
          if (!activeId) return s
          const reportHistory = a.reportHistory.map((snap) =>
            snap.id === activeId
              ? { ...snap, narrative: { ...snap.narrative, register } }
              : snap,
          )
          return { accounts: { ...s.accounts, [id]: { ...a, reportHistory } } }
        }),

      setActiveReport: (id, reportId) =>
        set((s) => {
          const a = s.accounts[id]
          if (!a) return s
          if (!a.reportHistory.some((r) => r.id === reportId)) return s
          return { accounts: { ...s.accounts, [id]: { ...a, activeReportId: reportId } } }
        }),

      deleteReport: (id, reportId) =>
        set((s) => {
          const a = s.accounts[id]
          if (!a) return s
          const reportHistory = a.reportHistory.filter((r) => r.id !== reportId)
          const activeReportId = a.activeReportId === reportId ? (reportHistory[0]?.id ?? null) : a.activeReportId
          return { accounts: { ...s.accounts, [id]: { ...a, reportHistory, activeReportId } } }
        }),

      setReportGenerating: (id, generating) =>
        set((s) => {
          const generatingReports = { ...s.generatingReports }
          if (generating) generatingReports[id] = true
          else delete generatingReports[id]
          return { generatingReports }
        }),

      setReportGenerateError: (id, error) =>
        set((s) => {
          const reportGenerateErrors = { ...s.reportGenerateErrors }
          if (error) reportGenerateErrors[id] = error
          else delete reportGenerateErrors[id]
          return { reportGenerateErrors }
        }),

      setGathering: (id, gathering) =>
        set((s) => {
          const gatheringAccounts = { ...s.gatheringAccounts }
          if (gathering) gatheringAccounts[id] = true
          else delete gatheringAccounts[id]
          return { gatheringAccounts }
        }),

      disconnectAll: () => set({ connecting: false, connected: false, activeAccountId: null }),
      reset: () => set({
        accounts: {},
        accountOrder: [],
        activeAccountId: null,
        connecting: false,
        connected: false,
        generatingReports: {},
        reportGenerateErrors: {},
        gatheringAccounts: {},
      }),
    }),
    {
      name: 'x-self-profile',
      version: 3,
      // Sensitive corpus (posts, bookmarks, likes, reports) is encrypted at rest
      // with a device-bound key. Legacy plaintext entries are read transparently
      // and re-written encrypted on the next persist. See encrypted-storage.ts.
      storage: createJSONStorage(() => createEncryptedStorage()),
      migrate: (persisted, version) => {
        const state = (persisted ?? {}) as Partial<XSelfState> & {
          // v1 flat fields
          profile?: Profile | null
          posts?: Post[]
          bookmarks?: Post[]
          likes?: Post[]
          edges?: Edge[]
          reportHistory?: IntelReportSnapshot[]
          activeReportId?: string | null
          refreshedAt?: SelfSectionsRefreshed
          synthesisSettings?: SynthesisSettings
          connected?: boolean
        }
        // v1 → v2: fold the legacy flat singleton into accounts[profile.id].
        if (version < 2 && state.profile) {
          const id = state.profile.id
          const synthesis = state.synthesisSettings ?? DEFAULT_SYNTHESIS_SETTINGS
          state.accounts = {
            ...(state.accounts ?? {}),
            [id]: {
              id,
              username: state.profile.username,
              profile: state.profile,
              posts: state.posts ?? [],
              bookmarks: state.bookmarks ?? [],
              likes: state.likes ?? [],
              edges: state.edges ?? [],
              reportHistory: state.reportHistory ?? [],
              activeReportId: state.activeReportId ?? null,
              refreshedAt: state.refreshedAt ?? {},
              synthesisSettings: synthesis,
            },
          }
          state.accountOrder = [id]
          state.activeAccountId = id
          state.defaultSynthesisSettings = state.defaultSynthesisSettings ?? synthesis
          delete state.profile
          delete state.posts
          delete state.bookmarks
          delete state.likes
          delete state.edges
          delete state.reportHistory
          delete state.activeReportId
          delete state.refreshedAt
          delete state.synthesisSettings
          delete state.connected
        }
        // v2 → v3: backfill includedReportIds on each account's + the default
        // synthesis settings so the report-context selector reads a defined array.
        if (version < 3) {
          for (const account of Object.values(state.accounts ?? {})) {
            if (account.synthesisSettings && !Array.isArray(account.synthesisSettings.includedReportIds)) {
              account.synthesisSettings.includedReportIds = []
            }
          }
          if (state.defaultSynthesisSettings && !Array.isArray(state.defaultSynthesisSettings.includedReportIds)) {
            state.defaultSynthesisSettings.includedReportIds = []
          }
        }
        return state as XSelfState
      },
      partialize: (s) => ({
        accounts: s.accounts,
        accountOrder: s.accountOrder,
        activeAccountId: s.activeAccountId,
        defaultSynthesisSettings: s.defaultSynthesisSettings,
      }),
    },
  ),
)
