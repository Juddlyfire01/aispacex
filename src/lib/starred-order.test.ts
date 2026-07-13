import { describe, it, expect } from 'vitest'
import { sortStarredFirst } from './starred-order'

describe('sortStarredFirst', () => {
  it('keeps relative order within partitions', () => {
    const items = [
      { id: 'a', starred: false },
      { id: 'b', starred: true },
      { id: 'c', starred: false },
      { id: 'd', starred: true },
    ]
    expect(sortStarredFirst(items, (i) => i.starred).map((i) => i.id)).toEqual([
      'b',
      'd',
      'a',
      'c',
    ])
  })

  it('returns same array reference when nothing is starred', () => {
    const items = [{ id: 'a' }, { id: 'b' }]
    expect(sortStarredFirst(items, () => false)).toBe(items)
  })
})
