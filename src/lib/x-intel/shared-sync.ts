// Client sync layer for the shared "Others" profile library.
//
// The shared library mirrors the non-private half of the x-intel corpus to a
// KV-backed server store (api/intel/*). Only PUBLIC X data leaves the device:
// profile, posts, edges, and derived report snapshots. Device-private fields
// (totalCost, per-target synthesisSettings, watch) are stripped by
// toSharedBundle and never transmitted. Nothing here touches x-self-store,
// compose, chat, or settings — the private stores are structurally unreachable
// from this module.
//
// Design rules:
//  - Every network call is best-effort. Failures (offline, no KV configured,
//    502) resolve quietly; the shared library is an enhancement, never a
//    blocker for the local-first app.
//  - pushShared is debounced per-username and fire-and-forget.
//  - pullSharedBundle merges into the store through the existing seedTarget /
//    updateReport actions so encryption + persist happen the normal way.
import { useXIntelStore, findReportKey, type IntelReport } from '../../stores/x-intel-store'
import type { SharedBundle, SharedIndexEntry } from './shared-types'
import { SHARED_BUNDLE_VERSION } from './shared-types'
import type { Profile } from './types'

const LIST_URL = '/api/intel/list'
const BUNDLE_URL = '/api/intel/bundle'

// ——— Pure mappers (unit-tested; no network, no store) ———

/**
 * Latest known refresh time for a report, used as the last-write-wins merge key.
 * Falls back through section timestamps → profile.gatheredAt → epoch so a bundle
 * always carries a comparable ISO string.
 */
export function bundleGatheredAt(report: Pick<IntelReport, 'refreshedAt' | 'profile'>): string {
  const candidates = [
    report.refreshedAt?.profile,
    report.refreshedAt?.feed,
    report.refreshedAt?.network,
    report.profile?.gatheredAt,
  ].filter((x): x is string => Boolean(x))
  if (candidates.length === 0) return new Date(0).toISOString()
  return candidates.reduce((a, b) => (a > b ? a : b))
}

/**
 * Project a local IntelReport to the shareable bundle. This is the single privacy
 * seam: fields not listed here (totalCost, synthesisSettings, watch, createdAt,
 * metricHistory, activeReportId) stay on the device.
 */
export function toSharedBundle(report: IntelReport): SharedBundle {
  return {
    v: SHARED_BUNDLE_VERSION,
    username: report.username,
    profile: report.profile,
    posts: report.posts,
    edges: report.edges,
    reportHistory: report.reportHistory,
    gatheredAt: bundleGatheredAt(report),
  }
}

/**
 * Merge a downloaded bundle into an existing local report (or an empty base),
 * preserving the device-private fields the bundle never carried. Newer posts win
 * by union; profile/edges/reports adopt the bundle's (it is the shared truth for
 * public data). Private fields (totalCost, synthesisSettings, watch) are kept
 * from `base` untouched.
 */
export function mergeBundleIntoReport(bundle: SharedBundle, base: IntelReport): IntelReport {
  return {
    ...base,
    username: base.username || bundle.username,
    profile: bundle.profile ?? base.profile,
    posts: bundle.posts,
    edges: bundle.edges,
    reportHistory: bundle.reportHistory,
    refreshedAt: { ...base.refreshedAt, profile: bundle.gatheredAt },
  }
}

/** True when the shared bundle is newer than what we hold locally (or we hold none). */
export function bundleIsNewer(bundle: SharedBundle, local: IntelReport | undefined): boolean {
  if (!local) return true
  return bundle.gatheredAt > bundleGatheredAt(local)
}

// ——— Network + store integration ———

/** Fetch the shared index. Returns [] on any failure or when KV is unconfigured. */
export async function fetchSharedIndex(signal?: AbortSignal): Promise<SharedIndexEntry[]> {
  try {
    const res = await fetch(LIST_URL, { cache: 'no-store', signal })
    if (!res.ok) return []
    const data = (await res.json()) as { configured?: boolean; entries?: SharedIndexEntry[] }
    return Array.isArray(data.entries) ? data.entries : []
  } catch {
    return []
  }
}

/**
 * Download one shared bundle and merge it into the local store. Returns the
 * canonical username on success, or null when the bundle is absent / fetch fails.
 * Does NOT add the profile to the Others rail — callers decide that (lazy add).
 */
export async function pullSharedBundle(username: string): Promise<string | null> {
  const name = username.trim().replace(/^@/, '')
  if (!name) return null
  let bundle: SharedBundle
  try {
    const res = await fetch(`${BUNDLE_URL}?username=${encodeURIComponent(name)}`, {
      cache: 'no-store',
    })
    if (!res.ok) return null
    bundle = (await res.json()) as SharedBundle
  } catch {
    return null
  }
  if (!bundle || !Array.isArray(bundle.posts)) return null

  const store = useXIntelStore.getState()

  // Seed a base bucket if we don't have one yet (keeps private defaults), then
  // merge the shared public data over it. seedTarget only refreshes the profile
  // on an existing bucket, so private fields (cost/settings/watch) are preserved.
  if (bundle.profile) {
    store.seedTarget(ensureProfileHasUsername(bundle.profile, bundle.username))
  }
  const afterSeed = useXIntelStore.getState()
  const resolvedKey = findReportKey(afterSeed.reports, bundle.username) ?? bundle.username
  const base = afterSeed.reports[resolvedKey]
  if (base) {
    const merged = mergeBundleIntoReport(bundle, base)
    store.updateReport(resolvedKey, {
      profile: merged.profile,
      posts: merged.posts,
      edges: merged.edges,
      reportHistory: merged.reportHistory,
      refreshedAt: merged.refreshedAt,
    })
  }
  return bundle.username
}

function ensureProfileHasUsername(profile: Profile, username: string): Profile {
  return profile.username ? profile : { ...profile, username }
}

// ——— Debounced push ———

const PUSH_DEBOUNCE_MS = 4_000
const pending = new Map<string, ReturnType<typeof setTimeout>>()

/**
 * Queue a debounced, fire-and-forget push of one target's shared bundle. Safe to
 * call on every store mutation — repeated calls for the same username collapse
 * into a single PUT after the corpus settles. Never throws.
 */
export function pushShared(username: string): void {
  const name = username.trim().replace(/^@/, '')
  if (!name) return
  const lower = name.toLowerCase()
  const existing = pending.get(lower)
  if (existing) clearTimeout(existing)
  const timer = setTimeout(() => {
    pending.delete(lower)
    void flushPush(name)
  }, PUSH_DEBOUNCE_MS)
  pending.set(lower, timer)
}

/** Immediately PUT the current bundle for a username (used by the debounce timer). */
async function flushPush(username: string): Promise<void> {
  const { reports } = useXIntelStore.getState()
  const key = findReportKey(reports, username)
  const report = key ? reports[key] : undefined
  if (!report || !report.profile) return // nothing worth sharing yet
  const bundle = toSharedBundle(report)
  const body = JSON.stringify(bundle)
  try {
    // Chromium caps `keepalive` fetch bodies at ~64KB and silently drops larger
    // requests — typical 50-post intel bundles exceed that, so almost nothing
    // ever reached the shared library. Only use keepalive for small payloads
    // (e.g. profile-only refreshes) so unload flushes still work when cheap.
    const res = await fetch(`${BUNDLE_URL}?username=${encodeURIComponent(username)}`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body,
      keepalive: body.length < 60_000,
    })
    if (!res.ok) {
      console.warn(`[shared-library] push @${username} failed: HTTP ${res.status}`)
    }
  } catch (err) {
    console.warn(`[shared-library] push @${username} failed`, err)
  }
}

/** Test/teardown helper: cancel any queued pushes. */
export function __clearPendingPushes(): void {
  for (const t of pending.values()) clearTimeout(t)
  pending.clear()
}
