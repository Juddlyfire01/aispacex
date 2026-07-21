// Shared-library data shapes for the KV-backed "Others" profile mirror.
//
// These types are the wire contract between the client sync layer
// (src/lib/x-intel/shared-sync.ts) and the serverless routes (api/intel/*).
// Kept deliberately small and framework-free so both the browser bundle and the
// Node API can import them without pulling in React or zustand.
//
// Privacy note: a SharedBundle is a projection of the local IntelReport that
// carries ONLY public X data (profile, posts, edges) plus derived analytics
// (reportHistory). Device-private fields — totalCost, per-target
// synthesisSettings, and the `watch` flag — are intentionally excluded and
// never leave the device. See toSharedBundle() in shared-sync.ts.
import type { Profile, Post, Edge, IntelReportSnapshot } from './types.js'

/** Current shared-bundle schema version. Bump when the wire shape changes. */
export const SHARED_BUNDLE_VERSION = 1

/**
 * One profile's shareable corpus, as stored under `intel:bundle:<username>` and
 * transferred to/from the client. `gatheredAt` is the merge key: last write wins.
 */
export interface SharedBundle {
  /** Schema version for forward-compatible reads. */
  v: number
  /** Canonical username (case-preserved as gathered), no leading @. */
  username: string
  profile: Profile | null
  posts: Post[]
  edges: Edge[]
  reportHistory: IntelReportSnapshot[]
  /**
   * ISO timestamp used for last-write-wins conflict resolution. Derived from the
   * most recent section refresh, profile.gatheredAt, or newest report createdAt
   * at push time — whichever is latest — so report-only uploads are not treated
   * as stale relative to the refresh that unlocked them.
   */
  gatheredAt: string
}

/**
 * Merge two report histories by snapshot id. Primary wins on id conflict;
 * result is newest-first by createdAt. Used so a thinner push/pull cannot wipe
 * reports the other side already held.
 */
export function unionReportHistory(
  primary: IntelReportSnapshot[],
  secondary: IntelReportSnapshot[],
): IntelReportSnapshot[] {
  const byId = new Map<string, IntelReportSnapshot>()
  for (const r of secondary) byId.set(r.id, r)
  for (const r of primary) byId.set(r.id, r)
  return [...byId.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt))
}

/**
 * Pure LWW + report-union decision for a shared-bundle upsert. Extracted so the
 * KV layer and unit tests share one rule: newer gatheredAt wins corpus fields,
 * but reportHistory is always the union of incoming and existing ids.
 */
export function mergeSharedBundleWrite(
  existing: SharedBundle | null,
  incoming: SharedBundle,
): { stored: SharedBundle; written: boolean } {
  if (existing && existing.gatheredAt >= incoming.gatheredAt) {
    return { stored: existing, written: false }
  }
  const stored: SharedBundle = {
    ...incoming,
    reportHistory: existing
      ? unionReportHistory(incoming.reportHistory, existing.reportHistory)
      : incoming.reportHistory,
  }
  return { stored, written: true }
}

/**
 * Lightweight index row for the browse list + type-ahead. Small enough that the
 * whole index is one KV read — no need to fetch every bundle to render the list.
 */
export interface SharedIndexEntry {
  /** Canonical username (case-preserved), no leading @. */
  username: string
  displayName: string
  avatarUrl: string
  followers: number
  postCount: number
  reportCount: number
  /** ISO — last time this bundle was updated in the shared store. */
  gatheredAt: string
  /**
   * Org affiliation badge URL when the profile is a Verified Org member.
   * Optional for backward compatibility with older index rows.
   */
  affiliationBadgeUrl?: string | null
  /** Org name / affiliation description for the badge tooltip. */
  affiliationLabel?: string | null
}

/** Lowercase, @-stripped storage/key form of a username. */
export function sharedKey(username: string): string {
  return username.trim().replace(/^@/, '').toLowerCase()
}
