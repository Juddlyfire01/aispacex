import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import { createEncryptedStorage } from '../lib/encrypted-storage'
import { DEFAULT_THEME } from '../lib/theme-palettes'

export type Tab = 'chat' | 'image' | 'audio' | 'music' | 'video' | 'embeddings' | 'workflows' | 'playground' | 'intel' | 'signal' | 'stats' | 'news' | 'settings'
export type SettingsCategory = 'profile' | 'display' | 'data'
export type Theme = 'dark' | 'venice' | 'grey' | 'light'
export type Scale = 90 | 100 | 110 | 125
export type FontScale = 'sm' | 'md' | 'lg'
export type Density = 'compact' | 'comfortable'

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
  reduceMotion: boolean
  toggleReduceMotion: () => void
  density: Density
  setDensity: (d: Density) => void
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
  return tab === 'chat' ? 'intel' : (tab ?? NON_SETTINGS_DEFAULT)
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      activeTab: NON_SETTINGS_DEFAULT,
      setActiveTab: (tab) => set({ activeTab: tab }),
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
      reduceMotion: false,
      toggleReduceMotion: () => set((s) => ({ reduceMotion: !s.reduceMotion })),
      density: 'comfortable',
      setDensity: (d) => set({ density: d }),
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
        set((s) => ({ activeTab: s.lastNonSettingsTab ?? NON_SETTINGS_DEFAULT })),
    }),
    {
      name: 'venice-settings',
      version: 4,
      storage: createJSONStorage(() => createEncryptedStorage()),
      migrate: (persisted) => {
        const s = (persisted ?? {}) as Partial<SettingsState> & { zoom?: Scale }
        const scale = s.scale ?? s.zoom ?? 100
        return {
          ...s,
          scale,
          theme: s.theme ?? DEFAULT_THEME,
          fontScale: s.fontScale ?? 'md',
          reduceMotion: s.reduceMotion ?? false,
          density: s.density ?? 'comfortable',
          profileName: s.profileName ?? '',
          activeTab: remapDeprecatedTab(s.activeTab),
          lastNonSettingsTab: remapDeprecatedTab(s.lastNonSettingsTab),
        }
      },
    },
  ),
)
