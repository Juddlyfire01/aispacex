import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { devApiPlugin } from './scripts/vite-api-plugin.mjs'

export default defineConfig(({ mode }) => {
  // loadEnv with '' prefix reads ALL vars (incl. non-VITE_) from .env files so
  // the dev proxy can inject the server-side Venice key without exposing it to
  // the client bundle.
  const env = loadEnv(mode, process.cwd(), '')
  const veniceKey = env.VENICE_API_KEY

  // Surface every .env var (incl. non-VITE_ secrets) to process.env so the
  // in-process API plugin's handlers can read VENICE_API_KEY, X_CLIENT_ID, etc.
  // just like they do under vercel dev / on Vercel. Prefer non-empty .env values
  // over empty shell placeholders so local secrets always win when present.
  for (const [k, v] of Object.entries(env)) {
    if (!v) continue
    if (!process.env[k]) process.env[k] = v
  }

  // API mode for `npm run dev`:
  //   inprocess (default) → run api/*.ts inside Vite (fast, no vercel dev)
  //   proxy               → forward /api to VITE_API_TARGET (legacy vercel dev)
  //   off                 → no /api (UI only); VeniceStats hits its host directly
  const rawApiTarget = process.env.VITE_API_TARGET ?? env.VITE_API_TARGET ?? ''
  const apiMode =
    rawApiTarget === 'off'
      ? 'off'
      : rawApiTarget && rawApiTarget !== 'inprocess'
        ? 'proxy'
        : 'inprocess'
  const apiTarget = apiMode === 'proxy' ? rawApiTarget : null

  return {
    plugins: [
      react(),
      tailwindcss(),
      // Serve api/*.ts in-process (replaces vercel dev) unless proxying/off.
      ...(apiMode === 'inprocess' ? [devApiPlugin()] : []),
    ],
    server: {
      proxy: {
        '/venice': {
          target: 'https://api.venice.ai',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/venice/, ''),
          // BYOK-only path: optional local VENICE_API_KEY inject for /venice.
          // Server-fronted mode uses /api/venice/proxy (in-process) instead.
          configure: (proxy) => {
            if (!veniceKey) return
            proxy.on('proxyReq', (proxyReq) => {
              proxyReq.setHeader('authorization', `Bearer ${veniceKey}`)
            })
          },
        },
        '/xapi': {
          target: 'https://api.x.com',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/xapi/, ''),
        },
        // VeniceStats: when the API is fully off, hit venicestats.com directly.
        // In-process/proxy modes handle /api/venicestats via the handler instead.
        ...(apiMode === 'off'
          ? {
              '/api/venicestats': {
                target: 'https://venicestats.com',
                changeOrigin: true,
                rewrite: (path) => path.replace(/^\/api\/venicestats\/proxy/, ''),
                configure: (proxy) => {
                  proxy.on('proxyReq', (proxyReq) => {
                    proxyReq.setHeader('accept-encoding', 'identity')
                    proxyReq.setHeader('accept', 'application/json')
                  })
                },
              },
            }
          : {}),
        // Legacy: forward /api/* to a separate vercel dev (VITE_API_TARGET=<url>).
        ...(apiTarget
          ? {
              '/api': {
                target: apiTarget,
                // Keep the browser Host (e.g. localhost:5173) so OAuth derives the
                // correct redirect_uri and sets cookies on the UI origin.
                changeOrigin: false,
                configure: (proxy) => {
                  // Avoid br/gzip pass-through bugs when vercel dev compresses
                  // API JSON — request and return plain text bodies.
                  proxy.on('proxyReq', (proxyReq) => {
                    proxyReq.setHeader('accept-encoding', 'identity')
                  })
                },
              },
            }
          : {}),
      },
    },
  }
})
