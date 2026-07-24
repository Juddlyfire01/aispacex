import { describe, expect, it } from 'vitest'
import type { CostEntry } from './ledger'
import {
  allEvents,
  dailySeries,
  entriesForAction,
  entriesInWindow,
  kpiTotals,
  trimEntries,
  utcDayKey,
  windowStartMs,
} from './usage-analytics'
import { chargedPrice } from '../x402/pricing'

function entry(partial: Partial<CostEntry> & Pick<CostEntry, 'kind' | 'rawUsd' | 'ts'>): CostEntry {
  return {
    id: partial.id ?? `e_${partial.ts}_${partial.kind}`,
    action: partial.action,
    provider: partial.provider ?? 'x',
    kind: partial.kind,
    units: partial.units ?? 1,
    unitPriceUsd: partial.unitPriceUsd ?? partial.rawUsd,
    rawUsd: partial.rawUsd,
    ts: partial.ts,
    meta: partial.meta,
  }
}

describe('utcDayKey / windowStartMs', () => {
  it('formats UTC day keys', () => {
    expect(utcDayKey(Date.parse('2026-07-24T15:30:00.000Z'))).toBe('2026-07-24')
  })

  it('windowStartMs is 29 days before today UTC start for a 30-day window', () => {
    const now = Date.parse('2026-07-24T12:00:00.000Z')
    const start = windowStartMs(30, now)
    expect(utcDayKey(start)).toBe('2026-06-25')
  })
})

describe('trimEntries / entriesInWindow', () => {
  it('drops entries older than sinceMs and caps count keeping newest', () => {
    const entries = [
      entry({ kind: 'posts', rawUsd: 0.1, ts: 1000, units: 1 }),
      entry({ kind: 'posts', rawUsd: 0.2, ts: 2000, units: 1 }),
      entry({ kind: 'posts', rawUsd: 0.3, ts: 3000, units: 1 }),
    ]
    expect(entriesInWindow(entries, 2000)).toHaveLength(2)
    expect(trimEntries(entries, { sinceMs: 1500, maxEntries: 1 })).toEqual([
      expect.objectContaining({ ts: 3000 }),
    ])
  })
})

describe('dailySeries', () => {
  it('buckets by UTC day and fills gaps', () => {
    const now = Date.parse('2026-07-03T18:00:00.000Z')
    const sinceMs = Date.parse('2026-07-01T00:00:00.000Z')
    const entries = [
      entry({ kind: 'posts', rawUsd: 1, units: 200, ts: Date.parse('2026-07-01T10:00:00.000Z') }),
      entry({ kind: 'posts', rawUsd: 0.5, units: 100, ts: Date.parse('2026-07-01T22:00:00.000Z') }),
      entry({ kind: 'users', rawUsd: 0.01, units: 1, ts: Date.parse('2026-07-03T01:00:00.000Z') }),
    ]
    const series = dailySeries(entries, { sinceMs, now, fillGaps: true })
    expect(series.map((p) => p.day)).toEqual(['2026-07-01', '2026-07-02', '2026-07-03'])
    expect(series[0].rawUsd).toBeCloseTo(1.5)
    expect(series[0].requests).toBe(2)
    expect(series[0].chargedUsd).toBeCloseTo(chargedPrice(1.5))
    expect(series[1].requests).toBe(0)
    expect(series[2].requests).toBe(1)
  })

  it('filters by kind', () => {
    const now = Date.parse('2026-07-01T12:00:00.000Z')
    const sinceMs = Date.parse('2026-07-01T00:00:00.000Z')
    const entries = [
      entry({ kind: 'posts', rawUsd: 1, ts: now, units: 10 }),
      entry({ kind: 'users', rawUsd: 0.5, ts: now, units: 1 }),
    ]
    const series = dailySeries(entries, { sinceMs, now, kind: 'posts', fillGaps: false })
    expect(series).toHaveLength(1)
    expect(series[0].rawUsd).toBeCloseTo(1)
    expect(series[0].requests).toBe(1)
  })
})

describe('kpiTotals', () => {
  it('sums cost, posts, users, and requests', () => {
    const entries = [
      entry({ kind: 'posts', rawUsd: 1, units: 200, ts: 1 }),
      entry({ kind: 'users', rawUsd: 0.02, units: 2, ts: 2 }),
      entry({ kind: 'text', rawUsd: 0.3, units: 1000, provider: 'venice', ts: 3 }),
    ]
    const k = kpiTotals(entries)
    expect(k.rawUsd).toBeCloseTo(1.32)
    expect(k.totalCost).toBeCloseTo(chargedPrice(1.32))
    expect(k.totalPosts).toBe(200)
    expect(k.totalUsers).toBe(2)
    expect(k.totalRequests).toBe(3)
  })
})

describe('allEvents', () => {
  it('groups by day × kind × profile, newest day first', () => {
    const entries = [
      entry({
        kind: 'posts',
        rawUsd: 1,
        units: 10,
        ts: Date.parse('2026-07-01T10:00:00.000Z'),
        action: 'report:alice',
      }),
      entry({
        kind: 'posts',
        rawUsd: 1,
        units: 5,
        ts: Date.parse('2026-07-01T11:00:00.000Z'),
        action: 'report:alice',
      }),
      entry({
        kind: 'posts',
        rawUsd: 0.5,
        units: 20,
        ts: Date.parse('2026-07-01T12:00:00.000Z'),
        action: 'report:bob',
      }),
      entry({
        kind: 'counts',
        rawUsd: 0.005,
        units: 1,
        ts: Date.parse('2026-07-02T10:00:00.000Z'),
        action: 'self',
      }),
    ]
    const rows = allEvents(entries)
    expect(rows[0].day).toBe('2026-07-02')
    expect(rows[0].profile).toBe('Self')
    expect(rows.map((r) => `${r.day}:${r.profile}:${r.kind}:${r.requests}`)).toEqual([
      '2026-07-02:Self:counts:1',
      '2026-07-01:@alice:posts:2',
      '2026-07-01:@bob:posts:1',
    ])
  })
})

describe('entriesForAction', () => {
  it('joins by action and optional nearCreatedAt slack', () => {
    const entries = [
      entry({
        kind: 'posts',
        rawUsd: 1,
        ts: Date.parse('2026-07-24T10:00:00.000Z'),
        action: 'report:alice',
        units: 100,
      }),
      entry({
        kind: 'text',
        rawUsd: 0.2,
        ts: Date.parse('2026-07-24T10:01:00.000Z'),
        action: 'report:alice',
        provider: 'venice',
        units: 500,
      }),
      entry({
        kind: 'posts',
        rawUsd: 1,
        ts: Date.parse('2026-07-20T10:00:00.000Z'),
        action: 'report:alice',
        units: 50,
      }),
      entry({ kind: 'posts', rawUsd: 1, ts: Date.parse('2026-07-24T10:00:00.000Z'), action: 'image' }),
    ]
    expect(entriesForAction(entries, 'report:alice')).toHaveLength(3)
    expect(
      entriesForAction(entries, 'report:alice', {
        nearCreatedAt: '2026-07-24T10:00:30.000Z',
        slackMs: 5 * 60 * 1000,
      }),
    ).toHaveLength(2)
    expect(entriesForAction(entries, undefined)).toHaveLength(0)
  })
})
