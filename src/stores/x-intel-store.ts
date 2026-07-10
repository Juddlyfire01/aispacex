import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import { createEncryptedStorage } from '../lib/encrypted-storage'
import { moveItemInArray } from '../lib/array-order'
import type { Profile, Post, Edge, CharacterProfile, SynthesisSettings, IntelReportSnapshot } from '../lib/x-intel/types'
import { DEFAULT_SYNTHESIS_SETTINGS } from '../lib/x-intel/types'
import { shouldUpgradeSynthesisModel } from '../lib/x-intel/synthesis-model'
import { computeAnalytics, postDateRange } from '../lib/x-intel/analytics'

/** Small id generator; crypto.randomUUID where available, else a random fallback. */
export function newReportId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID()
  return `r_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
}

/**
 * Convert a legacy v1 CharacterProfile synthesis into a v2 baseline snapshot so
 * upgrading users lose nothing. Analytics are recomputed from the persisted
 * posts/edges/profile; the character fields map into the narrative. Returns null
 * when there isn't enough data (no profile) to build a valid snapshot.
 */
function legacyToSnapshot(
  synthesis: CharacterProfile,
  profile: Profile | null,
  posts: Post[],
  edges: Edge[],
  settings: SynthesisSettings,
): IntelReportSnapshot | null {
  if (!profile) return null
  return {
    id: newReportId(),
    createdAt: synthesis.synthesizedAt || new Date().toISOString(),
    model: synthesis.model,
    synthesisSettings: settings,
    meta: {
      postCount: posts.length,
      dateRange: postDateRange(posts),
      postIdsAnalyzed: posts.map((p) => p.id),
      tokenCost: 0,
    },
    analytics: computeAnalytics(profile, posts, edges),
    narrative: {
      executiveSummary: '',
      strategicAssessment: '',
      themes: synthesis.themes.map((t) => ({ name: t, evidence: '', weight: 0 })),
      register: { description: synthesis.register, devices: [], fewShotExamples: [] },
      narrativeArcs: [],
      audienceRead: '',
      contradictions: [],
      notablePosts: synthesis.flagshipPost?.postId
        ? [{ postId: synthesis.flagshipPost.postId, why: 'Flagship post (migrated from prior profile)' }]
        : [],
      engagementHooks: [],
      analystConclusions: [],
    },
    changeSummary: null,
    previousReportId: null,
  }
}

// Per-section "last successfully refreshed" timestamps (ISO). Distinct from a
// post's gatheredAt: a refresh that returns zero new posts is still a successful
// refresh and must bump the relevant section here, even though no post changes.
export interface RefreshedAt {
  profile?: string
  feed?: string
  network?: string
}

export interface IntelReport {
  username: string          // canonical (as entered, trimmed, no @)
  profile: Profile | null
  posts: Post[]             // newest first
  edges: Edge[]
  reportHistory: IntelReportSnapshot[]  // append-only, newest first
  activeReportId: string | null         // which snapshot the right pane shows
  synthesisSettings: SynthesisSettings
  watch: boolean            // refresh on tab open
  totalCost: number
  createdAt: string
  refreshedAt: RefreshedAt
}

export type IntelSubTab = 'profile' | 'network' | 'feed'
export type IntelTopTab = 'me' | 'targets' | 'post'

interface XIntelState {
  targets: string[]
  reports: Record<string, IntelReport>
  activeTarget: string | null
  activeSubTab: IntelSubTab
  /** Separate Profile/Feed/Network selection for the self ("me") top tab. */
  activeSelfSubTab: IntelSubTab
  activeTopTab: IntelTopTab
  sessionCost: number
  /** Persisted all-time spend across all targets (survives target removal). */
  lifetimeTotal: number
  defaultSynthesisSettings: SynthesisSettings
  /** Ephemeral: scroll/highlight this post in the Feed tab when set. Not persisted. */
  feedFocusPostId: string | null
  /** Bumps on every jump request so re-clicking the same post still scrolls. */
  feedFocusNonce: number
  /**
   * Ephemeral: usernames currently synthesizing a report. Survives ProfileReport
   * unmount so navigate-away does not lose "Generating…" / double-fire the job.
   */
  generatingReports: Record<string, true>
  /** Ephemeral: last generate-report error per username (cleared on next start). */
  reportGenerateErrors: Record<string, string>
  /**
   * Ephemeral: usernames currently running a full gather/refresh. Shared by the
   * Others rail subtitle and Profile refresh bar so both show "updating…" together.
   */
  gatheringTargets: Record<string, true>

  addTarget: (username: string) => void
  seedTarget: (profile: Profile) => void
  /** Soft-remove from the Others rail; cached profile/posts/reports are kept. */
  removeTarget: (username: string) => void
  /** Reorder the Others rail by moving one entry from `fromIndex` to `toIndex`. */
  reorderTargets: (fromIndex: number, toIndex: number) => void
  /** Hard-delete one target's cached data (Settings → Data & privacy only). */
  purgeTarget: (username: string) => void
  /** Hard-clear every target's cached data (for Settings → Data & privacy). */
  clearAllTargets: () => void
  setActiveTarget: (username: string | null) => void
  setActiveSubTab: (tab: IntelSubTab) => void
  setActiveSelfSubTab: (tab: IntelSubTab) => void
  setActiveTopTab: (tab: IntelTopTab) => void
  updateReport: (username: string, patch: Partial<IntelReport>) => void
  addCost: (username: string, cost: number) => void
  setDefaultSynthesisSettings: (s: SynthesisSettings) => void
  /** Set synthesis model on the default + every target (other settings stay per-target). */
  setGlobalSynthesisModel: (model: string) => void
  /** Upgrade legacy / missing model ids after the live catalog loads. */
  upgradeSynthesisModelDefaults: (model: string, models: { id: string }[]) => void
  appendReport: (username: string, snapshot: IntelReportSnapshot) => void
  /** Patch register on the active report snapshot (Save to report from compose). */
  patchActiveReportRegister: (
    username: string,
    register: IntelReportSnapshot['narrative']['register'],
  ) => void
  deleteReport: (username: string, reportId: string) => void
  setActiveReport: (username: string, reportId: string) => void
  /** Switch to Feed and scroll/highlight a post by id. */
  jumpToFeedPost: (postId: string) => void
  /** Same as jumpToFeedPost but for the self ("me") Profile → Feed sub-tab. */
  jumpToSelfFeedPost: (postId: string) => void
  clearFeedFocus: () => void
  setReportGenerating: (username: string, generating: boolean) => void
  setReportGenerateError: (username: string, error: string | null) => void
  setGathering: (username: string, gathering: boolean) => void
}

export function mergePosts(existing: Post[], incoming: Post[]): Post[] {
  const map = new Map<string, Post>()
  for (const p of existing) map.set(p.id, p)
  for (const p of incoming) map.set(p.id, p)
  return [...map.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt))
}

function canonical(username: string): string {
  return username.trim().replace(/^@/, '')
}

/** Case-insensitive lookup of the persisted storage key for a target username. */
export function findReportKey(reports: Record<string, IntelReport>, username: string): string | undefined {
  const name = canonical(username).toLowerCase()
  return Object.keys(reports).find((k) => k.toLowerCase() === name)
}

export const useXIntelStore = create<XIntelState>()(
  persist(
    (set, get) => ({
      targets: [],
      reports: {},
      activeTarget: null,
      activeSubTab: 'profile',
      activeSelfSubTab: 'profile',
      activeTopTab: 'targets',
      sessionCost: 0,
      lifetimeTotal: 0,
      defaultSynthesisSettings: DEFAULT_SYNTHESIS_SETTINGS,
      feedFocusPostId: null,
      feedFocusNonce: 0,
      generatingReports: {},
      reportGenerateErrors: {},
      gatheringTargets: {},

      addTarget: (username) => {
        const name = canonical(username)
        if (!name) return
        const lower = name.toLowerCase()
        const existingInRail = get().targets.find((t) => t.toLowerCase() === lower)
        if (existingInRail) {
          set({ activeTarget: existingInRail })
          return
        }
        // Revive a target that was soft-removed from the rail but still cached.
        const cachedKey = findReportKey(get().reports, name)
        if (cachedKey) {
          set((s) => ({
            targets: [...s.targets, cachedKey],
            activeTarget: cachedKey,
          }))
          return
        }
        set((s) => ({
          targets: [...s.targets, name],
          activeTarget: name,
          reports: {
            ...s.reports,
            [name]: {
              username: name,
              profile: null,
              posts: [],
              edges: [],
              reportHistory: [],
              activeReportId: null,
              synthesisSettings: { ...s.defaultSynthesisSettings },
              watch: false,
              totalCost: 0,
              createdAt: new Date().toISOString(),
              refreshedAt: {},
            },
          },
        }))
      },

      // Seed a target from an already-fetched profile (e.g. the token-validation
      // lookup) without spending another request. If the target already exists,
      // only its profile is refreshed — posts, edges, and cost are kept.
      seedTarget: (profile) => {
        const name = canonical(profile.username)
        if (!name) return
        set((s) => {
          const existingKey = findReportKey(s.reports, name)
          if (existingKey) {
            const report = s.reports[existingKey]
            return {
              reports: {
                ...s.reports,
                [existingKey]: {
                  ...report,
                  profile,
                  refreshedAt: { ...report.refreshedAt, profile: new Date().toISOString() },
                },
              },
            }
          }
          return {
            targets: [...s.targets, name],
            activeTarget: s.activeTarget ?? name,
            reports: {
              ...s.reports,
              [name]: {
                username: name,
                profile,
                posts: [],
                edges: [],
                reportHistory: [],
                activeReportId: null,
                synthesisSettings: { ...s.defaultSynthesisSettings },
                watch: false,
                totalCost: 0,
                createdAt: new Date().toISOString(),
                refreshedAt: { profile: new Date().toISOString() },
              },
            },
          }
        })
      },

      removeTarget: (username) => {
        const lower = canonical(username).toLowerCase()
        set((s) => {
          const railKey = s.targets.find((t) => t.toLowerCase() === lower)
          if (!railKey) return s
          const targets = s.targets.filter((t) => t !== railKey)
          return {
            targets,
            activeTarget: s.activeTarget === railKey ? (targets[0] ?? null) : s.activeTarget,
          }
        })
      },

      reorderTargets: (fromIndex, toIndex) => {
        set((s) => {
          const targets = moveItemInArray(s.targets, fromIndex, toIndex)
          return targets === s.targets ? s : { targets }
        })
      },

      purgeTarget: (username) => {
        set((s) => {
          const key = findReportKey(s.reports, username)
          if (!key) return s
          const reports = { ...s.reports }
          delete reports[key]
          const targets = s.targets.filter((t) => t.toLowerCase() !== key.toLowerCase())
          return {
            targets,
            reports,
            activeTarget: s.activeTarget?.toLowerCase() === key.toLowerCase()
              ? (targets[0] ?? null)
              : s.activeTarget,
          }
        })
      },

      clearAllTargets: () => set({ targets: [], reports: {}, activeTarget: null }),

      setActiveTarget: (username) => set({ activeTarget: username }),
      setActiveSubTab: (tab) => set({ activeSubTab: tab }),
      setActiveSelfSubTab: (tab) => set({ activeSelfSubTab: tab }),
      setActiveTopTab: (tab) => set({ activeTopTab: tab }),

      updateReport: (username, patch) => {
        set((s) => {
          const key = findReportKey(s.reports, username)
          if (!key) return s
          const report = s.reports[key]
          return { reports: { ...s.reports, [key]: { ...report, ...patch } } }
        })
      },

      addCost: (username, cost) => {
        set((s) => {
          const key = findReportKey(s.reports, username)
          if (!key) return s  // no-op for non-existent target — don't charge sessionCost either
          const report = s.reports[key]
          return {
            sessionCost: s.sessionCost + cost,
            lifetimeTotal: s.lifetimeTotal + cost,
            reports: { ...s.reports, [key]: { ...report, totalCost: report.totalCost + cost } },
          }
        })
      },

      setDefaultSynthesisSettings: (settings) => set({ defaultSynthesisSettings: settings }),

      setGlobalSynthesisModel: (model) =>
        set((s) => ({
          defaultSynthesisSettings: { ...s.defaultSynthesisSettings, model },
          reports: Object.fromEntries(
            Object.entries(s.reports).map(([key, report]) => [
              key,
              {
                ...report,
                synthesisSettings: { ...report.synthesisSettings, model },
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
            reports: Object.fromEntries(
              Object.entries(s.reports).map(([key, report]) => {
                const current = report.synthesisSettings.model
                const next = shouldUpgradeSynthesisModel(current, models) ? model : current
                return [
                  key,
                  {
                    ...report,
                    synthesisSettings: { ...report.synthesisSettings, model: next },
                  },
                ]
              }),
            ),
          }
        }),

      appendReport: (username, snapshot) => {
        set((s) => {
          const key = findReportKey(s.reports, username)
          if (!key) return s
          const report = s.reports[key]
          return {
            reports: {
              ...s.reports,
              [key]: {
                ...report,
                reportHistory: [snapshot, ...report.reportHistory],
                activeReportId: snapshot.id,
              },
            },
          }
        })
      },

      patchActiveReportRegister: (username, register) => {
        set((s) => {
          const key = findReportKey(s.reports, username)
          if (!key) return s
          const report = s.reports[key]
          const activeId = report.activeReportId ?? report.reportHistory[0]?.id
          if (!activeId) return s
          const reportHistory = report.reportHistory.map((snap) =>
            snap.id === activeId
              ? { ...snap, narrative: { ...snap.narrative, register } }
              : snap,
          )
          return { reports: { ...s.reports, [key]: { ...report, reportHistory } } }
        })
      },

      deleteReport: (username, reportId) => {
        set((s) => {
          const key = findReportKey(s.reports, username)
          if (!key) return s
          const report = s.reports[key]
          const reportHistory = report.reportHistory.filter((r) => r.id !== reportId)
          const activeReportId = report.activeReportId === reportId
            ? (reportHistory[0]?.id ?? null)
            : report.activeReportId
          return {
            reports: { ...s.reports, [key]: { ...report, reportHistory, activeReportId } },
          }
        })
      },

      setActiveReport: (username, reportId) => {
        set((s) => {
          const key = findReportKey(s.reports, username)
          if (!key) return s
          const report = s.reports[key]
          if (!report.reportHistory.some((r) => r.id === reportId)) return s
          return { reports: { ...s.reports, [key]: { ...report, activeReportId: reportId } } }
        })
      },

      jumpToFeedPost: (postId) => set((s) => ({
        feedFocusPostId: postId,
        activeSubTab: 'feed',
        feedFocusNonce: s.feedFocusNonce + 1,
      })),
      jumpToSelfFeedPost: (postId) => set((s) => ({
        feedFocusPostId: postId,
        activeSelfSubTab: 'feed',
        activeTopTab: 'me',
        feedFocusNonce: s.feedFocusNonce + 1,
      })),
      clearFeedFocus: () => set({ feedFocusPostId: null }),

      setReportGenerating: (username, generating) => {
        const key = findReportKey(get().reports, username) ?? canonical(username)
        if (!key) return
        set((s) => {
          const generatingReports = { ...s.generatingReports }
          if (generating) generatingReports[key] = true
          else delete generatingReports[key]
          return { generatingReports }
        })
      },

      setReportGenerateError: (username, error) => {
        const key = findReportKey(get().reports, username) ?? canonical(username)
        if (!key) return
        set((s) => {
          const reportGenerateErrors = { ...s.reportGenerateErrors }
          if (error) reportGenerateErrors[key] = error
          else delete reportGenerateErrors[key]
          return { reportGenerateErrors }
        })
      },

      setGathering: (username, gathering) => {
        const key = findReportKey(get().reports, username) ?? canonical(username)
        if (!key) return
        set((s) => {
          const gatheringTargets = { ...s.gatheringTargets }
          if (gathering) gatheringTargets[key] = true
          else delete gatheringTargets[key]
          return { gatheringTargets }
        })
      },
    }),
    {
      name: 'x-intel-reports',
      version: 5,
      // Target profiles/posts/reports are encrypted at rest with the device-bound
      // key. Legacy plaintext entries are read transparently and re-encrypted on
      // the next persist. See encrypted-storage.ts.
      storage: createJSONStorage(() => createEncryptedStorage()),
      migrate: (persisted, version) => {
        const state = persisted as Partial<XIntelState>
        if (version < 1 && state.reports && state.lifetimeTotal == null) {
          state.lifetimeTotal = Object.values(state.reports).reduce(
            (sum, r) => sum + (r.totalCost ?? 0),
            0,
          )
        }
        // v1 -> v2: fold each report's single `synthesis` (CharacterProfile) into
        // an append-only `reportHistory` baseline snapshot; nothing is lost.
        if (version < 2 && state.reports) {
          for (const report of Object.values(state.reports) as (IntelReport & { synthesis?: CharacterProfile | null })[]) {
            if (report.reportHistory) continue // already migrated
            const legacy = report.synthesis ?? null
            const settings = report.synthesisSettings ?? DEFAULT_SYNTHESIS_SETTINGS
            const snapshot = legacy
              ? legacyToSnapshot(legacy, report.profile ?? null, report.posts ?? [], report.edges ?? [], settings)
              : null
            report.reportHistory = snapshot ? [snapshot] : []
            report.activeReportId = snapshot?.id ?? null
            delete report.synthesis
          }
        }
        // v2 -> v3: backfill link entity fields on cached profiles.
        if (version < 3 && state.reports) {
          for (const report of Object.values(state.reports)) {
            if (!report.profile) continue
            if (!Array.isArray(report.profile.bioUrls)) report.profile.bioUrls = []
            if (report.profile.website === undefined) report.profile.website = null
          }
        }
        // v3 -> v4: drop legacy per-target text drafts (replaced by Compose workspace).
        if (version < 4 && state.reports) {
          for (const report of Object.values(state.reports) as (IntelReport & { drafts?: unknown })[]) {
            delete report.drafts
          }
        }
        // v4 -> v5: backfill includedReportIds on per-target + default synthesis
        // settings so the report-context selector reads a defined array.
        if (version < 5) {
          if (state.reports) {
            for (const report of Object.values(state.reports)) {
              if (report.synthesisSettings && !Array.isArray(report.synthesisSettings.includedReportIds)) {
                report.synthesisSettings.includedReportIds = []
              }
            }
          }
          if (state.defaultSynthesisSettings && !Array.isArray(state.defaultSynthesisSettings.includedReportIds)) {
            state.defaultSynthesisSettings.includedReportIds = []
          }
        }
        return state as XIntelState
      },
      partialize: (s) => ({
        targets: s.targets,
        reports: s.reports,
        activeTarget: s.activeTarget,
        activeTopTab: s.activeTopTab,
        lifetimeTotal: s.lifetimeTotal,
        defaultSynthesisSettings: s.defaultSynthesisSettings,
        activeSelfSubTab: s.activeSelfSubTab,
      }),
    },
  ),
)
