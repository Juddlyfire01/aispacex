// Daily reconciliation: true-up the app's ESTIMATED upstream cost against the
// ACTUAL spend reported by Venice + X, and store a truing factor per provider.
//
// Why: x402 charges users the itemized estimate × margin. Estimates use
// worst-case "others"/un-deduped rates, so actual upstream cost should be LOWER
// than estimate (the gap is margin). Reconciliation measures the real ratio:
//
//     trueFactor = actualUsd / estimatedUsd
//
// A factor < 1 confirms estimates are conservative (healthy margin). A factor
// > 1 means we're under-charging and the estimate basis needs raising. The
// factor is persisted so the credits/analytics surfaces (and a human) can
// re-true the margin denominator.
//
// Data sources:
//   - Venice: GET /billing/usage-analytics?lookback=1d (ADMIN key). Sum USD.
//   - X:      GET /2/usage/tweets (project cap usage) — read units consumed.
// The app's own estimate comes from the x402 charge ledger accumulator.

import { Redis } from '@upstash/redis'

const EST_KEY = 'x402:recon:estimate' // hash: { venice, x } cumulative estimated raw USD
const SNAP_PREFIX = 'x402:recon:snap:' // per-day snapshot JSON
const FACTOR_KEY = 'x402:recon:factor' // hash: { venice, x } latest true factor

const VENICE_API_BASE = 'https://api.venice.ai/api/v1'
const X_API_BASE = 'https://api.x.com/2'

let cached: Redis | null | undefined
function getRedis(): Redis | null {
  if (cached !== undefined) return cached
  const url = process.env.KV_REST_API_URL ?? process.env.UPSTASH_REDIS_REST_URL
  const token = process.env.KV_REST_API_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN
  cached = url && token ? new Redis({ url, token }) : null
  return cached
}

export function reconcileConfigured(): boolean {
  return getRedis() !== null
}

export interface ReconcileSnapshot {
  date: string // YYYY-MM-DD (UTC)
  estimatedUsd: { venice: number; x: number }
  actualUsd: { venice: number; x: number | null } // x actual may be unavailable
  trueFactor: { venice: number | null; x: number | null }
  createdAt: string
}

/** Accumulate the app's estimated raw upstream cost (called by the charge path). */
export async function addEstimatedCost(
  provider: 'venice' | 'x',
  rawUsd: number,
): Promise<void> {
  const redis = getRedis()
  if (!redis || !(rawUsd > 0)) return
  // Store micro-USD integer to avoid float drift.
  await redis.hincrby(EST_KEY, provider, Math.round(rawUsd * 1e6))
}

async function readEstimated(): Promise<{ venice: number; x: number }> {
  const redis = getRedis()
  if (!redis) return { venice: 0, x: 0 }
  const map = await redis.hgetall<Record<string, string | number>>(EST_KEY)
  const toUsd = (v: string | number | undefined) => (v != null ? Number(v) / 1e6 : 0)
  return { venice: toUsd(map?.venice), x: toUsd(map?.x) }
}

/** Fetch actual Venice spend (USD) over a lookback window via billing analytics. */
export async function fetchVeniceActualUsd(lookback = '1d'): Promise<number> {
  const key = process.env.VENICE_ADMIN_KEY ?? process.env.VENICE_API_KEY
  if (!key) throw new Error('venice_key_missing')
  const res = await fetch(`${VENICE_API_BASE}/billing/usage-analytics?lookback=${lookback}`, {
    headers: { Authorization: `Bearer ${key}` },
  })
  if (!res.ok) throw new Error(`venice_analytics_${res.status}`)
  const data = (await res.json()) as { byDate?: { date: string; USD?: number; DIEM?: number }[] }
  // DIEM ≈ USD; count both buckets as real cost.
  return (data.byDate ?? []).reduce((acc, d) => acc + (d.USD ?? 0) + (d.DIEM ?? 0), 0)
}

/**
 * Fetch X project usage (cap consumption). The /2/usage/tweets endpoint reports
 * project-level tweet cap usage, not a USD figure — we return the consumed unit
 * count so the caller can price it. Returns null when unavailable.
 */
export async function fetchXUsageUnits(): Promise<number | null> {
  const bearer = process.env.X_BEARER_TOKEN
  if (!bearer) return null
  try {
    const res = await fetch(`${X_API_BASE}/usage/tweets`, {
      headers: { Authorization: `Bearer ${bearer}` },
    })
    if (!res.ok) return null
    const data = (await res.json()) as { data?: { project_usage?: number | string } }
    const raw = data.data?.project_usage
    const n = raw != null ? Number(raw) : NaN
    return Number.isFinite(n) ? n : null
  } catch {
    return null
  }
}

function todayUtc(): string {
  return new Date().toISOString().slice(0, 10)
}

/**
 * Pure true-factor computation: actual/estimated per provider. Null when the
 * estimate is zero (no basis) or the actual is unavailable. A factor < 1 means
 * estimates are conservative (healthy margin); > 1 means under-charging.
 */
export function computeTrueFactors(
  estimated: { venice: number; x: number },
  actual: { venice: number; x: number | null },
): { venice: number | null; x: number | null } {
  return {
    venice: estimated.venice > 0 ? actual.venice / estimated.venice : null,
    x: actual.x != null && estimated.x > 0 ? actual.x / estimated.x : null,
  }
}

/** Run the daily true-up and persist a snapshot + factors. */
export async function runReconcile(opts: { xUnitPriceUsd?: number } = {}): Promise<ReconcileSnapshot> {
  const redis = getRedis()
  if (!redis) throw new Error('reconcile_kv_not_configured')

  const estimated = await readEstimated()

  let veniceActual = 0
  try {
    veniceActual = await fetchVeniceActualUsd('1d')
  } catch {
    veniceActual = 0
  }

  const xUnits = await fetchXUsageUnits()
  // Price X units at the same "others" post-read rate the estimator uses, unless
  // an override is provided. Null when usage is unavailable.
  const xActual = xUnits != null ? xUnits * (opts.xUnitPriceUsd ?? 0.005) : null

  const factor = computeTrueFactors(estimated, { venice: veniceActual, x: xActual })

  const snapshot: ReconcileSnapshot = {
    date: todayUtc(),
    estimatedUsd: estimated,
    actualUsd: { venice: veniceActual, x: xActual },
    trueFactor: factor,
    createdAt: new Date().toISOString(),
  }

  await redis.set(SNAP_PREFIX + snapshot.date, JSON.stringify(snapshot))
  const factorUpdate: Record<string, string> = {}
  if (factor.venice != null) factorUpdate.venice = String(factor.venice)
  if (factor.x != null) factorUpdate.x = String(factor.x)
  if (Object.keys(factorUpdate).length > 0) await redis.hset(FACTOR_KEY, factorUpdate)

  return snapshot
}

/** Read the latest persisted true factors (for display / margin re-truing). */
export async function readTrueFactors(): Promise<{ venice: number | null; x: number | null }> {
  const redis = getRedis()
  if (!redis) return { venice: null, x: null }
  const map = await redis.hgetall<Record<string, string | number>>(FACTOR_KEY)
  const num = (v: string | number | undefined) => {
    if (v == null) return null
    const n = Number(v)
    return Number.isFinite(n) ? n : null
  }
  return { venice: num(map?.venice), x: num(map?.x) }
}

/** Read a specific day's snapshot. */
export async function readSnapshot(date: string): Promise<ReconcileSnapshot | null> {
  const redis = getRedis()
  if (!redis) return null
  const raw = await redis.get<ReconcileSnapshot | string>(SNAP_PREFIX + date)
  if (!raw) return null
  return typeof raw === 'string' ? (JSON.parse(raw) as ReconcileSnapshot) : raw
}
