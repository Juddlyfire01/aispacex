// Whether Venice inference is fronted by a shared, server-side key (the app
// owner pays for everyone) instead of each user bringing their own key.
//
// This is a CLIENT-visible boolean only — never the key itself. The real
// VENICE_API_KEY lives server-side and is injected by api/venice/proxy.ts
// (via vercel dev locally and Vercel Functions in prod), so it never reaches
// the browser bundle. When true: calls route through /api/venice/proxy with no
// client Authorization header, the "Connect API key" UI is hidden, and a
// sentinel key satisfies the existing availability gates. Flip to false (unset)
// to restore the bring-your-own-key flow.
export const VENICE_SERVER_FRONTED =
  (import.meta.env.VITE_VENICE_SERVER_FRONTED as string | undefined) === 'true'

// Sentinel stored as the "apiKey" when server-fronted so that every existing
// `!!apiKey` availability check keeps working without touching each view. It is
// never sent as a credential — the proxy layer supplies the real key.
export const VENICE_FRONTED_SENTINEL = 'server-fronted'
