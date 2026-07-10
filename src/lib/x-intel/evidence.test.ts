import { describe, it, expect } from 'vitest'
import { splitEvidence, postUrl, postHref, postIdFromHref, postIdFromStatusUrl, normalizePostId } from './evidence'

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

describe('postIdFromStatusUrl', () => {
  const id = '2075585701392032158'

  it('parses /i/status/<id>', () => {
    expect(postIdFromStatusUrl(`https://x.com/i/status/${id}`)).toBe(id)
  })

  it('parses /@user/status/<id> with query', () => {
    expect(postIdFromStatusUrl(`https://x.com/Dagnum_PI/status/${id}?s=20`)).toBe(id)
  })

  it('parses twitter.com hosts', () => {
    expect(postIdFromStatusUrl(`https://twitter.com/foo/status/${id}`)).toBe(id)
    expect(postIdFromStatusUrl(`https://www.twitter.com/foo/status/${id}`)).toBe(id)
  })

  it('parses embed-fixer and nitter mirror hosts', () => {
    expect(postIdFromStatusUrl(`https://fxtwitter.com/foo/status/${id}`)).toBe(id)
    expect(postIdFromStatusUrl(`https://vxtwitter.com/foo/status/${id}`)).toBe(id)
    expect(postIdFromStatusUrl(`https://fixupx.com/foo/status/${id}`)).toBe(id)
    expect(postIdFromStatusUrl(`https://nitter.net/foo/status/${id}`)).toBe(id)
    expect(postIdFromStatusUrl(`https://nitter.poast.org/foo/status/${id}`)).toBe(id)
  })

  it('returns null for non-status URLs', () => {
    expect(postIdFromStatusUrl('https://x.com/AskVenice')).toBeNull()
    expect(postIdFromStatusUrl('https://example.com/status/123')).toBeNull()
    expect(postIdFromStatusUrl(undefined)).toBeNull()
  })
})

describe('normalizePostId', () => {
  it('passes through a bare snowflake', () => {
    expect(normalizePostId('2075587500908333628')).toBe('2075587500908333628')
  })

  it('strips thousands-comma grouping', () => {
    expect(normalizePostId('2,075,587,500,908,333,628')).toBe('2075587500908333628')
  })

  it('rejects too-short and too-long digit runs', () => {
    expect(normalizePostId('12345')).toBeNull()
    expect(normalizePostId('123456789012345678901234')).toBeNull()
  })
})
