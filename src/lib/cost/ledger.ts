// Unified cost ledger primitives.
//
// Every cost-incurring call in the app (X reads/writes + Venice text/media)
// produces a `CostEntry`. Entries are grouped into an `ActionCost` under a
// logical user action (e.g. "generate report", "generate image") so the x402
// layer can charge per action and the cost meter can show raw spend.
//
// This module is pure: no React, no store, no side effects. The store
// (cost-ledger-store.ts) accumulates entries and derives session/lifetime
// totals; adapters in x-intel-store / venice-cost-store and the media/write
// paths call `recordCost` on that store.

export type CostProvider = 'x' | 'venice'

/**
 * Cost line-item kind. X kinds map to the pay-per-use rate card; Venice kinds
 * map to model_spec.pricing. Left as a widenable union so new kinds can be
 * added without breaking callers.
 */
export type CostKind =
  // X reads (per resource returned)
  | 'posts'
  | 'users'
  | 'likes'
  | 'counts'
  | 'news_search'
  // X writes (per request)
  | 'post_create'
  | 'post_create_url'
  // Venice
  | 'text'
  | 'image'
  | 'image_edit'
  | 'image_upscale'
  | 'video'
  | 'music'
  | 'tts'
  | (string & {})

export interface CostEntry {
  /** Unique id for this line item. */
  id: string
  /** Logical action grouping (e.g. report id, "image", compose thread id). */
  action?: string
  provider: CostProvider
  kind: CostKind
  /** Number of billable units (resources, tokens, seconds, chars, or 1). */
  units: number
  /** USD price per unit at the moment of recording. */
  unitPriceUsd: number
  /** Total USD for this line item (units * unitPriceUsd, or a precomputed sum). */
  rawUsd: number
  /** Epoch ms. */
  ts: number
  /** Free-form context (model id, username, requestId, etc.). */
  meta?: Record<string, unknown>
}

export interface ActionCost {
  action: string
  entries: CostEntry[]
  totalUsd: number
  byProvider: Record<CostProvider, number>
}

/** Input to record a cost line item. `rawUsd` defaults to units * unitPriceUsd. */
export interface CostEntryInput {
  action?: string
  provider: CostProvider
  kind: CostKind
  units: number
  unitPriceUsd: number
  /** Override the computed total (e.g. when the sum is already known exactly). */
  rawUsd?: number
  meta?: Record<string, unknown>
}

function newId(): string {
  try {
    return crypto.randomUUID()
  } catch {
    return `cost_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`
  }
}

/** Build a normalized CostEntry from loose input. */
export function makeEntry(input: CostEntryInput): CostEntry {
  const units = Number.isFinite(input.units) ? Math.max(0, input.units) : 0
  const unitPriceUsd = Number.isFinite(input.unitPriceUsd) ? Math.max(0, input.unitPriceUsd) : 0
  const rawUsd =
    input.rawUsd != null && Number.isFinite(input.rawUsd)
      ? Math.max(0, input.rawUsd)
      : units * unitPriceUsd
  return {
    id: newId(),
    action: input.action,
    provider: input.provider,
    kind: input.kind,
    units,
    unitPriceUsd,
    rawUsd,
    ts: Date.now(),
    meta: input.meta,
  }
}

/** Group entries by their `action` (entries without one fall under "unassigned"). */
export function groupByAction(entries: CostEntry[]): ActionCost[] {
  const map = new Map<string, ActionCost>()
  for (const e of entries) {
    const action = e.action ?? 'unassigned'
    let group = map.get(action)
    if (!group) {
      group = { action, entries: [], totalUsd: 0, byProvider: { x: 0, venice: 0 } }
      map.set(action, group)
    }
    group.entries.push(e)
    group.totalUsd += e.rawUsd
    group.byProvider[e.provider] += e.rawUsd
  }
  return [...map.values()]
}

/** Sum raw USD across entries, optionally filtered by provider. */
export function sumUsd(entries: CostEntry[], provider?: CostProvider): number {
  return entries.reduce((acc, e) => (provider && e.provider !== provider ? acc : acc + e.rawUsd), 0)
}
