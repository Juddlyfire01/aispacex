// GET /api/intel/list
// Returns the lightweight shared-profile index (browse list + type-ahead
// source). No auth: the shared library holds only public X data. Degrades to an
// empty list with a `configured:false` flag when no KV store is provisioned, so
// the client can silently skip the shared-library UI in that environment.
//
// Named `list` (not `index`) so it resolves to the same path — /api/intel/list —
// under both the in-process dev plugin (scripts/vite-api-plugin.mjs maps
// /api/intel/list → api/intel/list.ts) and Vercel. An `index.ts` would serve at
// /api/intel on Vercel but /api/intel/index in dev, diverging the two.
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { intelKvConfigured, readIndex } from '../_lib/intel-kv.js'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'method_not_allowed' })

  if (!intelKvConfigured()) {
    res.setHeader('cache-control', 'no-store')
    return res.status(200).json({ configured: false, entries: [] })
  }

  try {
    const entries = await readIndex()
    // Short shared cache: index changes as users gather, but staleness is cheap.
    res.setHeader('cache-control', 's-maxage=30, stale-while-revalidate=30')
    return res.status(200).json({ configured: true, entries })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'index_read_failed'
    return res.status(502).json({ error: 'intel_index_failed', message })
  }
}
