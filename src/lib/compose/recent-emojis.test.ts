import { describe, it, expect, beforeEach, vi } from 'vitest'
import { loadRecentEmojis, pushRecentEmoji, recentAsEntries } from './recent-emojis'

describe('recent emojis', () => {
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
    })
  })

  it('dedupes and moves the latest pick to the front', () => {
    pushRecentEmoji({ native: '😀', unified: '1f600', name: 'grinning face' })
    pushRecentEmoji({ native: '🔥', unified: '1f525', name: 'fire' })
    pushRecentEmoji({ native: '😀', unified: '1f600', name: 'grinning face' })

    expect(loadRecentEmojis().map((e) => e.unified)).toEqual(['1f600', '1f525'])
  })

  it('maps recents to grid entries', () => {
    const entries = recentAsEntries([{ native: '👍', unified: '1f44d', name: 'thumbs up' }])
    expect(entries[0].key).toBe('recent:1f44d')
  })
})
