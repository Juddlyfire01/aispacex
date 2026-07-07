import { describe, it, expect } from 'vitest'
import { buildCatalog, searchEmojis } from './emoji-catalog'
import type { EmojiMartData } from '@emoji-mart/data'

const fixture: EmojiMartData = {
  categories: [{ id: 'people', emojis: ['grinning', 'thumbsup'] }],
  emojis: {
    grinning: { id: 'grinning', name: 'grinning face', keywords: ['smile'], skins: [{ unified: '1f600', native: '😀' }], version: 1 },
    thumbsup: {
      id: 'thumbsup',
      name: 'thumbs up',
      keywords: ['approve'],
      skins: [
        { unified: '1f44d', native: '👍' },
        { unified: '1f44d-1f3fb', native: '👍🏻' },
      ],
      version: 1,
    },
  },
  aliases: {},
  sheet: { cols: 0, rows: 0 },
}

describe('buildCatalog', () => {
  it('includes every skin-tone variant with unified codepoints', () => {
    const catalog = buildCatalog(fixture)
    expect(catalog.allEntries).toHaveLength(3)
    expect(catalog.categories[0].entries.map((e) => e.native)).toEqual(['😀', '👍', '👍🏻'])
    expect(catalog.categories[0].entries[2].unified).toBe('1f44d-1f3fb')
  })
})

describe('searchEmojis', () => {
  it('matches name and keywords', () => {
    const catalog = buildCatalog(fixture)
    expect(searchEmojis(catalog.allEntries, 'approve')).toHaveLength(2)
    expect(searchEmojis(catalog.allEntries, 'grinning')).toHaveLength(1)
  })
})
