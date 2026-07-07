const STORAGE_KEY = 'aispacex-compose-recent-emojis'
const LEGACY_STORAGE_KEYS = ['ovx-compose-recent-emojis', 'openvenice-compose-recent-emojis'] as const
export const MAX_RECENT_EMOJIS = 24

export interface RecentEmoji {
  native: string
  unified: string
  name: string
}

export function loadRecentEmojis(): RecentEmoji[] {
  try {
    let raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) {
      for (const legacyKey of LEGACY_STORAGE_KEYS) {
        raw = localStorage.getItem(legacyKey)
        if (raw) {
          localStorage.setItem(STORAGE_KEY, raw)
          localStorage.removeItem(legacyKey)
          break
        }
      }
    }
    if (!raw) return []
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []
    return parsed
      .filter(
        (item): item is RecentEmoji =>
          typeof item === 'object' &&
          item !== null &&
          typeof (item as RecentEmoji).native === 'string' &&
          typeof (item as RecentEmoji).unified === 'string' &&
          typeof (item as RecentEmoji).name === 'string',
      )
      .slice(0, MAX_RECENT_EMOJIS)
  } catch {
    return []
  }
}

/** Move emoji to front of recents; returns the updated list. */
export function pushRecentEmoji(entry: RecentEmoji): RecentEmoji[] {
  const next = [entry, ...loadRecentEmojis().filter((e) => e.unified !== entry.unified)].slice(
    0,
    MAX_RECENT_EMOJIS,
  )
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  } catch {
    /* ignore quota / private mode */
  }
  return next
}

/** Map stored recents to picker entries (preserves pick order). */
export function recentAsEntries(recent: RecentEmoji[]): Array<RecentEmoji & { key: string }> {
  return recent.map((e) => ({ ...e, key: `recent:${e.unified}` }))
}
