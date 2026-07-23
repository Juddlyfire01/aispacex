import { toast } from '../../stores/toast-store'
import { useSettingsStore } from '../../stores/settings-store'
import { X402_DISABLE_FREE } from './config'

/** Collapse StrictMode / dual-bootstrap double-fires into one toast. */
const DEDUPE_MS = 2500
let lastNotifyAt = 0
let lastNotifyReason: 'needs_wallet' | 'needs_session' | null = null

/** Toast + deep-link to Billing when paid mode is on but wallet/session isn't ready. */
export function notifyPaidNotReady(reason: 'needs_wallet' | 'needs_session'): void {
  const now = Date.now()
  if (reason === lastNotifyReason && now - lastNotifyAt < DEDUPE_MS) return
  lastNotifyReason = reason
  lastNotifyAt = now

  const openBilling = () => useSettingsStore.getState().openSettings('billing')
  if (reason === 'needs_wallet') {
    if (X402_DISABLE_FREE) {
      toast.error(
        'Wallet required',
        'Free mode is off — connect a wallet and sign in to use credits (or connect X + your Venice key for BYOK).',
        { label: 'Billing', onClick: openBilling },
      )
      return
    }
    toast.error(
      'Wallet required',
      'Connect a wallet to use paid mode — actions are blocked until then.',
      { label: 'Connect', onClick: openBilling },
    )
    return
  }
  toast.error(
    'Sign in required',
    'Sign in with your wallet to use credits. Session stays active until you Disconnect.',
    { label: 'Sign in', onClick: openBilling },
  )
}

/** Test-only: reset dedupe so consecutive asserts in one file stay independent. */
export function resetPaidNotReadyDedupe(): void {
  lastNotifyAt = 0
  lastNotifyReason = null
}
