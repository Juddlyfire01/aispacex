import { byokVeniceBaseUrl } from './venice-config'

export type VeniceKeyValidation =
  | { ok: true }
  | { ok: false; message: string }

// NOTE: /models is a PUBLIC endpoint — it returns 200 even for a bogus key or
// no key at all, so it cannot be used to validate. /api_keys/rate_limits is
// auth-gated: 200 for a valid key, 401 for an invalid one.
// Always hit the BYOK base (never the app proxy), so validation tests the
// user's key even when VITE_VENICE_SERVER_FRONTED is on.
export async function validateVeniceKey(key: string): Promise<VeniceKeyValidation> {
  try {
    const res = await fetch(`${byokVeniceBaseUrl()}/api_keys/rate_limits`, {
      headers: { Authorization: `Bearer ${key}` },
    })
    if (res.ok) return { ok: true }
    if (res.status === 401) return { ok: false, message: 'Invalid API key' }
    return { ok: false, message: `Venice returned ${res.status}` }
  } catch {
    return { ok: false, message: 'Could not reach Venice' }
  }
}
