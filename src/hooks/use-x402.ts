import { useCallback } from 'react'
import { useX402Store } from '../stores/x402-store'
import { fetchBalance, fetchTopUpInfo, type TopUpInfoResponse } from '../lib/x402/balance-client'
import { X402_ENABLED } from '../lib/x402/config'

/**
 * React surface for x402 paid mode: exposes connection state, balance, ledger,
 * and imperative actions (connect wallet, authenticate + load balance, refresh
 * top-up info). Wraps the store + balance client so components stay declarative.
 */
export function useX402() {
  const address = useX402Store((s) => s.address)
  const status = useX402Store((s) => s.status)
  const error = useX402Store((s) => s.error)
  const balanceUsd = useX402Store((s) => s.balanceUsd)
  const ledger = useX402Store((s) => s.ledger)
  const connect = useX402Store((s) => s.connect)
  const disconnect = useX402Store((s) => s.disconnect)
  const setBalance = useX402Store((s) => s.setBalance)
  const setLedger = useX402Store((s) => s.setLedger)
  const setSession = useX402Store((s) => s.setSession)
  const applyTopUp = useX402Store((s) => s.applyTopUp)
  const validSessionToken = useX402Store((s) => s.validSessionToken)

  /**
   * Authenticate the connected wallet (one SIWE sign) and pull the
   * authoritative balance + ledger + session token from the server. Returns
   * true on success, false when unauthenticated / endpoint absent.
   */
  const authenticateAndLoad = useCallback(async (): Promise<boolean> => {
    const addr = useX402Store.getState().address
    if (!addr) return false
    const res = await fetchBalance(addr)
    if (!res) return false
    // Server is source of truth — always replace, never add to local balance.
    setBalance(res.balanceUsd)
    setSession(res.sessionToken ?? null, res.sessionExpiresAt ?? null)
    if (res.ledger) setLedger(res.ledger)
    return true
  }, [setBalance, setLedger, setSession])

  const loadTopUpInfo = useCallback(async (): Promise<TopUpInfoResponse | null> => {
    return fetchTopUpInfo()
  }, [])

  return {
    enabled: X402_ENABLED,
    address,
    status,
    error,
    balanceUsd,
    ledger,
    connect,
    disconnect,
    authenticateAndLoad,
    loadTopUpInfo,
    applyTopUp,
    validSessionToken,
    setBalance,
  }
}
