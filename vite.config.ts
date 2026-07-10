import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig(({ mode }) => {
  // loadEnv with '' prefix reads ALL vars (incl. non-VITE_) from .env files so
  // the dev proxy can inject the server-side Venice key without exposing it to
  // the client bundle.
  const env = loadEnv(mode, process.cwd(), '')
  const veniceKey = env.VENICE_API_KEY
  // `npm run dev` runs Vite on :5173 and vercel dev on :3000. Vite proxies /api
  // here by default so OAuth + data stay on the 5173 origin. Override with
  // VITE_API_TARGET, or set "off" to disable (VeniceStats uses a direct proxy).
  const rawApiTarget = process.env.VITE_API_TARGET ?? env.VITE_API_TARGET ?? 'http://localhost:3000'
  const apiTarget = rawApiTarget === 'off' || rawApiTarget === '' ? null : rawApiTarget

  return {
    plugins: [react(), tailwindcss()],
    server: {
      proxy: {
        '/venice': {
          target: 'https://api.venice.ai',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/venice/, ''),
          // Front Venice in dev the same way prod does: inject the shared key
          // server-side so the browser never holds it. Only when configured —
          // otherwise the client's own Authorization header (BYOK) passes through.
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
        // VeniceStats: when not proxying /api to vercel dev, hit venicestats.com
        // directly. With apiTarget set, the catch-all /api rule below handles it.
        ...(apiTarget
          ? {}
          : {
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
            }),
        // Forward /api/* to vercel dev (OAuth, X session/proxy, news, etc.).
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
