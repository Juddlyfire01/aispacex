import { useMemo, useState } from 'react'
import { useX402 } from '../../hooks/use-x402'
import { X402_MIN_TOPUP_USD, X402_RECEIVER_WALLET } from '../../lib/x402/config'
import { transferUsdcToReceiver } from '../../lib/x402/usdc-transfer'
import { settleTopUp } from '../../lib/x402/balance-client'
import { usePurchaseCreditsUi } from '../../stores/purchase-credits-ui'
import { useX402Store } from '../../stores/x402-store'
import { toast } from '../../stores/toast-store'
import {
  Modal,
  modalGhostBtnClass,
  modalInputClass,
  modalPrimaryBtnClass,
} from '../ui/modal'
import { cn } from '../../lib/utils'

const PRESETS = [5, 25, 100, 250, 500] as const

/**
 * X-style Purchase credits modal: amount chips, custom amount, Continue to
 * payment → USDC transfer on Base → server verifies + credits balance.
 */
export function PurchaseCreditsModal() {
  const open = usePurchaseCreditsUi((s) => s.open)
  const closePurchase = usePurchaseCreditsUi((s) => s.closePurchase)
  const { address, status, authenticateAndLoad, applyTopUp, validSessionToken } =
    useX402()

  const minUsd = X402_MIN_TOPUP_USD
  const presets = useMemo(
    () => PRESETS.filter((p) => p >= minUsd),
    [minUsd],
  )
  const defaultAmount = presets.includes(25 as (typeof presets)[number])
    ? 25
    : (presets[0] ?? minUsd)

  const [amount, setAmount] = useState<number>(defaultAmount)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const connected = status === 'connected' && Boolean(address)
  const titleId = 'purchase-credits-title'
  const belowMin = !(amount >= minUsd)
  const canPay =
    connected && !busy && !belowMin && Boolean(X402_RECEIVER_WALLET) && Number.isFinite(amount)

  const handleClose = () => {
    if (busy) return
    setError(null)
    closePurchase()
  }

  const handlePurchase = async () => {
    if (!canPay || !address) return
    setBusy(true)
    setError(null)
    try {
      // Ensure we have a session token (SIWE) before settlement.
      let token = validSessionToken()
      if (!token) {
        const ok = await authenticateAndLoad()
        if (!ok) {
          setError('Sign in with your wallet to continue.')
          return
        }
        token = validSessionToken()
      }
      if (!token) {
        setError('Session expired — sign in again.')
        return
      }

      const { txHash } = await transferUsdcToReceiver(address, amount)
      toast.info('Confirming payment…', 'Verifying USDC transfer on Base.')

      const settled = await settleTopUp({
        address,
        sessionToken: token,
        txHash,
        amountUsd: amount,
      })
      applyTopUp(settled.amountCredited, settled.newBalance)
      // Belt-and-suspenders: mirror Redis total explicitly (leftover + credit).
      useX402Store.getState().setBalance(settled.newBalance)
      toast.success(`Added $${settled.amountCredited.toFixed(2)} credits`)
      closePurchase()
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Purchase failed'
      setError(msg)
      if (!msg.toLowerCase().includes('cancel')) {
        toast.error('Purchase failed', msg)
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal open={open} onClose={handleClose} aria-labelledby={titleId} className="max-w-md">
      <div className="mb-5">
        <h2 id={titleId} className="text-[17px] font-semibold text-[var(--color-text-primary)]">
          Purchase credits
        </h2>
        <p className="text-[13px] text-[var(--color-text-secondary)] mt-1">
          Add prepaid balance with USDC on Base. Purchased credits never expire.
        </p>
      </div>

      {!connected && (
        <p className="text-[13px] text-yellow-300/85 mb-3">
          Connect a wallet in Connections before purchasing.
        </p>
      )}

      <div className="rounded-lg border border-[var(--color-border-soft)] p-3.5 mb-4">
        <div className="flex flex-wrap gap-2">
          {presets.map((p) => {
            const active = amount === p
            return (
              <button
                key={p}
                type="button"
                disabled={busy}
                onClick={() => setAmount(p)}
                className={cn(
                  'rounded-full px-3 py-1.5 text-[13px] font-medium transition-colors',
                  active
                    ? 'bg-[var(--color-btn-primary-bg)] text-[var(--color-btn-primary-fg)]'
                    : 'bg-[var(--color-border-faint)] text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]',
                )}
              >
                ${p.toFixed(2)}
              </button>
            )
          })}
        </div>

        <label className="block mt-4">
          <span className="text-[10px] uppercase tracking-wide text-[var(--color-text-tertiary)]">
            Amount
          </span>
          <div className="relative mt-1">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-text-tertiary)]">
              $
            </span>
            <input
              type="number"
              min={minUsd}
              step="0.01"
              value={Number.isFinite(amount) ? amount : ''}
              disabled={busy}
              onChange={(e) => setAmount(Number(e.target.value))}
              className={cn(modalInputClass, 'pl-7 font-mono text-[15px]')}
            />
          </div>
        </label>
        {belowMin && (
          <p className="text-[12px] text-yellow-300/85 mt-1.5">
            Minimum top-up is ${minUsd.toFixed(2)}.
          </p>
        )}
      </div>

      <div className="min-h-[1.25rem]" aria-live="polite">
        {error && (
          <p role="alert" className="text-[12px] text-red-300 leading-snug mb-2">
            {error}
          </p>
        )}
      </div>

      <div className="flex justify-end gap-2">
        <button type="button" className={modalGhostBtnClass} disabled={busy} onClick={handleClose}>
          Cancel
        </button>
        <button
          type="button"
          className={modalPrimaryBtnClass}
          disabled={!canPay}
          aria-busy={busy || undefined}
          onClick={() => void handlePurchase()}
        >
          {busy ? '…' : 'Continue to payment →'}
        </button>
      </div>
    </Modal>
  )
}
