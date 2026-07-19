import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import { createEncryptedStorage } from '../lib/encrypted-storage'
import type { LibraryMode } from '../lib/compose/hot-window'
import type { RegisterDefault } from '../lib/compose/register'
import { DEFAULT_REGISTER_DEFAULT } from '../lib/compose/register'
import { DRAFT_MODEL_SAME } from '../lib/compose/draft-writer-tool'
import { clampBudgetPct } from '../lib/compose/token-estimate'
import type { ComposeScope } from '../lib/intel-library/types'
import {
  clearPendingComposePrefsSeed,
  takePendingComposePrefsSeed,
  type ComposePrefsSeed,
} from '../lib/compose/compose-prefs-seed'

export type { LibraryMode }

export type XSearchMode = 'off' | 'auto' | 'on'
/** Same off/auto/on shape as X search — Venice `enable_web_search`. */
export type WebSearchMode = 'off' | 'auto' | 'on'

/** Post top-tab sub-chrome: Composer | Alpha | Performance. */
export type PostSubTab = 'composer' | 'alpha' | 'performance'

const POST_SUB_TABS: readonly PostSubTab[] = ['composer', 'alpha', 'performance']

function isPostSubTab(v: unknown): v is PostSubTab {
  return typeof v === 'string' && (POST_SUB_TABS as readonly string[]).includes(v)
}

/** Map legacy profile/feed/network placeholders → real Post tabs. */
export function migratePostSubTab(v: unknown): PostSubTab {
  if (isPostSubTab(v)) return v
  if (v === 'profile') return 'composer'
  if (v === 'feed') return 'performance'
  if (v === 'network') return 'alpha'
  return 'composer'
}

export interface ComposePrefsState {
  model: string
  /** Last painted research-model option text — show this on mount before catalog. */
  modelLabel: string
  /** Draft writer: 'same' = continue research turn; else a Venice model id for handoff. */
  draftModel: string
  xSearch: XSearchMode
  /** Venice native web search (`enable_web_search`). */
  webSearch: WebSearchMode
  /** X News API tools (`x_news_*`) in the compose agent. Default on. */
  xNewsOn: boolean
  /** X News search recency window in hours. Default 24. */
  xNewsMaxAgeHours: number
  /** Persisted long-form default for verified accounts (user can opt out). */
  longformPreference: boolean
  /** App-wide default register mode for new drafts. */
  registerDefault: RegisterDefault
  libraryMode: LibraryMode
  budgetPct: number
  /** null = all time */
  dayWindowDays: number | null
  draftDrawerOpen: boolean
  /** Draft pane width as % of the chat+draft split (25–75). Default 50. */
  draftDrawerWidthPct: number
  /** Post → Composer / Alpha / Performance. Persisted across refresh. */
  activePostSubTab: PostSubTab
  newThreadContext: ComposeScope
  /**
   * True after legacy prefs were copied out of `venice-compose` (or confirmed
   * absent). Prevents empty defaults from overwriting a later seed.
   */
  migratedFromCompose: boolean

  setModel: (model: string, label?: string) => void
  setDraftModel: (model: string) => void
  setXSearch: (mode: XSearchMode) => void
  setWebSearch: (mode: WebSearchMode) => void
  setXNewsOn: (on: boolean) => void
  setXNewsMaxAgeHours: (hours: number) => void
  setLongformPreference: (enabled: boolean) => void
  setRegisterDefault: (def: RegisterDefault) => void
  setLibraryMode: (mode: LibraryMode) => void
  setBudgetPct: (pct: number) => void
  setDayWindowDays: (days: number | null) => void
  setDraftDrawerOpen: (open: boolean) => void
  setDraftDrawerWidthPct: (pct: number) => void
  setActivePostSubTab: (tab: PostSubTab) => void
  setNewThreadContext: (scope: ComposeScope) => void
}

const PREFS_DEFAULTS = {
  model: '',
  modelLabel: '',
  draftModel: DRAFT_MODEL_SAME,
  xSearch: 'auto' as XSearchMode,
  webSearch: 'auto' as WebSearchMode,
  xNewsOn: true,
  xNewsMaxAgeHours: 24,
  longformPreference: true,
  libraryMode: 'auto' as LibraryMode,
  budgetPct: 0.5,
  dayWindowDays: 7 as number | null,
  draftDrawerOpen: false,
  draftDrawerWidthPct: 50,
  activePostSubTab: 'composer' as PostSubTab,
  migratedFromCompose: false,
}

function clampDrawerWidthPct(pct: number): number {
  return Math.min(75, Math.max(25, Math.round(pct) || 50))
}

function clampNewsHours(hours: number): number {
  return Math.min(168, Math.max(1, Math.round(hours) || 24))
}

/** Apply a one-shot legacy seed once prefs have finished hydrating. */
export function applyPendingComposePrefsSeed(): void {
  if (!useComposePrefsStore.persist.hasHydrated()) return
  if (useComposePrefsStore.getState().migratedFromCompose) {
    clearPendingComposePrefsSeed()
    return
  }
  const seed = takePendingComposePrefsSeed()
  if (!seed) return
  useComposePrefsStore.setState({
    ...seedToState(seed),
    migratedFromCompose: true,
  })
}

/**
 * Called when the heavy compose store finishes hydrate/migrate. Applies any
 * pending seed, or marks migration done when there was nothing to copy.
 */
export function markComposePrefsMigrationDone(): void {
  if (!useComposePrefsStore.persist.hasHydrated()) return
  if (useComposePrefsStore.getState().migratedFromCompose) {
    clearPendingComposePrefsSeed()
    return
  }
  const seed = takePendingComposePrefsSeed()
  if (seed) {
    useComposePrefsStore.setState({
      ...seedToState(seed),
      migratedFromCompose: true,
    })
  } else {
    useComposePrefsStore.setState({ migratedFromCompose: true })
  }
}

function seedToState(seed: ComposePrefsSeed): Partial<ComposePrefsState> {
  return {
    model: seed.model,
    // Legacy seed has no label — keep empty so the first catalog resolve can fill it.
    modelLabel: '',
    draftModel: seed.draftModel,
    xSearch: seed.xSearch,
    webSearch: seed.webSearch,
    xNewsOn: seed.xNewsOn,
    xNewsMaxAgeHours: seed.xNewsMaxAgeHours,
    longformPreference: seed.longformPreference,
    registerDefault: seed.registerDefault,
    libraryMode: seed.libraryMode,
    budgetPct: seed.budgetPct,
    dayWindowDays: seed.dayWindowDays,
    draftDrawerOpen: seed.draftDrawerOpen,
    draftDrawerWidthPct: seed.draftDrawerWidthPct,
    activePostSubTab: seed.activePostSubTab,
    newThreadContext: seed.newThreadContext,
  }
}

/** Build a seed snapshot from a legacy compose persist record (after prefs defaults). */
export function extractComposePrefsSeed(
  state: Record<string, unknown>,
): ComposePrefsSeed {
  const registerDefault =
    state.registerDefault != null && typeof state.registerDefault === 'object'
      ? (state.registerDefault as RegisterDefault)
      : { ...DEFAULT_REGISTER_DEFAULT }

  const newThreadContext =
    state.newThreadContext != null && typeof state.newThreadContext === 'object'
      ? (state.newThreadContext as ComposeScope)
      : ({ type: 'all' } as ComposeScope)

  return {
    model: typeof state.model === 'string' ? state.model : '',
    draftModel:
      typeof state.draftModel === 'string' && state.draftModel
        ? state.draftModel
        : DRAFT_MODEL_SAME,
    xSearch:
      state.xSearch === 'off' || state.xSearch === 'on' || state.xSearch === 'auto'
        ? state.xSearch
        : 'auto',
    webSearch:
      state.webSearch === 'off' || state.webSearch === 'on' || state.webSearch === 'auto'
        ? state.webSearch
        : 'auto',
    xNewsOn: state.xNewsOn !== false,
    xNewsMaxAgeHours:
      typeof state.xNewsMaxAgeHours === 'number'
        ? clampNewsHours(state.xNewsMaxAgeHours)
        : 24,
    longformPreference: state.longformPreference !== false,
    registerDefault,
    libraryMode:
      state.libraryMode === 'custom' || state.libraryMode === 'auto'
        ? state.libraryMode
        : 'auto',
    budgetPct:
      typeof state.budgetPct === 'number' ? clampBudgetPct(state.budgetPct) : 0.5,
    dayWindowDays:
      state.dayWindowDays === null
        ? null
        : typeof state.dayWindowDays === 'number'
          ? state.dayWindowDays
          : 7,
    draftDrawerOpen: Boolean(state.draftDrawerOpen),
    draftDrawerWidthPct:
      typeof state.draftDrawerWidthPct === 'number'
        ? clampDrawerWidthPct(state.draftDrawerWidthPct)
        : 50,
    activePostSubTab: migratePostSubTab(state.activePostSubTab),
    newThreadContext,
  }
}

const PREFS_KEYS = [
  'model',
  'modelLabel',
  'draftModel',
  'xSearch',
  'webSearch',
  'xNewsOn',
  'xNewsMaxAgeHours',
  'longformPreference',
  'registerDefault',
  'libraryMode',
  'budgetPct',
  'dayWindowDays',
  'draftDrawerOpen',
  'draftDrawerWidthPct',
  'activePostSubTab',
  'newThreadContext',
] as const

/** Remove legacy prefs keys from a compose persist record (v18+). */
export function stripComposePrefsKeys(state: Record<string, unknown>): void {
  for (const key of PREFS_KEYS) {
    delete state[key]
  }
}

export const useComposePrefsStore = create<ComposePrefsState>()(
  persist(
    (set) => ({
      ...PREFS_DEFAULTS,
      registerDefault: { ...DEFAULT_REGISTER_DEFAULT },
      newThreadContext: { type: 'all' },

      setModel: (model, label) =>
        set({
          model,
          modelLabel: label != null && label !== '' ? label : model,
        }),
      setDraftModel: (model) => set({ draftModel: model }),
      setXSearch: (mode) => set({ xSearch: mode }),
      setWebSearch: (mode) => set({ webSearch: mode }),
      setXNewsOn: (on) => set({ xNewsOn: on }),
      setXNewsMaxAgeHours: (hours) => set({ xNewsMaxAgeHours: clampNewsHours(hours) }),
      setLongformPreference: (enabled) => set({ longformPreference: enabled }),
      setRegisterDefault: (def) => set({ registerDefault: def }),
      setLibraryMode: (mode) => set({ libraryMode: mode }),
      setBudgetPct: (pct) => set({ budgetPct: clampBudgetPct(pct) }),
      setDayWindowDays: (days) => set({ dayWindowDays: days }),
      setDraftDrawerOpen: (open) => set({ draftDrawerOpen: open }),
      setDraftDrawerWidthPct: (pct) => set({ draftDrawerWidthPct: clampDrawerWidthPct(pct) }),
      setActivePostSubTab: (tab) => set({ activePostSubTab: tab }),
      setNewThreadContext: (scope) => set({ newThreadContext: scope }),
    }),
    {
      name: 'venice-compose-prefs',
      version: 2,
      storage: createJSONStorage(() => createEncryptedStorage()),
      migrate: (persisted, version) => {
        const state = { ...(persisted as Record<string, unknown>) }
        // v2 adds modelLabel; leave empty so the first catalog resolve can fill
        // the real display string (avoid locking in a raw id forever).
        if (version < 2 && state.modelLabel == null) {
          state.modelLabel = ''
        }
        return state as ComposePrefsState
      },
      partialize: (state) => ({
        model: state.model,
        modelLabel: state.modelLabel,
        draftModel: state.draftModel,
        xSearch: state.xSearch,
        webSearch: state.webSearch,
        xNewsOn: state.xNewsOn,
        xNewsMaxAgeHours: state.xNewsMaxAgeHours,
        longformPreference: state.longformPreference,
        registerDefault: state.registerDefault,
        libraryMode: state.libraryMode,
        budgetPct: state.budgetPct,
        dayWindowDays: state.dayWindowDays,
        draftDrawerOpen: state.draftDrawerOpen,
        draftDrawerWidthPct: state.draftDrawerWidthPct,
        activePostSubTab: state.activePostSubTab,
        newThreadContext: state.newThreadContext,
        migratedFromCompose: state.migratedFromCompose,
      }),
      onRehydrateStorage: () => () => {
        applyPendingComposePrefsSeed()
      },
    },
  ),
)
