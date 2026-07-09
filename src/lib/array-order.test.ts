import { describe, it, expect } from 'vitest'
import { moveItemInArray } from './array-order'

describe('moveItemInArray', () => {
  it('moves an item forward', () => {
    expect(moveItemInArray(['a', 'b', 'c', 'd'], 0, 2)).toEqual(['b', 'c', 'a', 'd'])
  })

  it('moves an item backward', () => {
    expect(moveItemInArray(['a', 'b', 'c', 'd'], 3, 1)).toEqual(['a', 'd', 'b', 'c'])
  })

  it('returns the same array reference for no-ops', () => {
    const items = ['a', 'b']
    expect(moveItemInArray(items, 1, 1)).toBe(items)
    expect(moveItemInArray(items, -1, 0)).toBe(items)
    expect(moveItemInArray(items, 0, 5)).toBe(items)
  })
})
