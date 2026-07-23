// Client charge-flow orchestrator for paid (x402) mode.
//
//   PRE-AUTH  → estimate charged price (preview) before an action runs.
//   EXECUTE   → the action runs; existing meters record RAW cost per line item
//               into the unified cost ledger (worst-case "others" rates, or
//               dedup-aware units when VITE_X402_PASS_X_DEDUP is on), grouped
//               under a logical `action`.
//   RECONCILE → after the action, sum the raw entries recorded for this action.
//   DEBIT     → POST the reconciled rawUsd to /api/x402/charge; the server
//               applies the single margin multiplier and debits the balance.
//
// Owned-Read savings stay in margin (self still metered at "others" rates).
// X daily dedup is passed through only when VITE_X402_PASS_X_DEDUP=true.
//
// When x402 is disabled or the user is not in paid mode, chargeAction is a
// no-op that returns { charged: false } so callers can stay agnostic.

import { useCostLedgerStore } from '../../stores/cost-ledger-store'
import { useX402Store } from '../../stores/x402-store'
import { useAuthStore } from '../../stores/auth-store'
import { useXSelfStore } from '../../stores/x-self-store'
import { isUserVeniceKey } from '../venice-config'
import { X402_DISABLE_FREE, X402_ENABLED } from './config'
import { chargedPrice } from './pricing'
import { notifyPaidNotReady } from './notify-paid-not-ready'
import type { CostEntry } from '../cost/ledger'

export interface ChargeResult {
  charged: boolean
  rawUsd: number
  chargedUsd: number
  balanceAfterUsd?: number
  /** Set when the debit failed for lack of funds. */
  insufficient?: boolean
  error?: string
}

/** Paid-mode readiness for gating billable actions. */
export type PaidReadiness = 'off' | 'ready' | 'needs_wallet' | 'needs_session'

/** Thrown when paid mode is on but wallet/session is not ready. */
export class PaidNotReadyError extends Error {
  readonly reason: 'needs_wallet' | 'needs_session'
  constructor(reason: 'needs_wallet' | 'needs_session') {
    super(
      reason === 'needs_wallet'
        ? 'Paid mode requires a connected wallet'
        : 'Paid mode requires a wallet sign-in',
    )
    this.name = 'PaidNotReadyError'
    this.reason = reason
  }
}

/**
 * Resolve whether credits debiting is inactive (Free/BYOK), ready, or blocked
 * pending SIWE. Wallet connected ⇒ paid path; no wallet ⇒ Free (`off`).
 * There is no separate paid-mode toggle.
 */
export function getPaidReadiness(): PaidReadiness {
  if (!X402_ENABLED) return 'off'
  const s = useX402Store.getState()
  // Not connected → Free / BYOK (feature may still be available in the UI).
  if (!s.address || s.status !== 'connected') return 'off'
  // Connected but no SIWE session yet → block Free fallback; prompt sign-in.
  if (!s.validSessionToken()) return 'needs_session'
  return 'ready'
}

/** True when the user has a personal Venice key (BYOK). */
function hasVeniceByok(): boolean {
  return isUserVeniceKey(useAuthStore.getState().apiKey)
}

/** True when X OAuth is connected (user's own X credentials, not app bearer). */
function hasXByok(): boolean {
  return useXSelfStore.getState().connected === true
}

/**
 * True when a wallet is connected for credits UI (CostMeter, rail, etc.).
 * Broader than `isPaidModeActive` — does not require a SIWE session yet.
 */
export function isCreditsWalletConnected(): boolean {
  if (!X402_ENABLED) return false
  const s = useX402Store.getState()
  return s.status === 'connected' && Boolean(s.address)
}

/**
 * Credits chrome phase — same truth as the action gate for the wallet rail.
 * - ready: wallet + valid SIWE (can charge)
 * - needs_session: wallet linked, must sign in
 * - disconnected: no wallet
 */
export type CreditsUiPhase = 'ready' | 'needs_session' | 'disconnected'

export function getCreditsUiPhase(): CreditsUiPhase {
  const readiness = getPaidReadiness()
  if (readiness === 'ready') return 'ready'
  if (readiness === 'needs_session') return 'needs_session'
  return 'disconnected'
}

export type PaidGateRail = 'shared' | 'venice'

/**
 * Gate billable work:
 * - Connected wallet without SIWE → block (needs_session).
 * - X402_DISABLE_FREE + not paid:
 *     - rail `venice` (media): allow with Venice BYOK
 *     - rail `shared` (Intel/X): allow only with Venice BYOK **and** X OAuth
 *       (otherwise app bearer / fronted Free still runs)
 * - Otherwise Free allowed.
 */
export function assertPaidReady(opts?: { silent?: boolean; rail?: PaidGateRail }): void {
  const readiness = getPaidReadiness()
  if (readiness === 'ready') return
  if (readiness === 'needs_session') {
    if (!opts?.silent) notifyPaidNotReady('needs_session')
    throw new PaidNotReadyError('needs_session')
  }
  // readiness === 'off'
  if (!X402_DISABLE_FREE) return

  const rail = opts?.rail ?? 'shared'
  if (rail === 'venice' && hasVeniceByok()) return
  if (rail === 'shared' && hasVeniceByok() && hasXByok()) return

  if (!opts?.silent) notifyPaidNotReady('needs_wallet')
  throw new PaidNotReadyError('needs_wallet')
}

/**
 * Gate billable work without throwing. Returns false (and toasts unless silent)
 * when blocked; true when Free (allowed), BYOK, or paid-ready.
 */
export function ensurePaidReady(opts?: { silent?: boolean; rail?: PaidGateRail }): boolean {
  try {
    assertPaidReady(opts)
    return true
  } catch (e) {
    if (e instanceof PaidNotReadyError) return false
    throw e
  }
}

/** Sum raw USD of ledger entries recorded for a given action. */
export function rawCostForAction(action: string, sinceTs?: number): number {
  const entries = useCostLedgerStore.getState().entries
  return entries.reduce((acc, e: CostEntry) => {
    if (e.action !== action) return acc
    if (sinceTs != null && e.ts < sinceTs) return acc
    return acc + e.rawUsd
  }, 0)
}

/** Raw USD for an action split by provider (feeds server-side reconciliation). */
export function rawByProviderForAction(
  action: string,
  sinceTs?: number,
): { venice: number; x: number } {
  const entries = useCostLedgerStore.getState().entries
  const split = { venice: 0, x: 0 }
  for (const e of entries) {
    if (e.action !== action) continue
    if (sinceTs != null && e.ts < sinceTs) continue
    split[e.provider] += e.rawUsd
  }
  return split
}

/** True when paid mode is on and ready to debit (wallet + session). */
export function isPaidModeActive(): boolean {
  return getPaidReadiness() === 'ready'
}

/**
 * Reconcile + debit for a completed action. Pass the timestamp captured just
 * before the action ran so only that action's fresh entries are counted.
 * No-ops (charged:false) when paid mode is off. When paid mode is on but the
 * wallet/session is missing, returns an error — callers should have gated via
 * ensurePaidReady() before doing billable work.
 */
export async function chargeAction(
  action: string,
  opts: { sinceTs?: number; requestId?: string } = {},
): Promise<ChargeResult> {
  const rawUsd = rawCostForAction(action, opts.sinceTs)
  const readiness = getPaidReadiness()

  if (readiness === 'off') {
    return { charged: false, rawUsd, chargedUsd: chargedPrice(rawUsd) }
  }
  if (readiness !== 'ready') {
    return {
      charged: false,
      rawUsd,
      chargedUsd: chargedPrice(rawUsd),
      error: readiness,
    }
  }
  if (!(rawUsd > 0)) {
    return { charged: true, rawUsd: 0, chargedUsd: 0 }
  }

  const store = useX402Store.getState()
  const token = store.validSessionToken()
  if (!token) {
    return {
      charged: false,
      rawUsd,
      chargedUsd: chargedPrice(rawUsd),
      error: 'session_expired',
    }
  }

  const rawByProvider = rawByProviderForAction(action, opts.sinceTs)

  try {
    const res = await fetch('/api/x402/charge', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        sessionToken: token,
        rawUsd,
        action,
        requestId: opts.requestId,
        rawByProvider,
      }),
    })
    const data = (await res.json()) as {
      ok?: boolean
      chargedUsd?: number
      balanceAfterUsd?: number
      balanceUsd?: number
      error?: string
    }

    if (res.status === 402 || data.error === 'insufficient_funds') {
      if (data.balanceUsd != null) store.setBalance(data.balanceUsd)
      return {
        charged: false,
        rawUsd,
        chargedUsd: data.chargedUsd ?? chargedPrice(rawUsd),
        balanceAfterUsd: data.balanceUsd,
        insufficient: true,
        error: 'insufficient_funds',
      }
    }
    if (!res.ok || !data.ok) {
      return {
        charged: false,
        rawUsd,
        chargedUsd: chargedPrice(rawUsd),
        error: data.error ?? `charge_failed_${res.status}`,
      }
    }

    // Mirror the debit into the local balance + ledger for immediate UI.
    // Pass server balanceAfter so applyCharge replaces — never setBalance then
    // subtract again (that double-debits the footer Balance).
    const charged = data.chargedUsd ?? chargedPrice(rawUsd)
    store.applyCharge(charged, action, data.balanceAfterUsd)
    return {
      charged: true,
      rawUsd,
      chargedUsd: charged,
      balanceAfterUsd: data.balanceAfterUsd,
    }
  } catch (err) {
    return {
      charged: false,
      rawUsd,
      chargedUsd: chargedPrice(rawUsd),
      error: err instanceof Error ? err.message : 'charge_error',
    }
  }
}

/**
 * PRE-AUTH helper: estimate the charged price for a projected raw cost so the UI
 * can show "this will cost ~$X" before the user commits. Returns 0 when paid
 * mode is inactive.
 */
export function previewChargedUsd(projectedRawUsd: number): number {
  if (!isPaidModeActive()) return 0
  return chargedPrice(projectedRawUsd)
}

/** Capture a timestamp to scope a subsequent chargeAction to fresh entries. */
export function markActionStart(): number {
  return Date.now()
}

/**
 * Run an action and, when paid mode is active, debit the reconciled raw cost
 * afterward. When paid mode is off this is a transparent pass-through.
 * On insufficient funds, invokes `onInsufficient` if provided.
 */
export async function runPaidAction<T>(
  action: string,
  fn: () => Promise<T>,
  opts?: {
    onInsufficient?: (result: ChargeResult) => void
    requestId?: string
  },
): Promise<{ result: T; charge: ChargeResult }> {
  assertPaidReady()
  const sinceTs = markActionStart()
  const result = await fn()
  const charge = await chargeAction(action, { sinceTs, requestId: opts?.requestId })
  if (charge.insufficient) opts?.onInsufficient?.(charge)
  return { result, charge }
}
