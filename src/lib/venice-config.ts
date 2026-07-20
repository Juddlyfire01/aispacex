// Whether Venice inference is fronted by a shared, server-side key (the app
// owner pays for everyone) as the default. Users may still override with BYOK.
//
// This is a CLIENT-visible boolean only — never the key itself. The real
// VENICE_API_KEY lives server-side and is injected by api/venice/proxy.ts
// (via vercel dev locally and Vercel Functions in prod), so it never reaches
// the browser bundle. When true and the user has no personal key: calls route
// through /api/venice/proxy with no client Authorization header, and a
// sentinel satisfies availability gates. A user-supplied key overrides this
// (direct Venice / Vite /venice with Authorization). Flip to false (unset)
// to require BYOK with no app fallback.
export const VENICE_SERVER_FRONTED =
  (import.meta.env.VITE_VENICE_SERVER_FRONTED as string | undefined) === 'true'

// Sentinel stored as the "apiKey" when server-fronted so that every existing
// `!!apiKey` availability check keeps working without touching each view. It is
// never sent as a credential — the proxy layer supplies the real key.
export const VENICE_FRONTED_SENTINEL = 'server-fronted'

/** True when the stored value is a real user key (not missing, not the sentinel). */
export function isUserVeniceKey(key: string | null | undefined): boolean {
  return Boolean(key && key !== VENICE_FRONTED_SENTINEL)
}

/** Direct BYOK base URL (never the server proxy) — for validate-before-save and overrides. */
export function byokVeniceBaseUrl(): string {
  const envBase = (import.meta.env.VITE_VENICE_BASE_URL as string | undefined)?.replace(/\/$/, '')
  if (envBase) return envBase
  return import.meta.env.DEV ? '/venice/api/v1' : 'https://api.venice.ai/api/v1'
}
