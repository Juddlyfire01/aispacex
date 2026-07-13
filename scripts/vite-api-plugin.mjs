/**
 * In-process Vite plugin that serves the `api/*.ts` serverless functions on the
 * same dev server as the UI — replacing `vercel dev`.
 *
 * Why: `vercel dev` cold-starts and recompiles each function per request, which
 * made every /api-touching click in `npm run dev` crawl. This runs the exact
 * same handlers inside Vite via ssrLoadModule (real HMR, no cold starts), so dev
 * feels like preview/production.
 *
 * It replicates the pieces of the Vercel runtime our handlers actually use:
 *   - vercel.json rewrites: /api/x/proxy/<p> → /api/x/proxy?path=<p>, etc.
 *   - req.query (query string + rewritten :path, arrays for repeats)
 *   - req.body (JSON parsed) unless the handler exports config.api.bodyParser=false,
 *     in which case the raw request stream is left intact for `for await (chunk)`
 *   - res.status().json()/send()/end()/setHeader() chaining
 *   - multi-value Set-Cookie headers
 */
import { readFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import path from 'node:path'
import process from 'node:process'

// Mirror of vercel.json "rewrites" (the /api ones). Order matters.
const REWRITES = [
  { re: /^\/api\/x\/proxy\/(.*)$/, to: (m) => ({ file: 'api/x/proxy', path: m[1] }) },
  { re: /^\/api\/x\/demo\/(.*)$/, to: (m) => ({ file: 'api/x/demo', path: m[1] }) },
  { re: /^\/api\/venice\/proxy\/(.*)$/, to: (m) => ({ file: 'api/venice/proxy', path: m[1] }) },
  { re: /^\/api\/venicestats\/proxy\/(.*)$/, to: (m) => ({ file: 'api/venicestats/proxy', path: m[1] }) },
]

/** Resolve a request pathname to a handler file (relative, no extension) + injected path param. */
function resolveHandler(pathname) {
  for (const { re, to } of REWRITES) {
    const m = pathname.match(re)
    if (m) return to(m)
  }
  // Direct file mapping: /api/x/session → api/x/session(.ts)
  const rel = pathname.replace(/^\/+/, '').replace(/\/+$/, '')
  return { file: rel, path: undefined }
}

/** Build a Vercel-style req.query: string | string[] per key, plus injected path. */
function buildQuery(searchParams, injectedPath) {
  const query = {}
  for (const key of searchParams.keys()) {
    const all = searchParams.getAll(key)
    query[key] = all.length > 1 ? all : all[0]
  }
  if (injectedPath !== undefined) query.path = injectedPath
  return query
}

async function readRawBody(req) {
  const chunks = []
  for await (const chunk of req) chunks.push(chunk)
  return Buffer.concat(chunks)
}

/** Decorate the Node res with the Vercel helpers handlers expect. */
function decorateRes(res) {
  res.status = (code) => {
    res.statusCode = code
    return res
  }
  res.json = (body) => {
    if (!res.getHeader('content-type')) res.setHeader('content-type', 'application/json; charset=utf-8')
    res.end(JSON.stringify(body))
    return res
  }
  res.send = (body) => {
    if (body == null) return res.end()
    if (Buffer.isBuffer(body) || typeof body === 'string') return res.end(body)
    if (!res.getHeader('content-type')) res.setHeader('content-type', 'application/json; charset=utf-8')
    return res.end(JSON.stringify(body))
  }
  return res
}

export function devApiPlugin() {
  return {
    name: 'aispacex-dev-api',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const url = new URL(req.url, 'http://localhost')
        if (!url.pathname.startsWith('/api/')) return next()

        const { file, path: injectedPath } = resolveHandler(url.pathname)

        // Find the on-disk handler (.ts preferred, then .js/.mjs).
        const root = process.cwd()
        const candidates = ['.ts', '.js', '.mjs'].map((ext) => path.join(root, `${file}${ext}`))
        const abs = candidates.find((c) => existsSync(c))
        if (!abs) {
          res.statusCode = 404
          res.setHeader('content-type', 'application/json')
          res.end(JSON.stringify({ error: 'api_route_not_found', route: url.pathname }))
          return
        }

        try {
          const mod = await server.ssrLoadModule(abs)
          const handler = mod.default
          if (typeof handler !== 'function') {
            res.statusCode = 500
            res.end(JSON.stringify({ error: 'api_handler_missing_default_export', route: url.pathname }))
            return
          }

          const bodyParserOff = mod.config?.api?.bodyParser === false

          req.query = buildQuery(url.searchParams, injectedPath)

          // Only pre-read + parse the body for handlers that expect req.body.
          // bodyParser:false handlers stream the raw request themselves.
          if (!bodyParserOff && req.method !== 'GET' && req.method !== 'HEAD') {
            const raw = await readRawBody(req)
            const ct = String(req.headers['content-type'] ?? '')
            if (ct.includes('application/json')) {
              const text = raw.toString('utf8')
              req.body = text ? JSON.parse(text) : {}
            } else if (ct.includes('application/x-www-form-urlencoded')) {
              req.body = Object.fromEntries(new URLSearchParams(raw.toString('utf8')))
            } else {
              req.body = raw
            }
          }

          decorateRes(res)
          await handler(req, res)
        } catch (err) {
          server.ssrFixStacktrace?.(err)
          console.error(`[dev-api] ${url.pathname} failed:`, err)
          if (!res.headersSent) {
            res.statusCode = 500
            res.setHeader('content-type', 'application/json')
            res.end(JSON.stringify({ error: 'api_handler_error', message: err instanceof Error ? err.message : String(err) }))
          } else {
            res.end()
          }
        }
      })
    },
  }
}

// Load .env files into process.env so handlers see VENICE_API_KEY, X_CLIENT_ID, etc.
export async function loadDotEnv() {
  const root = process.cwd()
  for (const name of ['.env.local', '.env']) {
    const file = path.join(root, name)
    if (!existsSync(file)) continue
    const text = await readFile(file, 'utf8')
    for (const line of text.split('\n')) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('#')) continue
      const eq = trimmed.indexOf('=')
      if (eq === -1) continue
      const key = trimmed.slice(0, eq).trim()
      let val = trimmed.slice(eq + 1).trim()
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1)
      }
      if (!(key in process.env)) process.env[key] = val
    }
  }
}
