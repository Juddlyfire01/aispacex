import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import { createEncryptedStorage } from '../lib/encrypted-storage'
import {
  connectWallet,
  getConnectedAddress,
  ensureBaseChain,
  hasWallet,
  revokeWalletPermissions,
  getProvider,
} from '../lib/x402/wallet'
import { X402_ENABLED } from '../lib/x402/config'
import { fetchBalance, revokeSession } from '../lib/x402/balance-client'

/** A ledger row for the credits panel (mirrors Venice x402 TOP_UP/CHARGE/REFUND). */
export interface X402LedgerRow {
  id: string
  type: 'TOP_UP' | 'CHARGE' | 'REFUND'
  amountUsd: number
  balanceAfterUsd: number
  createdAt: string
  action?: string
}

/** Normalize a charge action to a rail target key (lowercase handle), or null. */
export function targetKeyFromAction(action?: string): string | null {
  if (!action) return null
  let a = action.trim().replace(/^@/, '').toLowerCase()
  if (!a) return null
  if (a.startsWith('report:')) a = a.slice('report:'.length)
  // Media / non-profile actions are not attributed to a rail target.
  if (a === 'image' || a === 'video' || a === 'music' || a === 'tts' || a === 'unassigned') {
    return null
  }
  return a || null
}

interface X402State {
  /** Connected wallet address (lowercased) or null. */
  address: string | null
  /** Connecting/connected status. */
  status: 'idle' | 'connecting' | 'connected' | 'error'
  /** Last connection error message. */
  error: string | null
  /** Spendable Xintel credit balance in USD (locally tracked; server is source of truth). */
  balanceUsd: number
  /** Recent ledger rows (newest first), capped. */
  ledger: X402LedgerRow[]
  /**
   * Lifetime credits charged per rail target (lowercase username). Persisted.
   * This is what the rail shows when a credits wallet is connected — NOT raw
   * API totalCost × margin.
   */
  chargedByTarget: Record<string, number>
  /** USD charged this page load (not persisted). */
  sessionChargedUsd: number
  /** Server session token (issued after SIWE). Persisted until Disconnect revoke. */
  sessionToken: string | null
  /** Legacy wall-clock expiry; null for revoke-based sessions. */
  sessionExpiresAt: number | null

  connect: (opts?: { forcePicker?: boolean }) => Promise<void>
  /**
   * Silent resume after refresh: eth_accounts → connected, refresh SIWE if needed.
   * `skipConnect` is used after accountsChanged when we already have a live address.
   */
  bootstrap: (opts?: { skipConnect?: boolean }) => Promise<void>
  refreshConnection: () => Promise<void>
  disconnect: () => Promise<void>
  /** Apply a top-up locally after a successful settlement.
   * Prefer passing `balanceAfterUsd` from the server so we replace rather than add. */
  applyTopUp: (amountUsd: number, balanceAfterUsd?: number) => void
  /** Apply a charge locally after a debit; returns false if insufficient.
   * Prefer passing `balanceAfterUsd` from the server so we replace rather than
   * subtract again after `setBalance(balanceAfterUsd)`. */
  applyCharge: (amountUsd: number, action?: string, balanceAfterUsd?: number) => boolean
  /** Set the authoritative balance (e.g. from a server balance read). */
  setBalance: (usd: number) => void
  /** Replace the ledger with the server's rows. */
  setLedger: (rows: X402LedgerRow[]) => void
  /** Credits charged for a rail target (paid-mode display). */
  chargedForTarget: (username: string) => number
  /** Store the session token from a balance read (`expiresAt` null = until Disconnect). */
  setSession: (token: string | null, expiresAt: number | null) => void
  /** A valid (non-expired) session token, or null. */
  validSessionToken: () => string | null
}

const LEDGER_CAP = 100

/**
 * Normalize a balance value. Values that look like raw micro-USD integers from
 * the brief getBalanceUsd bug (≥ 1e6 and integral) are converted to dollars.
 */
export function coerceBalanceUsd(usd: number): number {
  if (!Number.isFinite(usd) || usd < 0) return 0
  if (usd >= 1e6 && Number.isInteger(usd)) return usd / 1e6
  return usd
}

function newRowId(): string {
  try {
    return `x402_${crypto.randomUUID()}`
  } catch {
    return `x402_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
  }
}

let walletEventsBound = false

function bindWalletEvents(): void {
  if (walletEventsBound || typeof window === 'undefined') return
  const provider = getProvider()
  if (!provider?.on) return
  walletEventsBound = true

  provider.on('accountsChanged', (...args: unknown[]) => {
    const accounts = (args[0] as string[] | undefined) ?? []
    const store = useX402Store.getState()
    if (!accounts.length) {
      // Locked / disconnected in the extension — revoke server session, keep
      // last address for a later unlock/bootstrap without a full Connect click.
      const token = store.sessionToken
      if (token) void revokeSession(token)
      useX402Store.setState({
        status: 'idle',
        sessionToken: null,
        sessionExpiresAt: null,
        error: null,
      })
      return
    }
    const next = accounts[0]!.toLowerCase()
    if (next === store.address && store.status === 'connected') return
    // Account switch: revoke old session; need a fresh SIWE for the new address.
    const token = store.sessionToken
    if (token) void revokeSession(token)
    useX402Store.setState({
      address: next,
      status: 'connected',
      sessionToken: null,
      sessionExpiresAt: null,
      balanceUsd: 0,
      ledger: [],
      error: null,
    })
    void useX402Store.getState().bootstrap({ skipConnect: true })
  })

  provider.on('chainChanged', () => {
    void ensureBaseChain().catch(() => {
      /* user may reject switch — charge flow will surface it */
    })
  })
}

export const useX402Store = create<X402State>()(
  persist(
    (set, get) => ({
      address: null,
      status: 'idle',
      error: null,
      balanceUsd: 0,
      ledger: [],
      chargedByTarget: {},
      sessionChargedUsd: 0,
      sessionToken: null,
      sessionExpiresAt: null,

      connect: async (opts) => {
        if (!X402_ENABLED) {
          set({ error: 'x402 paid mode is not enabled.', status: 'error' })
          return
        }
        if (!hasWallet()) {
          set({ error: 'No Ethereum wallet found. Install a Base-compatible wallet.', status: 'error' })
          return
        }
        set({ status: 'connecting', error: null })
        try {
          // Force the account picker by default so users can choose which
          // wallet/account to connect (and switch away from a prior one).
          const address = await connectWallet({ forcePicker: opts?.forcePicker ?? true })
          await ensureBaseChain()
          bindWalletEvents()
          set({ address, status: 'connected', error: null })
        } catch (err) {
          set({
            status: 'error',
            error: err instanceof Error ? err.message : 'Wallet connection failed',
          })
        }
      },

      bootstrap: async (opts) => {
        if (!X402_ENABLED) return
        bindWalletEvents()

        // Drop legacy wall-clock-expired sessions only (revoke-based have null expiry).
        const { sessionToken, sessionExpiresAt } = get()
        if (
          sessionToken &&
          sessionExpiresAt != null &&
          Date.now() >= sessionExpiresAt
        ) {
          set({ sessionToken: null, sessionExpiresAt: null })
        }

        let address = await getConnectedAddress()
        if (!address && !opts?.skipConnect && get().address) {
          // Site was authorized before refresh — eth_requestAccounts without
          // forcePicker usually returns silently (no account picker).
          try {
            set({ status: 'connecting', error: null })
            address = await connectWallet({ forcePicker: false })
          } catch {
            set({ status: 'idle', error: null })
            return
          }
        }

        if (!address) {
          if (get().status === 'connecting') set({ status: 'idle' })
          return
        }

        try {
          await ensureBaseChain()
        } catch {
          // Stay connected; user can switch chain when they act.
        }

        set({ address, status: 'connected', error: null })

        // Only prompt SIWE when we have no session token (may prompt once).
        if (!get().validSessionToken()) {
          try {
            const res = await fetchBalance(address)
            if (res) {
              set({
                balanceUsd: coerceBalanceUsd(res.balanceUsd),
                sessionToken: res.sessionToken ?? null,
                sessionExpiresAt: res.sessionExpiresAt ?? null,
                ...(res.ledger ? { ledger: res.ledger.slice(0, LEDGER_CAP) } : {}),
              })
            }
          } catch {
            // User rejected sign — wallet stays connected; charges will ask again.
          }
        }
      },

      refreshConnection: async () => {
        if (!X402_ENABLED) return
        const address = await getConnectedAddress()
        if (address) {
          set({ address, status: 'connected' })
        } else if (get().address) {
          // Wallet locked or account revoked — keep the last address but mark idle.
          set({ status: 'idle' })
        }
      },

      disconnect: async () => {
        const token = get().sessionToken
        if (token) await revokeSession(token)
        // Revoke the site's wallet permission so the wallet fully forgets this
        // connection — otherwise the next connect silently reuses the same
        // account instead of showing the picker. Best-effort: clear local state
        // regardless of whether the wallet supports revocation.
        await revokeWalletPermissions()
        // Clear money state too — otherwise reconnect can show a stale balance
        // (or appear to "add" the server balance on top of the persisted one).
        set({
          address: null,
          status: 'idle',
          error: null,
          sessionToken: null,
          sessionExpiresAt: null,
          balanceUsd: 0,
          ledger: [],
          sessionChargedUsd: 0,
        })
      },

      applyTopUp: (amountUsd, balanceAfterUsd) => {
        if (!(amountUsd > 0) && balanceAfterUsd == null) return
        set((s) => {
          const balanceAfter =
            balanceAfterUsd != null && Number.isFinite(balanceAfterUsd)
              ? Math.max(0, balanceAfterUsd)
              : s.balanceUsd + Math.max(0, amountUsd)
          const row: X402LedgerRow = {
            id: newRowId(),
            type: 'TOP_UP',
            amountUsd: Math.max(0, amountUsd),
            balanceAfterUsd: balanceAfter,
            createdAt: new Date().toISOString(),
          }
          return { balanceUsd: balanceAfter, ledger: [row, ...s.ledger].slice(0, LEDGER_CAP) }
        })
      },

      applyCharge: (amountUsd, action, balanceAfterUsd) => {
        if (!(amountUsd > 0)) return true
        const { balanceUsd } = get()
        // When the server already returned balanceAfter, trust it — do not gate
        // on the (possibly stale) local balance.
        if (balanceAfterUsd == null && balanceUsd < amountUsd) return false
        const targetKey = targetKeyFromAction(action)
        set((s) => {
          const balanceAfter =
            balanceAfterUsd != null && Number.isFinite(balanceAfterUsd)
              ? coerceBalanceUsd(balanceAfterUsd)
              : Math.max(0, s.balanceUsd - amountUsd)
          const row: X402LedgerRow = {
            id: newRowId(),
            type: 'CHARGE',
            amountUsd: -amountUsd,
            balanceAfterUsd: balanceAfter,
            createdAt: new Date().toISOString(),
            action,
          }
          const chargedByTarget = targetKey
            ? {
                ...s.chargedByTarget,
                [targetKey]: (s.chargedByTarget[targetKey] ?? 0) + amountUsd,
              }
            : s.chargedByTarget
          return {
            balanceUsd: balanceAfter,
            sessionChargedUsd: s.sessionChargedUsd + amountUsd,
            chargedByTarget,
            ledger: [row, ...s.ledger].slice(0, LEDGER_CAP),
          }
        })
        return true
      },

      setBalance: (usd) => set({ balanceUsd: coerceBalanceUsd(usd) }),

      setLedger: (rows) => set({ ledger: rows.slice(0, LEDGER_CAP) }),

      chargedForTarget: (username) => {
        const key = username.trim().replace(/^@/, '').toLowerCase()
        return get().chargedByTarget[key] ?? 0
      },

      setSession: (token, expiresAt) =>
        set({ sessionToken: token, sessionExpiresAt: expiresAt }),

      validSessionToken: () => {
        const { sessionToken, sessionExpiresAt } = get()
        if (!sessionToken) return null
        // Legacy TTL sessions only — revoke-based sessions have null expiresAt.
        if (sessionExpiresAt != null && Date.now() >= sessionExpiresAt) return null
        return sessionToken
      },
    }),
    {
      name: 'x402-wallet',
      version: 6,
      storage: createJSONStorage(() => createEncryptedStorage()),
      // Persist address, balance, ledger, charged totals, and SIWE session until Disconnect.
      // status stays ephemeral and is restored by bootstrap() from eth_accounts.
      partialize: (s) => ({
        address: s.address,
        balanceUsd: s.balanceUsd,
        ledger: s.ledger,
        chargedByTarget: s.chargedByTarget,
        sessionToken: s.sessionToken,
        sessionExpiresAt: s.sessionExpiresAt,
      }),
      migrate: (persisted) => {
        const s = (persisted ?? {}) as Partial<X402State> & { paidMode?: boolean }
        const chargedByTarget = { ...(s.chargedByTarget ?? {}) }
        if (Object.keys(chargedByTarget).length === 0 && Array.isArray(s.ledger)) {
          for (const row of s.ledger) {
            if (row.type !== 'CHARGE') continue
            const key = targetKeyFromAction(row.action)
            if (!key) continue
            chargedByTarget[key] = (chargedByTarget[key] ?? 0) + Math.abs(row.amountUsd)
          }
        }
        const { paidMode: _removed, ...rest } = s
        // v6: Redis revoke sessions — drop legacy TTL tokens (force one re-SIWE).
        return {
          ...rest,
          chargedByTarget,
          balanceUsd: coerceBalanceUsd(s.balanceUsd ?? 0),
          sessionToken: null,
          sessionExpiresAt: null,
        }
      },
      onRehydrateStorage: () => (state) => {
        if (!state) return
        if (
          state.sessionToken &&
          state.sessionExpiresAt != null &&
          Date.now() >= state.sessionExpiresAt
        ) {
          state.sessionToken = null
          state.sessionExpiresAt = null
        }
      },
    },
  ),
)

/** Wait until the encrypted x402 store has rehydrated from IndexedDB. */
export function waitX402Hydrated(): Promise<void> {
  if (useX402Store.persist.hasHydrated()) return Promise.resolve()
  return new Promise((resolve) => {
    const unsub = useX402Store.persist.onFinishHydration(() => {
      unsub()
      resolve()
    })
  })
}
