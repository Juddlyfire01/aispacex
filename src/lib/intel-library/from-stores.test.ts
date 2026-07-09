import { describe, it, expect } from 'vitest'
import type { SelfAccount } from '../../stores/x-self-store'
import type { IntelReport } from '../../stores/x-intel-store'
import { DEFAULT_SYNTHESIS_SETTINGS } from '../x-intel/types'
import { libraryCounts } from './library'
import { scopeFromContext } from './scope'
import { buildIntelSnapshot } from './from-stores'
import { makePost, makeProfile, makeReport } from './test-fixtures'

function makeSelfAccount(partial: Partial<SelfAccount> & Pick<SelfAccount, 'id' | 'username'>): SelfAccount {
  return {
    profile: null,
    posts: [],
    bookmarks: [],
    likes: [],
    edges: [],
    reportHistory: [],
    activeReportId: null,
    refreshedAt: {},
    synthesisSettings: DEFAULT_SYNTHESIS_SETTINGS,
    ...partial,
  }
}

function makeIntelReport(partial: Partial<IntelReport> & Pick<IntelReport, 'username'>): IntelReport {
  return {
    profile: null,
    posts: [],
    edges: [],
    reportHistory: [],
    activeReportId: null,
    synthesisSettings: DEFAULT_SYNTHESIS_SETTINGS,
    watch: false,
    totalCost: 0,
    createdAt: '2026-07-01T00:00:00.000Z',
    refreshedAt: {},
    ...partial,
  }
}

describe('scopeFromContext', () => {
  it('maps __me__ to me', () => {
    expect(scopeFromContext('__me__')).toEqual({ type: 'me' })
  })

  it('maps __all__ to all', () => {
    expect(scopeFromContext('__all__')).toEqual({ type: 'all' })
  })

  it('maps a handle to target', () => {
    expect(scopeFromContext('AskVenice')).toEqual({ type: 'target', username: 'AskVenice' })
  })
})

describe('buildIntelSnapshot', () => {
  it('maps 1 self + 1 target', () => {
    const selfReport = makeReport('r-self', 'Self summary')
    const targetReport = makeReport('r-target', 'Target summary')
    const selfProfile = makeProfile('me_user')
    const targetProfile = makeProfile('AskVenice')

    const snap = buildIntelSnapshot({
      selfAccounts: [
        makeSelfAccount({
          id: 'self-1',
          username: 'me_user',
          profile: selfProfile,
          posts: [makePost({ id: 'p1', authorId: selfProfile.id })],
          bookmarks: [makePost({ id: 'b1' })],
          likes: [makePost({ id: 'l1' })],
          reportHistory: [selfReport],
          refreshedAt: {
            posts: '2026-07-08T10:00:00.000Z',
            profile: '2026-07-07T10:00:00.000Z',
          },
        }),
      ],
      reports: [
        makeIntelReport({
          username: 'AskVenice',
          profile: targetProfile,
          posts: [makePost({ id: 't1', authorId: targetProfile.id })],
          reportHistory: [targetReport],
          refreshedAt: {
            feed: '2026-07-08T11:00:00.000Z',
            profile: '2026-07-06T11:00:00.000Z',
          },
        }),
      ],
    })

    expect(snap.subjects).toHaveLength(2)

    const self = snap.subjects[0]!
    expect(self).toMatchObject({
      kind: 'self',
      id: 'self-1',
      username: 'me_user',
      profile: selfProfile,
      refreshedAt: '2026-07-08T10:00:00.000Z',
    })
    expect(self.posts).toHaveLength(1)
    expect(self.bookmarks).toHaveLength(1)
    expect(self.likes).toHaveLength(1)
    expect(self.reports).toEqual([selfReport])

    const target = snap.subjects[1]!
    expect(target).toMatchObject({
      kind: 'target',
      id: targetProfile.id,
      username: 'AskVenice',
      profile: targetProfile,
      bookmarks: [],
      likes: [],
      refreshedAt: '2026-07-08T11:00:00.000Z',
    })
    expect(target.posts).toHaveLength(1)
    expect(target.reports).toEqual([targetReport])
  })

  it('skips empty accounts', () => {
    const snap = buildIntelSnapshot({
      selfAccounts: [
        makeSelfAccount({ id: 'empty-self', username: 'ghost' }),
        makeSelfAccount({
          id: 'with-bookmarks',
          username: 'bookmarker',
          bookmarks: [makePost({ id: 'b-only' })],
        }),
      ],
      reports: [
        makeIntelReport({ username: 'empty_target' }),
        makeIntelReport({
          username: 'posts_only',
          posts: [makePost({ id: 't-only' })],
        }),
      ],
    })

    expect(snap.subjects.map((s) => s.username)).toEqual(['bookmarker', 'posts_only'])
  })

  it('maps reportHistory to reports (defaults empty array)', () => {
    const report = makeReport('r1', 'Has history')
    const snap = buildIntelSnapshot({
      selfAccounts: [
        makeSelfAccount({
          id: 's1',
          username: 'has_reports',
          profile: makeProfile('has_reports'),
          reportHistory: [report],
        }),
      ],
      reports: [
        makeIntelReport({
          username: 'no_history',
          profile: makeProfile('no_history'),
          // reportHistory omitted via empty default in fixture
        }),
      ],
    })

    expect(snap.subjects[0]!.reports).toEqual([report])
    expect(snap.subjects[1]!.reports).toEqual([])
  })

  it('libraryCounts works on result', () => {
    const snap = buildIntelSnapshot({
      selfAccounts: [
        makeSelfAccount({
          id: 's1',
          username: 'me_user',
          profile: makeProfile('me_user'),
          posts: [makePost({ id: 'p1' }), makePost({ id: 'p2' })],
          bookmarks: [makePost({ id: 'b1' })],
          likes: [makePost({ id: 'l1' }), makePost({ id: 'l2' })],
          reportHistory: [makeReport('r1', 'summary')],
        }),
      ],
      reports: [
        makeIntelReport({
          username: 'AskVenice',
          profile: makeProfile('AskVenice'),
          posts: [makePost({ id: 't1' })],
          reportHistory: [makeReport('r2', 'target')],
        }),
      ],
    })

    expect(libraryCounts(snap, { type: 'all' })).toEqual({
      subjects: 2,
      posts: 3,
      reports: 2,
      bookmarks: 1,
      likes: 2,
    })
  })

  it('includes likes-only self', () => {
    const snap = buildIntelSnapshot({
      selfAccounts: [
        makeSelfAccount({
          id: 'likes-only',
          username: 'liker',
          likes: [makePost({ id: 'l-only' })],
        }),
      ],
      reports: [],
    })

    expect(snap.subjects).toHaveLength(1)
    expect(snap.subjects[0]).toMatchObject({
      kind: 'self',
      username: 'liker',
    })
    expect(snap.subjects[0]!.likes).toHaveLength(1)
  })

  it('includes reports-only target', () => {
    const report = makeReport('r-only', 'Reports only')
    const snap = buildIntelSnapshot({
      selfAccounts: [],
      reports: [
        makeIntelReport({
          username: 'reports_only',
          reportHistory: [report],
        }),
      ],
    })

    expect(snap.subjects).toHaveLength(1)
    expect(snap.subjects[0]).toMatchObject({
      kind: 'target',
      username: 'reports_only',
      id: 'reports_only',
    })
    expect(snap.subjects[0]!.reports).toEqual([report])
  })

  it('includes edges-only target', () => {
    const edge = {
      source: 'id_edges_only',
      target: 'id_other',
      targetUsername: 'other',
      kind: 'mention' as const,
      weight: 1,
      lastSeen: '2026-07-08T12:00:00.000Z',
    }
    const snap = buildIntelSnapshot({
      selfAccounts: [],
      reports: [
        makeIntelReport({
          username: 'edges_only',
          edges: [edge],
        }),
      ],
    })

    expect(snap.subjects).toHaveLength(1)
    expect(snap.subjects[0]).toMatchObject({
      kind: 'target',
      username: 'edges_only',
    })
    expect(snap.subjects[0]!.edges).toEqual([edge])
  })

  it('refreshedAt picks later of two section stamps', () => {
    const snap = buildIntelSnapshot({
      selfAccounts: [
        makeSelfAccount({
          id: 's1',
          username: 'me_user',
          profile: makeProfile('me_user'),
          refreshedAt: {
            posts: '2026-07-01T10:00:00.000Z',
            profile: '2026-07-08T15:00:00.000Z',
            bookmarks: '2026-07-05T12:00:00.000Z',
          },
        }),
      ],
      reports: [
        makeIntelReport({
          username: 'AskVenice',
          profile: makeProfile('AskVenice'),
          refreshedAt: {
            feed: '2026-07-02T11:00:00.000Z',
            network: '2026-07-09T08:00:00.000Z',
            profile: '2026-07-04T11:00:00.000Z',
          },
        }),
      ],
    })

    expect(snap.subjects[0]!.refreshedAt).toBe('2026-07-08T15:00:00.000Z')
    expect(snap.subjects[1]!.refreshedAt).toBe('2026-07-09T08:00:00.000Z')
  })
})
