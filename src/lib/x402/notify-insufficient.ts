import { toast } from '../../stores/toast-store'
import { usePurchaseCreditsUi } from '../../stores/purchase-credits-ui'
import type { ChargeResult } from './charge-flow'

/** Toast + open Purchase modal when a paid action hits insufficient funds. */
export function notifyInsufficientFunds(charge: ChargeResult): void {
  toast.error(
    'Insufficient credits',
    `Need $${(charge.chargedUsd ?? 0).toFixed(4)} — purchase credits to continue.`,
    {
      label: 'Purchase',
      onClick: () => usePurchaseCreditsUi.getState().openPurchase(),
    },
  )
  usePurchaseCreditsUi.getState().openPurchase()
}
