import { describe, it, expect } from 'vitest'
import {
  subjectsInScope,
  listSubjects,
  libraryCounts,
  getSubject,
  grepIntel,
  globIntel,
  getPosts,
  getReport,
  getEdges,
  getProfile,
} from './library'
import { makePost, sampleSnapshot } from './test-fixtures'
import {
  formatProfileLine,
  formatPostLine,
  formatReportBrief,
  formatEdgeLine,
} from './format'

describe('scope', () => {
  const snap = sampleSnapshot()

  it('me only self', () => {
    expect(subjectsInScope(snap, { type: 'me' }).map((s) => s.username)).toEqual(['me_user'])
  })

  it('target only that handle', () => {
    expect(subjectsInScope(snap, { type: 'target', username: 'AskVenice' })).toHaveLength(1)
  })

  it('all both', () => {
    const list = listSubjects(snap, { type: 'all' })
    expect(list).toHaveLength(2)
    const first = list[0]!
    expect(first).toMatchObject({
      postCount: expect.any(Number),
      reportCount: expect.any(Number),
      hasProfile: expect.any(Boolean),
    })
    expect(first).not.toHaveProperty('posts')
  })

  it('counts posts in all', () => {
    expect(libraryCounts(snap, { type: 'all' }).posts).toBe(4)
  })

  it('getSubject matches handle case-insensitively and strips @', () => {
    const s = getSubject(snap, { type: 'all' }, '@askvenice')
    expect(s?.username).toBe('AskVenice')
  })

  it('getSubject returns null when handle not in scope', () => {
    expect(getSubject(snap, { type: 'me' }, 'AskVenice')).toBeNull()
  })
})

describe('format helpers', () => {
  const snap = sampleSnapshot()

  it('do not throw on sample data', () => {
    for (const sub of snap.subjects) {
      if (sub.profile) formatProfileLine(sub.profile)
      for (const p of sub.posts) formatPostLine(p)
      for (const r of sub.reports) formatReportBrief(r)
      for (const e of sub.edges) formatEdgeLine(e)
    }
  })

  it('collapses multi-line and multi-space post text to a single line', () => {
    const line = formatPostLine(
      makePost({
        text: 'hello\n\n  world   with   spaces',
        createdAt: '2026-07-01T12:00:00.000Z',
        id: 'p1',
        kind: 'original',
        metrics: { likes: 3 },
      }),
    )
    expect(line).toBe('  - [2026-07-01] id=p1 (original) ♥3 — hello world with spaces')
    expect(line).not.toMatch(/\n/)
  })
})

describe('grepIntel', () => {
  const snap = sampleSnapshot()

  it('finds posts by all terms', () => {
    const hits = grepIntel(snap, { type: 'all' }, { query: 'staking VVV', types: ['posts'], limit: 20 })
    expect(hits.some((h) => h.id === 'p1')).toBe(true)
  })

  it('finds report narrative', () => {
    const hits = grepIntel(snap, { type: 'all' }, { query: 'private inference', types: ['reports'] })
    expect(hits.some((h) => h.type === 'report')).toBe(true)
  })

  it('respects handle filter', () => {
    const hits = grepIntel(snap, { type: 'all' }, { query: 'privacy', handle: 'me_user' })
    expect(hits.every((h) => h.handle === 'me_user')).toBe(true)
  })
})

describe('globIntel', () => {
  const snap = sampleSnapshot()

  it('lists report paths', () => {
    const paths = globIntel(snap, { type: 'all' }, 'intel/**/reports')
    expect(paths.some((p) => (typeof p === 'string' ? p : p.path).includes('AskVenice'))).toBe(true)
  })
})

describe('getters', () => {
  const snap = sampleSnapshot()

  it('getPosts respects since and limit', () => {
    const posts = getPosts(snap, { type: 'all' }, {
      handle: 'AskVenice',
      source: 'posts',
      since: '2026-07-05',
      limit: 10,
    })
    expect(posts.map((p) => p.id)).toEqual(['t1'])
  })

  it('getReport defaults to latest', () => {
    const r = getReport(snap, { type: 'target', username: 'AskVenice' }, { handle: 'AskVenice' })
    expect(r?.id).toBe('r-av')
  })

  it('getEdges sorts by weight desc', () => {
    const edges = getEdges(snap, { type: 'all' }, { handle: 'AskVenice' })
    expect(edges[0]?.targetUsername).toBe('gekko_eth')
  })

  it('getProfile returns profile or null', () => {
    expect(getProfile(snap, { type: 'all' }, 'AskVenice')?.username).toBe('AskVenice')
    expect(getProfile(snap, { type: 'me' }, 'AskVenice')).toBeNull()
  })
})
