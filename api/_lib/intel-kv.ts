// Shared KV access for the Intel shared-profile library.
//
// Backed by Upstash Redis (the successor to the deprecated Vercel KV). On Vercel
// the Marketplace Redis integration auto-injects KV_REST_API_URL /
// KV_REST_API_TOKEN (Upstash also accepts UPSTASH_REDIS_REST_URL / _TOKEN). When
// neither pair is present — local `npm run dev` with no store provisioned — we
// return null so the routes degrade gracefully (503) instead of throwing, and
// the client sync layer silently no-ops. The shared library is an enhancement,
// never a hard dependency of the app.
import { Redis } from '@upstash/redis'
import type { SharedBundle, SharedIndexEntry } from '../../src/lib/x-intel/shared-types.js'
import { sharedKey } from '../../src/lib/x-intel/shared-types.js'

const BUNDLE_PREFIX = 'intel:bundle:'
const INDEX_KEY = 'intel:index'

let cached: Redis | null | undefined

/** Lazily construct the Redis client from whichever env var pair is present. */
function getRedis(): Redis | null {
  if (cached !== undefined) return cached
  const url = process.env.KV_REST_API_URL ?? process.env.UPSTASH_REDIS_REST_URL
  const token = process.env.KV_REST_API_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN
  cached = url && token ? new Redis({ url, token }) : null
  return cached
}

/** True when a KV store is configured; routes return 503 when false. */
export function intelKvConfigured(): boolean {
  return getRedis() !== null
}

/** Read the full shared index (browse list + type-ahead source). */
export async function readIndex(): Promise<SharedIndexEntry[]> {
  const redis = getRedis()
  if (!redis) return []
  // Index is stored as a hash: field = lowercase username, value = entry JSON.
  const map = await redis.hgetall<Record<string, SharedIndexEntry>>(INDEX_KEY)
  if (!map) return []
  // Upstash auto-deserializes JSON values; guard against string values too.
  return Object.values(map)
    .map((v) => (typeof v === 'string' ? (JSON.parse(v) as SharedIndexEntry) : v))
    .filter((e): e is SharedIndexEntry => Boolean(e && e.username))
    .sort((a, b) => b.gatheredAt.localeCompare(a.gatheredAt))
}

/** Read one shared bundle by username, or null when absent. */
export async function readBundle(username: string): Promise<SharedBundle | null> {
  const redis = getRedis()
  if (!redis) return null
  const raw = await redis.get<SharedBundle | string>(BUNDLE_PREFIX + sharedKey(username))
  if (!raw) return null
  return typeof raw === 'string' ? (JSON.parse(raw) as SharedBundle) : raw
}

/**
 * Upsert a bundle with last-write-wins semantics on `gatheredAt`. Returns the
 * bundle that is now authoritative (the incoming one when it won, else the
 * existing newer one) plus whether a write actually happened.
 */
export async function writeBundle(
  incoming: SharedBundle,
): Promise<{ stored: SharedBundle; written: boolean }> {
  const redis = getRedis()
  if (!redis) return { stored: incoming, written: false }

  const key = sharedKey(incoming.username)
  const existing = await readBundle(key)
  // Stale write: an equal-or-newer bundle already exists — keep it.
  if (existing && existing.gatheredAt >= incoming.gatheredAt) {
    return { stored: existing, written: false }
  }

  await redis.set(BUNDLE_PREFIX + key, JSON.stringify(incoming))
  await redis.hset(INDEX_KEY, { [key]: JSON.stringify(indexEntryFrom(incoming)) })
  return { stored: incoming, written: true }
}

/** Project a bundle down to its lightweight index row. */
export function indexEntryFrom(bundle: SharedBundle): SharedIndexEntry {
  const aff = bundle.profile?.affiliation
  return {
    username: bundle.username,
    displayName: bundle.profile?.displayName ?? bundle.username,
    avatarUrl: bundle.profile?.avatarUrl ?? '',
    followers: bundle.profile?.metrics.followers ?? 0,
    postCount: bundle.posts.length,
    reportCount: bundle.reportHistory.length,
    gatheredAt: bundle.gatheredAt,
    affiliationBadgeUrl: aff?.badgeUrl ?? null,
    affiliationLabel: aff?.org?.name ?? aff?.description ?? null,
  }
}
