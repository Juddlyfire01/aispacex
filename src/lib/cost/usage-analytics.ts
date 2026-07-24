// Pure usage-analytics aggregations over CostEntry[].
// Canonical source for Settings → Usage (KPIs, charts, All Events).

import type { CostEntry, CostKind } from './ledger'
import { chargedPrice, kindLabel } from '../x402/pricing'

/** Default retention window for Usage charts / All Events. */
export const USAGE_WINDOW_DAYS = 30

const MS_PER_DAY = 24 * 60 * 60 * 1000

/** UTC calendar day key `YYYY-MM-DD`. */
export function utcDayKey(ts: number): string {
  return new Date(ts).toISOString().slice(0, 10)
}

/** Start of the UTC day that is `days` before today (inclusive window start). */
export function windowStartMs(days = USAGE_WINDOW_DAYS, now = Date.now()): number {
  const todayStart = Date.UTC(
    new Date(now).getUTCFullYear(),
    new Date(now).getUTCMonth(),
    new Date(now).getUTCDate(),
  )
  return todayStart - (days - 1) * MS_PER_DAY
}

/** Drop entries older than the window (and optionally cap count, keeping newest). */
export function trimEntries(
  entries: CostEntry[],
  opts: { sinceMs?: number; maxEntries?: number } = {},
): CostEntry[] {
  const sinceMs = opts.sinceMs ?? windowStartMs()
  let out = entries.filter((e) => e.ts >= sinceMs)
  const max = opts.maxEntries
  if (max != null && out.length > max) {
    out = out.slice(out.length - max)
  }
  return out
}

export function entriesInWindow(entries: CostEntry[], sinceMs: number): CostEntry[] {
  return entries.filter((e) => e.ts >= sinceMs)
}

export interface DailyPoint {
  /** UTC day `YYYY-MM-DD`. */
  day: string
  rawUsd: number
  chargedUsd: number
  /** Number of ledger entries that day (requests). */
  requests: number
  /** Sum of billable units that day. */
  units: number
}

export interface DailySeriesOptions {
  /** When set, only include entries of this kind. */
  kind?: CostKind | string
  /** Inclusive window start (epoch ms). Defaults to last 30 UTC days. */
  sinceMs?: number
  /** Fill every UTC day in the window (including zeros). Default true. */
  fillGaps?: boolean
  now?: number
}

/**
 * Daily series for charts. Buckets by UTC day. When `fillGaps` is true, returns
 * one point per day in the window (oldest → newest), including empty days.
 */
export function dailySeries(entries: CostEntry[], opts: DailySeriesOptions = {}): DailyPoint[] {
  const now = opts.now ?? Date.now()
  const sinceMs = opts.sinceMs ?? windowStartMs(USAGE_WINDOW_DAYS, now)
  const fillGaps = opts.fillGaps !== false
  const filtered = entriesInWindow(entries, sinceMs).filter((e) =>
    opts.kind == null ? true : e.kind === opts.kind,
  )

  const byDay = new Map<string, DailyPoint>()
  for (const e of filtered) {
    const day = utcDayKey(e.ts)
    let point = byDay.get(day)
    if (!point) {
      point = { day, rawUsd: 0, chargedUsd: 0, requests: 0, units: 0 }
      byDay.set(day, point)
    }
    point.rawUsd += e.rawUsd
    point.requests += 1
    point.units += e.units
  }
  for (const point of byDay.values()) {
    point.chargedUsd = chargedPrice(point.rawUsd)
  }

  if (!fillGaps) {
    return [...byDay.values()].sort((a, b) => a.day.localeCompare(b.day))
  }

  const out: DailyPoint[] = []
  const start = sinceMs
  const endDay = utcDayKey(now)
  for (let t = start; ; t += MS_PER_DAY) {
    const day = utcDayKey(t)
    out.push(byDay.get(day) ?? { day, rawUsd: 0, chargedUsd: 0, requests: 0, units: 0 })
    if (day >= endDay) break
  }
  return out
}

export interface UsageKpis {
  /** Sum of chargedPrice(rawUsd) over the window. */
  totalCost: number
  /** Sum of units where kind === 'posts'. */
  totalPosts: number
  /** Sum of units where kind === 'users'. */
  totalUsers: number
  /** Entry count. */
  totalRequests: number
  rawUsd: number
}

export function kpiTotals(entries: CostEntry[]): UsageKpis {
  let rawUsd = 0
  let totalPosts = 0
  let totalUsers = 0
  for (const e of entries) {
    rawUsd += e.rawUsd
    if (e.kind === 'posts') totalPosts += e.units
    if (e.kind === 'users') totalUsers += e.units
  }
  return {
    totalCost: chargedPrice(rawUsd),
    totalPosts,
    totalUsers,
    totalRequests: entries.length,
    rawUsd,
  }
}

export interface AllEventsRow {
  day: string
  kind: string
  label: string
  /** Profile / subject for the action (`@alice`, Self, Image, …). */
  profile: string
  /** Request count (entry count) for that day × kind × profile. */
  requests: number
  units: number
}

/**
 * Derive a display profile from a ledger `action` (and optional meta.username).
 * Intel reports: `report:alice` or bare `alice` → `@alice`. Self → `Self`.
 * Media / compose actions stay as titled labels.
 */
export function profileFromAction(
  action: string | undefined,
  meta?: Record<string, unknown>,
): string {
  const fromMeta = meta?.username
  if (typeof fromMeta === 'string' && fromMeta.trim()) {
    const u = fromMeta.trim().replace(/^@/, '')
    return u ? `@${u}` : '—'
  }
  if (!action?.trim()) return '—'
  let a = action.trim().replace(/^@/, '')
  if (a.startsWith('report:')) a = a.slice('report:'.length)
  const lower = a.toLowerCase()
  if (lower === 'self') return 'Self'
  if (lower === 'image') return 'Image'
  if (lower === 'video') return 'Video'
  if (lower === 'music') return 'Music'
  if (lower === 'tts') return 'Speech'
  if (lower === 'alpha') return 'Alpha'
  if (lower === 'x-post' || lower === 'unassigned') return '—'
  if (!a) return '—'
  return `@${a}`
}

/**
 * All Events table: one row per UTC day × kind × profile, newest day first.
 */
export function allEvents(entries: CostEntry[]): AllEventsRow[] {
  const map = new Map<string, AllEventsRow>()
  for (const e of entries) {
    const day = utcDayKey(e.ts)
    const profile = profileFromAction(e.action, e.meta)
    const key = `${day}\0${e.kind}\0${profile}`
    let row = map.get(key)
    if (!row) {
      row = {
        day,
        kind: String(e.kind),
        label: kindLabel(e.kind),
        profile,
        requests: 0,
        units: 0,
      }
      map.set(key, row)
    }
    row.requests += 1
    row.units += e.units
  }
  return [...map.values()].sort((a, b) => {
    if (a.day !== b.day) return b.day.localeCompare(a.day)
    if (a.kind !== b.kind) return a.kind.localeCompare(b.kind)
    return a.profile.localeCompare(b.profile)
  })
}

/** Entries matching a charge action (e.g. join debit detail to cost lines). */
export function entriesForAction(
  entries: CostEntry[],
  action: string | undefined,
  opts: { nearCreatedAt?: string; slackMs?: number } = {},
): CostEntry[] {
  if (!action) return []
  let out = entries.filter((e) => e.action === action)
  if (opts.nearCreatedAt) {
    const t = Date.parse(opts.nearCreatedAt)
    if (Number.isFinite(t)) {
      const slack = opts.slackMs ?? 5 * 60 * 1000
      out = out.filter((e) => Math.abs(e.ts - t) <= slack)
    }
  }
  return out
}

/** Human-readable UTC range copy for the Usage header. */
export function usageRangeLabel(sinceMs: number, now = Date.now()): string {
  const fmt = (ms: number) =>
    new Date(ms).toLocaleDateString('en-US', {
      month: 'long',
      day: 'numeric',
      timeZone: 'UTC',
    })
  return `Showing data from ${fmt(sinceMs)} to ${fmt(now)} UTC`
}
