import { useEffect, useState } from 'react'
import { useX402 } from '../../hooks/use-x402'
import { hasWallet } from '../../lib/x402/wallet'
import { X402_ENABLED, X402_MARGIN } from '../../lib/x402/config'
import { CreditsBalanceCard } from '../x402/credits-balance-card'
import { PaymentsLedger } from '../x402/payments-ledger'
import { modalSecondaryBtnClass } from '../ui/modal'
import { StatusDot } from '../ui/shared'
import { cn } from '../../lib/utils'

type BillingTab = 'credits' | 'payments'

function short(addr: string): string {
  return addr.length > 12 ? `${addr.slice(0, 6)}…${addr.slice(-4)}` : addr
}

/**
 * Settings → Billing: Credits (balance + purchase + wallet) and Payments (ledger).
 * Only meaningful when X402_ENABLED; Settings nav gates the category.
 * Wallet connected = paid billing; disconnected = Free / BYOK.
 */
export function BillingSection({ initialTab = 'credits' }: { initialTab?: BillingTab }) {
  const {
    address,
    status,
    balanceUsd,
    ledger,
    connect,
    disconnect,
    authenticateAndLoad,
  } = useX402()

  const [tab, setTab] = useState<BillingTab>(initialTab)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const connected = status === 'connected' && Boolean(address)
  const walletPresent = hasWallet()

  useEffect(() => {
    setTab(initialTab)
  }, [initialTab])

  if (!X402_ENABLED) {
    return (
      <p className="text-[13px] text-[var(--color-text-tertiary)]">
        Credits are not enabled in this build.
      </p>
    )
  }

  const handleConnect = async () => {
    setBusy(true)
    setErr(null)
    try {
      await connect()
      const ok = await authenticateAndLoad()
      if (!ok) setErr('Connected — sign in to load your balance.')
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Connection failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex gap-1 p-0.5 rounded-lg bg-[var(--color-border-faint)] w-fit">
        {(
          [
            { id: 'credits' as const, label: 'Credits' },
            { id: 'payments' as const, label: 'Payments' },
          ] as const
        ).map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={cn(
              'px-3 py-1.5 text-[13px] rounded-md transition-colors',
              tab === t.id
                ? 'bg-[var(--color-bg-modal)] text-[var(--color-text-primary)] shadow-sm'
                : 'text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]',
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'credits' ? (
        <>
          <CreditsBalanceCard balanceUsd={balanceUsd} disabled={!connected} />

          <div className="rounded-lg border border-[var(--color-border-soft)] p-3.5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <StatusDot tone={connected ? 'ok' : 'off'} />
                  <h3 className="text-[14px] font-medium text-[var(--color-text-primary)]">Wallet</h3>
                </div>
                <p className="text-[12px] text-[var(--color-text-secondary)] mt-1">
                  {connected
                    ? short(address!)
                    : walletPresent
                      ? 'Not connected'
                      : 'No Base-compatible wallet detected'}
                </p>
                <p className="text-[11px] text-[var(--color-text-tertiary)] mt-1.5 leading-snug">
                  {connected
                    ? `Paying with credits (API cost × ${X402_MARGIN.toFixed(2)}). Disconnect to use Free / your own keys.`
                    : `Connect to pay per action (× ${X402_MARGIN.toFixed(2)}). Until then Free / your own keys still work.`}
                </p>
              </div>
              {connected ? (
                <button
                  type="button"
                  className={modalSecondaryBtnClass}
                  disabled={busy}
                  onClick={() => void disconnect()}
                >
                  Disconnect
                </button>
              ) : (
                <button
                  type="button"
                  className={modalSecondaryBtnClass}
                  disabled={busy || !walletPresent}
                  onClick={() => void handleConnect()}
                >
                  {busy ? '…' : 'Connect wallet'}
                </button>
              )}
            </div>
          </div>

          {err && (
            <p role="alert" className="text-[12px] text-red-300">
              {err}
            </p>
          )}
        </>
      ) : (
        <PaymentsLedger rows={ledger} />
      )}
    </div>
  )
}
