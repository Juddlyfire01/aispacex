import { describe, it, expect, beforeEach } from 'vitest'
import { useXIntelStore, mergePosts, newReportId } from './x-intel-store'
import type { Post, IntelReportSnapshot } from '../lib/x-intel/types'

const makeSnapshot = (id: string): IntelReportSnapshot => ({
  id,
  createdAt: new Date().toISOString(),
  model: 'venice-uncensored-1-2',
  synthesisSettings: { contextCap: 80, temperature: 0.3, model: 'venice-uncensored-1-2', includedReportIds: [] },
  meta: { postCount: 1, dateRange: null, postIdsAnalyzed: ['p1'], tokenCost: 100 },
  analytics: {} as IntelReportSnapshot['analytics'],
  narrative: {} as IntelReportSnapshot['narrative'],
  changeSummary: null,
  previousReportId: null,
})

const makePost = (id: string, createdAt: string): Post => ({
  id, authorId: '42', text: `post ${id}`, lang: 'en', createdAt,
  metrics: { impressions: 0, likes: 0, reposts: 0, replies: 0, quotes: 0, bookmarks: 0 },
  kind: 'original', referenced: [], urls: [], mentions: [], mediaKeys: [],
  contextAnnotations: [], gatheredAt: createdAt,
})

describe('mergePosts', () => {
  it('dedupes by id, newer gatheredAt wins, sorted newest first', () => {
    const existing = [makePost('1', '2026-06-01T00:00:00Z'), makePost('2', '2026-06-02T00:00:00Z')]
    const incoming = [makePost('2', '2026-06-02T00:00:00Z'), makePost('3', '2026-06-03T00:00:00Z')]
    const merged = mergePosts(existing, incoming)
    expect(merged.map((p) => p.id)).toEqual(['3', '2', '1'])
  })
})

describe('useXIntelStore', () => {
  beforeEach(() => {
    useXIntelStore.setState({
      targets: [],
      reports: {},
      activeTarget: null,
      sessionCost: 0,
      lifetimeTotal: 0,
      feedFocusPostId: null,
      feedFocusNonce: 0,
      generatingReports: {},
      reportGenerateErrors: {},
      gatheringTargets: {},
    })
  })

  it('addTarget creates an empty report and selects it', () => {
    useXIntelStore.getState().addTarget('ErikVoorhees')
    const s = useXIntelStore.getState()
    expect(s.targets).toEqual(['ErikVoorhees'])
    expect(s.activeTarget).toBe('ErikVoorhees')
    expect(s.reports['ErikVoorhees']).toBeDefined()
    expect(s.reports['ErikVoorhees'].posts).toEqual([])
  })

  it('addTarget is idempotent per username (case-insensitive)', () => {
    useXIntelStore.getState().addTarget('ErikVoorhees')
    useXIntelStore.getState().addTarget('erikvoorhees')
    expect(useXIntelStore.getState().targets).toHaveLength(1)
  })

  it('removeTarget soft-removes from rail but keeps cached report', () => {
    useXIntelStore.getState().addTarget('ErikVoorhees')
    useXIntelStore.getState().updateReport('ErikVoorhees', { watch: true })
    useXIntelStore.getState().removeTarget('ErikVoorhees')
    const s = useXIntelStore.getState()
    expect(s.targets).toEqual([])
    expect(s.reports['ErikVoorhees'].watch).toBe(true)
    expect(s.activeTarget).toBeNull()
  })

  it('purgeTarget hard-deletes cached report and deselects', () => {
    useXIntelStore.getState().addTarget('ErikVoorhees')
    useXIntelStore.getState().purgeTarget('ErikVoorhees')
    const s = useXIntelStore.getState()
    expect(s.targets).toEqual([])
    expect(s.reports['ErikVoorhees']).toBeUndefined()
    expect(s.activeTarget).toBeNull()
  })

  it('addTarget revives a soft-removed target with its cached data', () => {
    const store = useXIntelStore.getState()
    store.addTarget('ErikVoorhees')
    store.appendReport('ErikVoorhees', makeSnapshot('a'))
    store.removeTarget('ErikVoorhees')
    store.addTarget('erikvoorhees')
    const r = useXIntelStore.getState().reports['ErikVoorhees']
    expect(useXIntelStore.getState().targets).toEqual(['ErikVoorhees'])
    expect(r.reportHistory.map((s) => s.id)).toEqual(['a'])
  })

  it('addCost accumulates visit, lifetime, and per-target cost', () => {
    useXIntelStore.getState().addTarget('ErikVoorhees')
    useXIntelStore.getState().addCost('ErikVoorhees', 0.26)
    useXIntelStore.getState().addCost('ErikVoorhees', 0.01)
    const s = useXIntelStore.getState()
    expect(s.sessionCost).toBeCloseTo(0.27)
    expect(s.lifetimeTotal).toBeCloseTo(0.27)
    expect(s.reports['ErikVoorhees'].totalCost).toBeCloseTo(0.27)
  })

  it('removeTarget does not decrease lifetimeTotal', () => {
    useXIntelStore.getState().addTarget('ErikVoorhees')
    useXIntelStore.getState().addCost('ErikVoorhees', 0.45)
    useXIntelStore.getState().removeTarget('ErikVoorhees')
    expect(useXIntelStore.getState().lifetimeTotal).toBeCloseTo(0.45)
  })

  it('removeTarget is case-insensitive (matches addTarget canonicalization)', () => {
    useXIntelStore.getState().addTarget('ErikVoorhees')
    useXIntelStore.getState().removeTarget('erikvoorhees')
    expect(useXIntelStore.getState().targets).toEqual([])
    expect(useXIntelStore.getState().activeTarget).toBeNull()
  })

  it('reorderTargets moves a profile within the rail and preserves selection', () => {
    const store = useXIntelStore.getState()
    store.addTarget('Alice')
    store.addTarget('Bob')
    store.addTarget('Carol')
    store.setActiveTarget('Bob')
    store.reorderTargets(0, 2)
    const s = useXIntelStore.getState()
    expect(s.targets).toEqual(['Bob', 'Carol', 'Alice'])
    expect(s.activeTarget).toBe('Bob')
  })

  it('reorderTargets is a no-op for out-of-bounds indexes', () => {
    useXIntelStore.getState().addTarget('Alice')
    useXIntelStore.getState().addTarget('Bob')
    useXIntelStore.getState().reorderTargets(0, 9)
    expect(useXIntelStore.getState().targets).toEqual(['Alice', 'Bob'])
  })

  it('addCost is a no-op for non-existent target (does not inflate sessionCost)', () => {
    useXIntelStore.getState().addTarget('ErikVoorhees')
    useXIntelStore.getState().addCost('NonExistent', 0.5)
    const s = useXIntelStore.getState()
    expect(s.sessionCost).toBe(0)  // not inflated
    expect(s.reports['ErikVoorhees'].totalCost).toBe(0)  // untouched
  })

  it('updateReport is case-insensitive', () => {
    useXIntelStore.getState().addTarget('ErikVoorhees')
    useXIntelStore.getState().updateReport('ERIKVOORHEES', { watch: true })
    expect(useXIntelStore.getState().reports['ErikVoorhees'].watch).toBe(true)
  })

  it('addTarget seeds an empty append-only report ledger', () => {
    useXIntelStore.getState().addTarget('ErikVoorhees')
    const r = useXIntelStore.getState().reports['ErikVoorhees']
    expect(r.reportHistory).toEqual([])
    expect(r.activeReportId).toBeNull()
  })

  it('appendReport prepends newest-first and activates the new report', () => {
    const store = useXIntelStore.getState()
    store.addTarget('ErikVoorhees')
    store.appendReport('ErikVoorhees', makeSnapshot('a'))
    store.appendReport('ErikVoorhees', makeSnapshot('b'))
    const r = useXIntelStore.getState().reports['ErikVoorhees']
    expect(r.reportHistory.map((s) => s.id)).toEqual(['b', 'a'])
    expect(r.activeReportId).toBe('b')
  })

  it('setActiveReport switches only to an existing snapshot', () => {
    const store = useXIntelStore.getState()
    store.addTarget('ErikVoorhees')
    store.appendReport('ErikVoorhees', makeSnapshot('a'))
    store.appendReport('ErikVoorhees', makeSnapshot('b'))
    store.setActiveReport('ErikVoorhees', 'a')
    expect(useXIntelStore.getState().reports['ErikVoorhees'].activeReportId).toBe('a')
    store.setActiveReport('ErikVoorhees', 'nonexistent')
    expect(useXIntelStore.getState().reports['ErikVoorhees'].activeReportId).toBe('a') // unchanged
  })

  it('deleteReport removes a snapshot and re-points activeReportId to newest', () => {
    const store = useXIntelStore.getState()
    store.addTarget('ErikVoorhees')
    store.appendReport('ErikVoorhees', makeSnapshot('a'))
    store.appendReport('ErikVoorhees', makeSnapshot('b')) // active = b
    store.deleteReport('ErikVoorhees', 'b')
    const r = useXIntelStore.getState().reports['ErikVoorhees']
    expect(r.reportHistory.map((s) => s.id)).toEqual(['a'])
    expect(r.activeReportId).toBe('a') // fell back to remaining newest
  })

  it('deleteReport keeps activeReportId when a non-active report is removed', () => {
    const store = useXIntelStore.getState()
    store.addTarget('ErikVoorhees')
    store.appendReport('ErikVoorhees', makeSnapshot('a'))
    store.appendReport('ErikVoorhees', makeSnapshot('b')) // active = b
    store.deleteReport('ErikVoorhees', 'a')
    expect(useXIntelStore.getState().reports['ErikVoorhees'].activeReportId).toBe('b')
  })

  it('setReportGenerating / setReportGenerateError are ephemeral and keyed by report', () => {
    const store = useXIntelStore.getState()
    store.addTarget('ErikVoorhees')
    store.setReportGenerating('ErikVoorhees', true)
    store.setReportGenerateError('ErikVoorhees', 'boom')
    expect(useXIntelStore.getState().generatingReports['ErikVoorhees']).toBe(true)
    expect(useXIntelStore.getState().reportGenerateErrors['ErikVoorhees']).toBe('boom')
    store.setReportGenerating('ErikVoorhees', false)
    store.setReportGenerateError('ErikVoorhees', null)
    expect(useXIntelStore.getState().generatingReports['ErikVoorhees']).toBeUndefined()
    expect(useXIntelStore.getState().reportGenerateErrors['ErikVoorhees']).toBeUndefined()
  })

  it('setGathering tracks ephemeral per-target gather state', () => {
    const store = useXIntelStore.getState()
    store.addTarget('ErikVoorhees')
    store.setGathering('ErikVoorhees', true)
    expect(useXIntelStore.getState().gatheringTargets['ErikVoorhees']).toBe(true)
    store.setGathering('ErikVoorhees', false)
    expect(useXIntelStore.getState().gatheringTargets['ErikVoorhees']).toBeUndefined()
  })
})

describe('newReportId', () => {
  it('generates unique ids', () => {
    const ids = new Set(Array.from({ length: 100 }, () => newReportId()))
    expect(ids.size).toBe(100)
  })
})
