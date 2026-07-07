import type { EmojiMartData } from '@emoji-mart/data'

// Full Unicode emoji catalog from Emoji Mart (@emoji-mart/data) — the same dataset
// used by emoji-mart pickers: ~1,870 base glyphs, ~3,395 entries with skin tones.

export const CATEGORY_LABELS: Record<string, string> = {
  people: 'Smileys',
  nature: 'Animals',
  foods: 'Food',
  activity: 'Activities',
  places: 'Travel',
  objects: 'Objects',
  symbols: 'Symbols',
  flags: 'Flags',
}

export const CATEGORY_ICONS: Record<string, string> = {
  people: '😀',
  nature: '🐻',
  foods: '🍔',
  activity: '⚽',
  places: '🚗',
  objects: '💡',
  symbols: '💯',
  flags: '🏁',
}

export interface EmojiEntry {
  key: string
  native: string
  unified: string
  name: string
  keywords: string[]
  categoryId: string
}

export interface EmojiCategory {
  id: string
  label: string
  icon: string
  entries: EmojiEntry[]
}

export interface EmojiCatalog {
  categories: EmojiCategory[]
  /** Flat list of every selectable glyph (all skin-tone variants). */
  allEntries: EmojiEntry[]
}

let catalogPromise: Promise<EmojiCatalog> | null = null
let cachedCatalog: EmojiCatalog | null = null

export function getCachedEmojiCatalog(): EmojiCatalog | null {
  return cachedCatalog
}

/** Start loading the catalog early so the picker opens instantly. */
export function prefetchEmojiCatalog(): void {
  void loadEmojiCatalog()
}

export function loadEmojiCatalog(): Promise<EmojiCatalog> {
  if (cachedCatalog) return Promise.resolve(cachedCatalog)
  if (!catalogPromise) {
    catalogPromise = import('@emoji-mart/data').then((mod) => {
      cachedCatalog = buildCatalog((mod.default ?? mod) as EmojiMartData)
      return cachedCatalog
    })
  }
  return catalogPromise
}

/** @visibleForTesting */
export function buildCatalog(data: EmojiMartData): EmojiCatalog {
  const categories: EmojiCategory[] = data.categories.map((cat) => {
    const entries: EmojiEntry[] = []
    for (const emojiId of cat.emojis) {
      const emoji = data.emojis[emojiId]
      if (!emoji) continue
      for (const skin of emoji.skins) {
        entries.push({
          key: `${emojiId}:${skin.unified}`,
          native: skin.native,
          unified: skin.unified,
          name: emoji.name,
          keywords: emoji.keywords,
          categoryId: cat.id,
        })
      }
    }
    return {
      id: cat.id,
      label: CATEGORY_LABELS[cat.id] ?? cat.id,
      icon: CATEGORY_ICONS[cat.id] ?? '😀',
      entries,
    }
  })

  return { categories, allEntries: categories.flatMap((c) => c.entries) }
}

export function searchEmojis(entries: EmojiEntry[], query: string): EmojiEntry[] {
  const q = query.trim().toLowerCase()
  if (!q) return entries
  return entries.filter(
    (e) =>
      e.name.toLowerCase().includes(q) ||
      e.keywords.some((k) => k.toLowerCase().includes(q)) ||
      e.native.includes(q),
  )
}
