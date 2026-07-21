import { describe, it, expect } from 'vitest'
import {
  toSharedBundle,
  mergeBundleIntoReport,
  applySharedBundleOnSelect,
  hasLocalCorpus,
  bundleGatheredAt,
  bundleIsNewer,
} from './shared-sync'
import type { IntelReport } from '../../stores/x-intel-store'
import { DEFAULT_SYNTHESIS_SETTINGS } from './types'
import { makePost, makeProfile, makeReport } from '../intel-library/test-fixtures'
import type { SharedBundle } from './shared-types'
import {
  SHARED_BUNDLE_VERSION,
  unionReportHistory,
  mergeSharedBundleWrite,
} from './shared-types'

function makeIntelReport(partial: Partial<IntelReport> & Pick<IntelReport, 'username'>): IntelReport {
  return {
    profile: null,
    posts: [],
    edges: [],
    reportHistory: [],
    activeReportId: null,
    synthesisSettings: { ...DEFAULT_SYNTHESIS_SETTINGS },
    watch: false,
    totalCost: 0,
    createdAt: '2026-07-01T00:00:00.000Z',
    refreshedAt: {},
    ...partial,
  }
}

describe('toSharedBundle', () => {
  it('projects only public fields and strips private ones', () => {
    const report = makeIntelReport({
      username: 'AskVenice',
      profile: makeProfile('AskVenice'),
      posts: [makePost({ id: 't1' })],
      reportHistory: [makeReport('r1', 'summary')],
      watch: true,
      totalCost: 4.2,
      synthesisSettings: { ...DEFAULT_SYNTHESIS_SETTINGS, temperature: 0.9 },
      // Newer than the fixture profile.gatheredAt (2026-07-08T12:00) so it wins.
      refreshedAt: { profile: '2026-07-09T10:00:00.000Z' },
    })

    const bundle = toSharedBundle(report)

    // Public data carried through.
    expect(bundle.username).toBe('AskVenice')
    expect(bundle.profile?.username).toBe('AskVenice')
    expect(bundle.posts).toHaveLength(1)
    expect(bundle.reportHistory).toHaveLength(1)
    expect(bundle.v).toBe(SHARED_BUNDLE_VERSION)
    expect(bundle.gatheredAt).toBe('2026-07-09T10:00:00.000Z')

    // Private fields must NOT be present on the wire shape.
    const keys = Object.keys(bundle)
    expect(keys).not.toContain('totalCost')
    expect(keys).not.toContain('synthesisSettings')
    expect(keys).not.toContain('watch')
    expect(keys).not.toContain('createdAt')
  })
})

describe('bundleGatheredAt', () => {
  it('picks the latest of the section timestamps', () => {
    const at = bundleGatheredAt({
      refreshedAt: {
        profile: '2026-07-01T00:00:00.000Z',
        feed: '2026-07-09T00:00:00.000Z',
        network: '2026-07-05T00:00:00.000Z',
      },
      profile: makeProfile('x'),
      reportHistory: [],
    })
    expect(at).toBe('2026-07-09T00:00:00.000Z')
  })

  it('falls back to profile.gatheredAt then epoch', () => {
    const p = makeProfile('x')
    expect(bundleGatheredAt({ refreshedAt: {}, profile: p, reportHistory: [] })).toBe(p.gatheredAt)
    expect(bundleGatheredAt({ refreshedAt: {}, profile: null, reportHistory: [] })).toBe(
      new Date(0).toISOString(),
    )
  })

  it('advances past refresh when a newer report exists (generate-after-refresh)', () => {
    const reportCreatedAt = '2026-07-21T15:10:00.000Z'
    const at = bundleGatheredAt({
      refreshedAt: { profile: '2026-07-21T14:00:00.000Z' },
      profile: makeProfile('x'),
      reportHistory: [{ ...makeReport('r2', 'delta'), createdAt: reportCreatedAt }],
    })
    expect(at).toBe(reportCreatedAt)
  })
})

describe('unionReportHistory', () => {
  it('keeps both ids and sorts newest-first', () => {
    const older = { ...makeReport('r1', 'baseline'), createdAt: '2026-07-20T20:20:00.000Z' }
    const newer = { ...makeReport('r2', 'delta'), createdAt: '2026-07-21T15:10:00.000Z' }
    const merged = unionReportHistory([newer], [older])
    expect(merged.map((r) => r.id)).toEqual(['r2', 'r1'])
  })

  it('primary wins on id conflict', () => {
    const a = { ...makeReport('r1', 'from-primary'), createdAt: '2026-07-20T20:20:00.000Z' }
    const b = { ...makeReport('r1', 'from-secondary'), createdAt: '2026-07-20T20:20:00.000Z' }
    expect(unionReportHistory([a], [b])[0].narrative.executiveSummary).toBe('from-primary')
  })
})

describe('mergeSharedBundleWrite', () => {
  const baseBundle = (partial: Partial<SharedBundle>): SharedBundle => ({
    v: SHARED_BUNDLE_VERSION,
    username: 'tbystrican',
    profile: makeProfile('tbystrican'),
    posts: [],
    edges: [],
    reportHistory: [],
    gatheredAt: '2026-07-20T20:00:00.000Z',
    ...partial,
  })

  it('rejects equal-or-older gatheredAt', () => {
    const existing = baseBundle({
      reportHistory: [makeReport('r1', 'baseline')],
      gatheredAt: '2026-07-21T14:00:00.000Z',
    })
    const incoming = baseBundle({
      reportHistory: [makeReport('r1', 'baseline'), makeReport('r2', 'delta')],
      gatheredAt: '2026-07-21T14:00:00.000Z',
    })
    const result = mergeSharedBundleWrite(existing, incoming)
    expect(result.written).toBe(false)
    expect(result.stored.reportHistory).toHaveLength(1)
  })

  it('unions reports when a thinner newer push wins', () => {
    const r1 = { ...makeReport('r1', 'baseline'), createdAt: '2026-07-20T20:20:00.000Z' }
    const r2 = { ...makeReport('r2', 'delta'), createdAt: '2026-07-21T15:10:00.000Z' }
    const existing = baseBundle({
      reportHistory: [r2, r1],
      gatheredAt: '2026-07-21T15:10:00.000Z',
    })
    // Local machine only has r1 but refreshes → newer gatheredAt, thinner history.
    const incoming = baseBundle({
      reportHistory: [r1],
      gatheredAt: '2026-07-21T19:00:00.000Z',
    })
    const result = mergeSharedBundleWrite(existing, incoming)
    expect(result.written).toBe(true)
    expect(result.stored.reportHistory.map((r) => r.id)).toEqual(['r2', 'r1'])
    expect(result.stored.gatheredAt).toBe('2026-07-21T19:00:00.000Z')
  })
})

describe('bundleIsNewer', () => {
  const bundle: SharedBundle = {
    v: SHARED_BUNDLE_VERSION,
    username: 'x',
    profile: makeProfile('x'),
    posts: [],
    edges: [],
    reportHistory: [],
    gatheredAt: '2026-07-08T00:00:00.000Z',
  }

  it('is true when no local report exists', () => {
    expect(bundleIsNewer(bundle, undefined)).toBe(true)
  })

  it('is true when the bundle is strictly newer', () => {
    const local = makeIntelReport({ username: 'x', refreshedAt: { profile: '2026-07-01T00:00:00.000Z' } })
    expect(bundleIsNewer(bundle, local)).toBe(true)
  })

  it('is false when local is equal or newer', () => {
    const local = makeIntelReport({ username: 'x', refreshedAt: { profile: '2026-07-08T00:00:00.000Z' } })
    expect(bundleIsNewer(bundle, local)).toBe(false)
    const newer = makeIntelReport({ username: 'x', refreshedAt: { profile: '2026-07-10T00:00:00.000Z' } })
    expect(bundleIsNewer(bundle, newer)).toBe(false)
  })
})

describe('mergeBundleIntoReport', () => {
  it('adopts shared public data while preserving private local fields', () => {
    const base = makeIntelReport({
      username: 'AskVenice',
      watch: true,
      totalCost: 9.9,
      synthesisSettings: { ...DEFAULT_SYNTHESIS_SETTINGS, temperature: 0.7 },
    })
    const bundle: SharedBundle = {
      v: SHARED_BUNDLE_VERSION,
      username: 'AskVenice',
      profile: makeProfile('AskVenice'),
      posts: [makePost({ id: 't1' }), makePost({ id: 't2' })],
      edges: [],
      reportHistory: [makeReport('r1', 'shared')],
      gatheredAt: '2026-07-09T00:00:00.000Z',
    }

    const merged = mergeBundleIntoReport(bundle, base)

    // Public data replaced with the shared truth.
    expect(merged.posts).toHaveLength(2)
    expect(merged.reportHistory).toHaveLength(1)
    expect(merged.profile?.username).toBe('AskVenice')
    expect(merged.refreshedAt.profile).toBe('2026-07-09T00:00:00.000Z')

    // Private local fields untouched.
    expect(merged.watch).toBe(true)
    expect(merged.totalCost).toBe(9.9)
    expect(merged.synthesisSettings.temperature).toBe(0.7)
  })

  it('unions local reports the shared bundle is missing', () => {
    const localOnly = { ...makeReport('r2', 'local'), createdAt: '2026-07-21T15:10:00.000Z' }
    const shared = { ...makeReport('r1', 'shared'), createdAt: '2026-07-20T20:20:00.000Z' }
    const base = makeIntelReport({
      username: 'AskVenice',
      reportHistory: [localOnly],
    })
    const bundle: SharedBundle = {
      v: SHARED_BUNDLE_VERSION,
      username: 'AskVenice',
      profile: makeProfile('AskVenice'),
      posts: [],
      edges: [],
      reportHistory: [shared],
      gatheredAt: '2026-07-21T19:00:00.000Z',
    }

    const merged = mergeBundleIntoReport(bundle, base)
    expect(merged.reportHistory.map((r) => r.id)).toEqual(['r2', 'r1'])
  })

  it('round-trips through toSharedBundle then mergeBundleIntoReport', () => {
    const original = makeIntelReport({
      username: 'AskVenice',
      profile: makeProfile('AskVenice'),
      posts: [makePost({ id: 't1' })],
      reportHistory: [makeReport('r1', 'summary')],
      refreshedAt: { profile: '2026-07-08T10:00:00.000Z' },
    })
    const bundle = toSharedBundle(original)
    const emptyBase = makeIntelReport({ username: 'AskVenice' })
    const restored = mergeBundleIntoReport(bundle, emptyBase)

    expect(restored.posts).toEqual(original.posts)
    expect(restored.reportHistory).toEqual(original.reportHistory)
    expect(restored.profile).toEqual(original.profile)
  })
})

describe('applySharedBundleOnSelect', () => {
  it('unions reports but keeps local posts when corpus already exists', () => {
    const localPosts = [makePost({ id: 'fresh-1' }), makePost({ id: 'fresh-2' })]
    const r1 = { ...makeReport('r1', 'baseline'), createdAt: '2026-07-20T20:20:00.000Z' }
    const r2 = { ...makeReport('r2', 'delta'), createdAt: '2026-07-21T15:10:00.000Z' }
    const base = makeIntelReport({
      username: 'tbystrican',
      profile: makeProfile('tbystrican'),
      posts: localPosts,
      reportHistory: [r1],
      refreshedAt: { profile: '2026-07-21T19:00:00.000Z' },
    })
    const bundle: SharedBundle = {
      v: SHARED_BUNDLE_VERSION,
      username: 'tbystrican',
      profile: makeProfile('tbystrican'),
      posts: [makePost({ id: 'old-shared' })],
      edges: [],
      reportHistory: [r2, r1],
      gatheredAt: '2026-07-21T15:10:00.000Z',
    }

    expect(hasLocalCorpus(base)).toBe(true)
    const merged = applySharedBundleOnSelect(bundle, base)
    expect(merged.reportHistory.map((r) => r.id)).toEqual(['r2', 'r1'])
    expect(merged.posts).toEqual(localPosts)
    expect(merged.refreshedAt.profile).toBe('2026-07-21T19:00:00.000Z')
  })

  it('full-adopts when local bucket has no corpus yet', () => {
    const empty = makeIntelReport({ username: 'newbie' })
    const bundle: SharedBundle = {
      v: SHARED_BUNDLE_VERSION,
      username: 'newbie',
      profile: makeProfile('newbie'),
      posts: [makePost({ id: 't1' })],
      edges: [],
      reportHistory: [makeReport('r1', 'first')],
      gatheredAt: '2026-07-21T12:00:00.000Z',
    }

    expect(hasLocalCorpus(empty)).toBe(false)
    const merged = applySharedBundleOnSelect(bundle, empty)
    expect(merged.posts).toHaveLength(1)
    expect(merged.profile?.username).toBe('newbie')
    expect(merged.reportHistory).toHaveLength(1)
    expect(merged.refreshedAt.profile).toBe('2026-07-21T12:00:00.000Z')
  })
})
