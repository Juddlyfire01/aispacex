import { toast } from '../../stores/toast-store'
import { useSettingsStore } from '../../stores/settings-store'

/** Toast + deep-link to Billing when paid mode is on but wallet/session isn't ready. */
export function notifyPaidNotReady(reason: 'needs_wallet' | 'needs_session'): void {
  const openBilling = () => useSettingsStore.getState().openSettings('billing')
  if (reason === 'needs_wallet') {
    toast.error(
      'Wallet required',
      'Connect a wallet to use paid mode — actions are blocked until then.',
      { label: 'Connect', onClick: openBilling },
    )
    return
  }
  toast.error(
    'Sign in required',
    'Sign in with your wallet to use credits — actions are blocked until then.',
    { label: 'Sign in', onClick: openBilling },
  )
}
