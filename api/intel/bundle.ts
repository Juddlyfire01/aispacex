// /api/intel/bundle?username=<handle>
//   GET  → one shared bundle (profile + posts + edges + reports), or 404.
//   PUT  → upsert a bundle (last-write-wins on gatheredAt). Body is the bundle.
//
// Query-param keyed (not a dynamic [username] route) so it works identically
// under the in-process dev plugin (scripts/vite-api-plugin.mjs, which maps
// /api/x/y → api/x/y.ts and does not resolve dynamic path segments) and on
// Vercel — no vercel.json rewrite needed.
//
// No auth: the shared library is public X data by construction. Writes are size-
// capped and shape-validated to keep the store honest.
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { intelKvConfigured, readBundle, writeBundle } from '../_lib/intel-kv.js'
import { SHARED_BUNDLE_VERSION, sharedKey } from '../../src/lib/x-intel/shared-types.js'
import type { SharedBundle } from '../../src/lib/x-intel/shared-types.js'

export const config = { api: { bodyParser: false } }

// Guard rail: a fat profile with full reports is well under this; anything over
// is almost certainly abuse or a bug.
const MAX_BODY_BYTES = 5_000_000

function firstQuery(v: string | string[] | undefined): string {
  if (Array.isArray(v)) return v[0] ?? ''
  return v ?? ''
}

async function readRawBody(req: VercelRequest): Promise<Buffer> {
  const chunks: Buffer[] = []
  let total = 0
  for await (const chunk of req) {
    const buf = chunk as Buffer
    total += buf.length
    if (total > MAX_BODY_BYTES) throw new Error('payload_too_large')
    chunks.push(buf)
  }
  return Buffer.concat(chunks)
}

/** Minimal structural validation of an incoming bundle. Throws on bad shape. */
function validateBundle(raw: unknown, username: string): SharedBundle {
  if (!raw || typeof raw !== 'object') throw new Error('bundle_not_object')
  const b = raw as Partial<SharedBundle>
  if (!Array.isArray(b.posts)) throw new Error('bundle_posts_invalid')
  if (!Array.isArray(b.edges)) throw new Error('bundle_edges_invalid')
  if (!Array.isArray(b.reportHistory)) throw new Error('bundle_reports_invalid')
  if (typeof b.gatheredAt !== 'string' || !b.gatheredAt) throw new Error('bundle_gatheredAt_invalid')
  return {
    v: typeof b.v === 'number' ? b.v : SHARED_BUNDLE_VERSION,
    username,
    profile: b.profile ?? null,
    posts: b.posts,
    edges: b.edges,
    reportHistory: b.reportHistory,
    gatheredAt: b.gatheredAt,
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const username = firstQuery(req.query.username).trim().replace(/^@/, '')
  if (!username) return res.status(400).json({ error: 'missing_username' })

  if (!intelKvConfigured()) {
    return res.status(503).json({ error: 'intel_kv_not_configured' })
  }

  if (req.method === 'GET') {
    try {
      const bundle = await readBundle(username)
      if (!bundle) return res.status(404).json({ error: 'not_found' })
      res.setHeader('cache-control', 'no-store')
      return res.status(200).json(bundle)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'read_failed'
      return res.status(502).json({ error: 'intel_bundle_read_failed', message })
    }
  }

  if (req.method === 'PUT') {
    let bundle: SharedBundle
    try {
      const raw = await readRawBody(req)
      const parsed = JSON.parse(raw.toString('utf8')) as unknown
      bundle = validateBundle(parsed, username)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'invalid_body'
      const status = message === 'payload_too_large' ? 413 : 400
      return res.status(status).json({ error: 'invalid_bundle', message })
    }

    try {
      const { written } = await writeBundle(bundle)
      // Key parity check is implicit: writeBundle re-derives the key from username.
      void sharedKey(username)
      return res.status(200).json({ ok: true, written, username })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'write_failed'
      return res.status(502).json({ error: 'intel_bundle_write_failed', message })
    }
  }

  return res.status(405).json({ error: 'method_not_allowed' })
}
