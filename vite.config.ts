import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig(({ mode }) => {
  // loadEnv with '' prefix reads ALL vars (incl. non-VITE_) from .env files so
  // the dev proxy can inject the server-side Venice key without exposing it to
  // the client bundle.
  const env = loadEnv(mode, process.cwd(), '')
  const veniceKey = env.VENICE_API_KEY

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
        // VeniceStats: when not using vercel dev, proxy API routes straight to
        // venicestats.com. With VITE_API_TARGET the catch-all /api rule below
        // forwards to vercel dev instead (which runs api/venicestats/proxy.ts).
        ...(process.env.VITE_API_TARGET
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
        // Serverless OAuth endpoints (api/x/oauth/*, api/x/proxy/*) don't run under
        // plain `vite`. Run them with `vercel dev` (default :3000) and start Vite
        // with VITE_API_TARGET=http://localhost:3000 so /api forwards there. When
        // the var is unset this proxy entry is inert and /api simply 404s in dev.
        ...(process.env.VITE_API_TARGET
          ? {
              '/api': {
                target: process.env.VITE_API_TARGET,
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
