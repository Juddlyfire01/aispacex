import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import { createEncryptedStorage } from '../lib/encrypted-storage'
import { writeAppearanceSnapshot } from '../lib/appearance-persist'
import { DEFAULT_THEME } from '../lib/theme-palettes'
import {
  DEFAULT_SURFACE_EMPHASIS,
  DEFAULT_TYPEFACE,
  resolveSurfaceEmphasis,
  resolveTypeface,
  type SurfaceEmphasis,
  type Typeface,
} from '../lib/appearance'

export type Tab = 'chat' | 'image' | 'audio' | 'music' | 'video' | 'embeddings' | 'workflows' | 'playground' | 'intel' | 'signal' | 'stats' | 'news' | 'settings'
export type SettingsCategory = 'profile' | 'display' | 'data' | 'billing'
export type Theme = 'dark' | 'venice' | 'grey' | 'light'
export type Scale = 90 | 100 | 110 | 125
export type FontScale = 'sm' | 'md' | 'lg'
export type Density = 'compact' | 'comfortable'
export type { Typeface, SurfaceEmphasis }

/**
 * Shelved product surfaces — source kept on disk but not registered in app
 * routes/nav. Rule of thumb: anything not in the sidebar (or Settings footer).
 * Currently: former Build cluster (chat, playground, workflows, embeddings).
 * Restoring = remove from this set, rewire lazy views in app.tsx, optionally nav.
 */
export const SHELVED_TABS = ['chat', 'playground', 'workflows', 'embeddings'] as const
export type ShelvedTab = (typeof SHELVED_TABS)[number]

const SHELVED_TAB_SET: ReadonlySet<string> = new Set(SHELVED_TABS)

export function isShelvedTab(tab: string | undefined): tab is ShelvedTab {
  return tab != null && SHELVED_TAB_SET.has(tab)
}

interface SettingsState {
  activeTab: Tab
  setActiveTab: (tab: Tab) => void
  sidebarOpen: boolean
  setSidebarOpen: (open: boolean) => void
  toggleSidebar: () => void
  selectedModels: Record<string, string>
  setSelectedModel: (tab: string, modelId: string) => void
  playgroundAgentModel: string
  setPlaygroundAgentModel: (modelId: string) => void

  theme: Theme
  setTheme: (t: Theme) => void
  scale: Scale
  setScale: (s: Scale) => void
  fontScale: FontScale
  setFontScale: (f: FontScale) => void
  typeface: Typeface
  setTypeface: (t: Typeface) => void
  reduceMotion: boolean
  toggleReduceMotion: () => void
  density: Density
  setDensity: (d: Density) => void
  surfaceEmphasis: SurfaceEmphasis
  setSurfaceEmphasis: (s: SurfaceEmphasis) => void
  profileName: string
  setProfileName: (name: string) => void

  lastNonSettingsTab: Tab
  /** One-shot category focus when opening Settings (e.g. from Intel connect disclosure). */
  settingsFocus: SettingsCategory | null
  openSettings: (focus?: SettingsCategory) => void
  closeSettings: () => void
}

const NON_SETTINGS_DEFAULT: Tab = 'intel'

function remapDeprecatedTab(tab: Tab | undefined): Tab {
  if (!tab || isShelvedTab(tab)) return NON_SETTINGS_DEFAULT
  return tab
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      activeTab: NON_SETTINGS_DEFAULT,
      setActiveTab: (tab) => set({ activeTab: remapDeprecatedTab(tab) }),
      sidebarOpen: true,
      setSidebarOpen: (open) => set({ sidebarOpen: open }),
      toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),
      selectedModels: {},
      setSelectedModel: (tab, modelId) =>
        set((s) => ({ selectedModels: { ...s.selectedModels, [tab]: modelId } })),
      playgroundAgentModel: '',
      setPlaygroundAgentModel: (modelId) => set({ playgroundAgentModel: modelId }),

      theme: DEFAULT_THEME,
      setTheme: (t) => set({ theme: t }),
      scale: 100,
      setScale: (s) => set({ scale: s }),
      fontScale: 'md',
      setFontScale: (f) => set({ fontScale: f }),
      typeface: DEFAULT_TYPEFACE,
      setTypeface: (t) => set({ typeface: t }),
      reduceMotion: false,
      toggleReduceMotion: () => set((s) => ({ reduceMotion: !s.reduceMotion })),
      density: 'comfortable',
      setDensity: (d) => set({ density: d }),
      surfaceEmphasis: DEFAULT_SURFACE_EMPHASIS,
      setSurfaceEmphasis: (s) => set({ surfaceEmphasis: s }),
      profileName: '',
      setProfileName: (name) => set({ profileName: name }),

      lastNonSettingsTab: NON_SETTINGS_DEFAULT,
      settingsFocus: null,
      openSettings: (focus) =>
        set((s) => ({
          lastNonSettingsTab: s.activeTab === 'settings' ? s.lastNonSettingsTab : s.activeTab,
          activeTab: 'settings',
          settingsFocus: focus ?? null,
        })),
      closeSettings: () =>
        set((s) => ({ activeTab: remapDeprecatedTab(s.lastNonSettingsTab) })),
    }),
    {
      name: 'venice-settings',
      version: 8,
      storage: createJSONStorage(() => createEncryptedStorage()),
      migrate: (persisted) => {
        const s = (persisted ?? {}) as Partial<SettingsState> & { zoom?: Scale }
        const scale = s.scale ?? s.zoom ?? 100
        return {
          ...s,
          scale,
          theme: s.theme ?? DEFAULT_THEME,
          fontScale: s.fontScale ?? 'md',
          typeface: resolveTypeface(s.typeface),
          reduceMotion: s.reduceMotion ?? false,
          density: s.density ?? 'comfortable',
          surfaceEmphasis: resolveSurfaceEmphasis(s.surfaceEmphasis),
          profileName: s.profileName ?? '',
          activeTab: remapDeprecatedTab(s.activeTab),
          lastNonSettingsTab: remapDeprecatedTab(s.lastNonSettingsTab),
        }
      },
      // After encrypted settings rehydrate (or fail open to defaults), mirror
      // chrome prefs to the plaintext FOUC key so the next full reload / OAuth
      // bounce paints the user's theme before React boots.
      onRehydrateStorage: () => (state) => {
        if (!state) return
        writeAppearanceSnapshot({
          theme: state.theme,
          scale: state.scale,
          fontScale: state.fontScale,
          typeface: state.typeface,
          density: state.density,
          surfaceEmphasis: state.surfaceEmphasis,
          reduceMotion: state.reduceMotion,
        })
      },
    },
  ),
)
