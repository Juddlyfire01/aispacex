import { describe, it, expect } from 'vitest'
import {
  subjectsInScope,
  listSubjects,
  libraryCounts,
  getSubject,
} from './library'
import { sampleSnapshot } from './test-fixtures'
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
    expect(listSubjects(snap, { type: 'all' })).toHaveLength(2)
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
})
