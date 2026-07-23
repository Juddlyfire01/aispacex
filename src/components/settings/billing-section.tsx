import { useEffect, useState } from 'react'
import { useX402 } from '../../hooks/use-x402'
import { hasWallet } from '../../lib/x402/wallet'
import { X402_ENABLED, X402_MARGIN, X402_DISABLE_FREE } from '../../lib/x402/config'
import { getCreditsUiPhase } from '../../lib/x402/charge-flow'
import { useX402Store } from '../../stores/x402-store'
import { CreditsBalanceCard } from '../x402/credits-balance-card'
import { PaymentsLedger } from '../x402/payments-ledger'
import { modalSecondaryBtnClass, modalGhostBtnClass } from '../ui/modal'
import { StatusDot } from '../ui/shared'
import { cn } from '../../lib/utils'

type BillingTab = 'credits' | 'payments'

function short(addr: string): string {
  return addr.length > 12 ? `${addr.slice(0, 6)}…${addr.slice(-4)}` : addr
}

/**
 * Settings → Billing: Credits (balance + purchase + wallet) and Payments (ledger).
 * Green only when SIWE session is valid (same as action gate).
 */
export function BillingSection({ initialTab = 'credits' }: { initialTab?: BillingTab }) {
  const {
    address,
    balanceUsd,
    ledger,
    connect,
    disconnect,
    authenticateAndLoad,
  } = useX402()

  useX402Store((s) => s.status)
  useX402Store((s) => s.address)
  useX402Store((s) => s.sessionToken)
  useX402Store((s) => s.sessionExpiresAt)

  const [tab, setTab] = useState<BillingTab>(initialTab)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const phase = getCreditsUiPhase()
  const ready = phase === 'ready'
  const needsSession = phase === 'needs_session'
  const walletPresent = hasWallet()
  const displayBalance = ready || needsSession ? balanceUsd : 0

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
      if (!ok) setErr('Wallet linked — sign in to load your balance and spend credits.')
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Connection failed')
    } finally {
      setBusy(false)
    }
  }

  const handleSignIn = async () => {
    setBusy(true)
    setErr(null)
    try {
      const ok = await authenticateAndLoad()
      if (!ok) setErr('Sign-in cancelled — credits stay locked until you sign.')
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Sign-in failed')
    } finally {
      setBusy(false)
    }
  }

  const walletHint = ready
    ? X402_DISABLE_FREE
      ? `Paying with credits (API cost × ${X402_MARGIN.toFixed(2)}). Free mode is off — disconnect blocks actions until you reconnect or use full BYOK (X + Venice key).`
      : `Paying with credits (API cost × ${X402_MARGIN.toFixed(2)}). Disconnect to use Free / your own keys.`
    : needsSession
      ? 'Wallet linked but session expired — sign in once (valid 24h) to spend credits.'
      : X402_DISABLE_FREE
        ? `Free mode is off. Connect a wallet to pay per action (× ${X402_MARGIN.toFixed(2)}), or use full BYOK (connect X + your Venice API key).`
        : `Connect to pay per action (× ${X402_MARGIN.toFixed(2)}). Until then Free / your own keys still work.`

  const statusLabel = ready
    ? short(address!)
    : needsSession
      ? `${short(address!)} — sign in required`
      : walletPresent
        ? 'Not connected'
        : 'No Base-compatible wallet detected'

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
          <CreditsBalanceCard balanceUsd={displayBalance} disabled={!ready} />

          <div className="rounded-lg border border-[var(--color-border-soft)] p-3.5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <StatusDot
                    tone={ready ? 'ok' : needsSession ? 'amber' : 'off'}
                    pulsing={needsSession}
                  />
                  <h3 className="text-[14px] font-medium text-[var(--color-text-primary)]">Wallet</h3>
                </div>
                <p className="text-[12px] text-[var(--color-text-secondary)] mt-1">
                  {statusLabel}
                </p>
                <p className="text-[11px] text-[var(--color-text-tertiary)] mt-1.5 leading-snug">
                  {walletHint}
                </p>
              </div>
              {ready ? (
                <button
                  type="button"
                  className={modalSecondaryBtnClass}
                  disabled={busy}
                  onClick={() => void disconnect()}
                >
                  Disconnect
                </button>
              ) : needsSession ? (
                <div className="flex flex-col items-end gap-1.5">
                  <button
                    type="button"
                    className={modalSecondaryBtnClass}
                    disabled={busy}
                    onClick={() => void handleSignIn()}
                  >
                    {busy ? '…' : 'Sign in'}
                  </button>
                  <button
                    type="button"
                    className={`${modalGhostBtnClass} text-[12px] hover:text-red-300 px-0`}
                    disabled={busy}
                    onClick={() => void disconnect()}
                  >
                    Disconnect
                  </button>
                </div>
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
        <PaymentsLedger rows={ready || needsSession ? ledger : []} />
      )}
    </div>
  )
}
