import { usePurchaseCreditsUi } from '../../stores/purchase-credits-ui'
import { modalPrimaryBtnClass } from '../ui/modal'

function fmtUsd(n: number): string {
  return `$${n.toFixed(n < 1 && n > 0 ? 4 : 2)}`
}

/** Remaining balance hero + Purchase credits CTA (Settings Billing → Credits). */
export function CreditsBalanceCard({
  balanceUsd,
  disabled,
}: {
  balanceUsd: number
  disabled?: boolean
}) {
  const openPurchase = usePurchaseCreditsUi((s) => s.openPurchase)

  return (
    <div className="rounded-lg border border-[var(--color-border-soft)] p-4 flex items-center justify-between gap-4">
      <div>
        <p className="text-[12px] text-[var(--color-text-tertiary)]">Remaining balance</p>
        <p className="mt-1 font-mono text-[28px] tabular-nums text-[var(--color-text-primary)] leading-none">
          {fmtUsd(balanceUsd)}
        </p>
      </div>
      <button
        type="button"
        className={`${modalPrimaryBtnClass} text-[13px] shrink-0`}
        disabled={disabled}
        onClick={openPurchase}
      >
        Purchase credits
      </button>
    </div>
  )
}
