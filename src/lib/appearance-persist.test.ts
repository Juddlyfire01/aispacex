import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  APPEARANCE_STORAGE_KEY,
  normalizeAppearance,
  readAppearanceSnapshot,
  writeAppearanceSnapshot,
} from './appearance-persist'

describe('appearance-persist', () => {
  let store: Record<string, string>

  beforeEach(() => {
    store = {}
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => store[key] ?? null,
      setItem: (key: string, value: string) => {
        store[key] = value
      },
      removeItem: (key: string) => {
        delete store[key]
      },
      clear: () => {
        store = {}
      },
    })
  })

  it('round-trips a snapshot through localStorage', () => {
    writeAppearanceSnapshot({
      theme: 'light',
      scale: 110,
      fontScale: 'lg',
      density: 'compact',
      reduceMotion: true,
    })
    expect(localStorage.getItem(APPEARANCE_STORAGE_KEY)).toContain('light')
    expect(readAppearanceSnapshot()).toMatchObject({
      theme: 'light',
      scale: 110,
      fontScale: 'lg',
      density: 'compact',
      reduceMotion: true,
    })
  })

  it('normalizeAppearance fills defaults for missing fields', () => {
    expect(normalizeAppearance({})).toEqual({
      theme: 'dark',
      scale: 100,
      fontScale: 'md',
      density: 'comfortable',
      reduceMotion: false,
    })
  })
})
