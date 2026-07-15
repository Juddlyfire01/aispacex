import { describe, it, expect, beforeEach } from 'vitest'
import { useSettingsStore } from './settings-store'

describe('settings-store', () => {
  beforeEach(() => {
    useSettingsStore.setState({
      activeTab: 'intel',
      theme: 'dark',
      scale: 100,
      fontScale: 'md',
      reduceMotion: false,
      density: 'comfortable',
      surfaceEmphasis: 'quiet',
      profileName: '',
      lastNonSettingsTab: 'intel',
    })
  })

  it('exposes the four theme names as a union', () => {
    const themes = ['dark', 'venice', 'grey', 'light'] as const
    for (const t of themes) {
      useSettingsStore.getState().setTheme(t)
      expect(useSettingsStore.getState().theme).toBe(t)
    }
  })

  it('setSurfaceEmphasis accepts quiet and strong', () => {
    useSettingsStore.getState().setSurfaceEmphasis('strong')
    expect(useSettingsStore.getState().surfaceEmphasis).toBe('strong')
    useSettingsStore.getState().setSurfaceEmphasis('quiet')
    expect(useSettingsStore.getState().surfaceEmphasis).toBe('quiet')
  })

  it('setScale accepts the allowed steps', () => {
    useSettingsStore.getState().setScale(90)
    expect(useSettingsStore.getState().scale).toBe(90)
    useSettingsStore.getState().setScale(125)
    expect(useSettingsStore.getState().scale).toBe(125)
  })

  it('setFontScale accepts sm/md/lg', () => {
    useSettingsStore.getState().setFontScale('lg')
    expect(useSettingsStore.getState().fontScale).toBe('lg')
  })

  it('opens settings and remembers the previous tab', () => {
    useSettingsStore.getState().setActiveTab('image')
    useSettingsStore.getState().openSettings()
    expect(useSettingsStore.getState().activeTab).toBe('settings')
    expect(useSettingsStore.getState().lastNonSettingsTab).toBe('image')
  })

  it('closeSettings restores the previous tab', () => {
    useSettingsStore.getState().setActiveTab('intel')
    useSettingsStore.getState().openSettings()
    useSettingsStore.getState().closeSettings()
    expect(useSettingsStore.getState().activeTab).toBe('intel')
  })

  it('toggleReduceMotion flips the flag', () => {
    expect(useSettingsStore.getState().reduceMotion).toBe(false)
    useSettingsStore.getState().toggleReduceMotion()
    expect(useSettingsStore.getState().reduceMotion).toBe(true)
  })

  it('openSettings can focus a settings category', () => {
    useSettingsStore.getState().openSettings('data')
    expect(useSettingsStore.getState().activeTab).toBe('settings')
    expect(useSettingsStore.getState().settingsFocus).toBe('data')
  })

  it('defaults to intel, not deprecated chat', () => {
    expect(useSettingsStore.getState().activeTab).toBe('intel')
    expect(useSettingsStore.getState().lastNonSettingsTab).toBe('intel')
  })

  it('remaps shelved tabs to intel', () => {
    for (const tab of ['chat', 'playground', 'workflows', 'embeddings'] as const) {
      useSettingsStore.getState().setActiveTab(tab)
      expect(useSettingsStore.getState().activeTab).toBe('intel')
    }
  })
})
