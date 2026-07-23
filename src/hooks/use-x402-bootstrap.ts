import { useEffect } from 'react'
import { useX402Store, waitX402Hydrated } from '../stores/x402-store'
import { X402_ENABLED } from '../lib/x402/config'

/**
 * On app load: rehydrate the persisted wallet address + SIWE session, then
 * silently resume via eth_accounts (no account picker). Session stays valid
 * until Disconnect (server revoke).
 */
export function useX402Bootstrap() {
  useEffect(() => {
    if (!X402_ENABLED) return
    let cancelled = false
    void (async () => {
      await waitX402Hydrated()
      if (cancelled) return
      await useX402Store.getState().bootstrap()
    })()
    return () => {
      cancelled = true
    }
  }, [])
}
