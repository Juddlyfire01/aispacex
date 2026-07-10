import { describe, it, expect } from 'vitest'
import { splitEvidence, postUrl, postHref, postIdFromHref } from './evidence'

describe('splitEvidence', () => {
  it('extracts "post:"-prefixed ids and leaves clean prose', () => {
    const { prose, ids } = splitEvidence('New Model Launches — post:2072408045007573141, post:2072367342684610616')
    expect(prose).toBe('New Model Launches')
    expect(ids).toEqual(['2072408045007573141', '2072367342684610616'])
  })

  it('extracts bare snowflake ids', () => {
    const { prose, ids } = splitEvidence('drove engagement 2069481225316905200 and 2069135635848294875')
    expect(ids).toEqual(['2069481225316905200', '2069135635848294875'])
    expect(prose).toBe('drove engagement and')
  })

  it('dedupes repeated ids preserving order', () => {
    const { ids } = splitEvidence('post:123456789012345 post:123456789012345 post:987654321098765')
    expect(ids).toEqual(['123456789012345', '987654321098765'])
  })

  it('returns all prose and no ids when there are none', () => {
    const { prose, ids } = splitEvidence('Consistent anti-surveillance messaging')
    expect(prose).toBe('Consistent anti-surveillance messaging')
    expect(ids).toEqual([])
  })

  it('does not treat short numbers as ids', () => {
    const { prose, ids } = splitEvidence('reduced from 4M to 3M over 12 months')
    expect(ids).toEqual([])
    expect(prose).toBe('reduced from 4M to 3M over 12 months')
  })
})

describe('postUrl', () => {
  it('builds an x.com status permalink', () => {
    expect(postUrl('2072408045007573141')).toBe('https://x.com/i/status/2072408045007573141')
  })
})

describe('post sentinel href', () => {
  it('round-trips a post id', () => {
    expect(postIdFromHref(postHref('2072408045007573141'))).toBe('2072408045007573141')
  })

  it('returns null for a non-sentinel href', () => {
    expect(postIdFromHref('https://x.com/i/status/1')).toBeNull()
    expect(postIdFromHref(undefined)).toBeNull()
  })
})
