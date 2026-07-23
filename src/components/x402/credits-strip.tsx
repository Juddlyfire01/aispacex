import { useState } from 'react'
import { useX402 } from '../../hooks/use-x402'
import { hasWallet } from '../../lib/x402/wallet'
import { X402_MARGIN, X402_DISABLE_FREE } from '../../lib/x402/config'
import { getCreditsUiPhase } from '../../lib/x402/charge-flow'
import { useX402Store } from '../../stores/x402-store'
import { usePurchaseCreditsUi } from '../../stores/purchase-credits-ui'
import { useSettingsStore } from '../../stores/settings-store'
import { modalGhostBtnClass, modalSecondaryBtnClass } from '../ui/modal'
import { StatusDot } from '../ui/shared'

function short(addr: string): string {
  return addr.length > 12 ? `${addr.slice(0, 6)}…${addr.slice(-4)}` : addr
}

function fmtUsd(n: number): string {
  return `$${n.toFixed(n < 1 && n > 0 ? 4 : 2)}`
}

/**
 * Compact Credits strip for the Connections modal: wallet connect, balance,
 * Purchase CTA, and deep-link to Settings → Billing. Caller gates on X402_ENABLED.
 * Dot/copy match the action gate: green only when SIWE session is valid.
 */
export function CreditsStrip({ onCloseConnections }: { onCloseConnections?: () => void }) {
  const {
    address,
    error,
    balanceUsd,
    connect,
    disconnect,
    authenticateAndLoad,
  } = useX402()
  // Re-render when session / status changes (phase is derived, not subscribed).
  useX402Store((s) => s.status)
  useX402Store((s) => s.address)
  useX402Store((s) => s.sessionToken)
  useX402Store((s) => s.sessionExpiresAt)

  const openPurchase = usePurchaseCreditsUi((s) => s.openPurchase)
  const openSettings = useSettingsStore((s) => s.openSettings)

  const [busy, setBusy] = useState(false)
  const [localError, setLocalError] = useState<string | null>(null)

  const walletPresent = hasWallet()
  const phase = getCreditsUiPhase()
  const ready = phase === 'ready'
  const needsSession = phase === 'needs_session'
  const linked = ready || needsSession

  const handleConnect = async () => {
    setBusy(true)
    setLocalError(null)
    try {
      await connect()
      const loaded = await authenticateAndLoad()
      if (!loaded) setLocalError('Wallet linked — sign in to load your balance and spend credits.')
    } catch (e) {
      setLocalError(e instanceof Error ? e.message : 'Connection failed')
    } finally {
      setBusy(false)
    }
  }

  const handleSignIn = async () => {
    setBusy(true)
    setLocalError(null)
    try {
      const loaded = await authenticateAndLoad()
      if (!loaded) setLocalError('Sign-in cancelled — credits stay locked until you sign.')
    } catch (e) {
      setLocalError(e instanceof Error ? e.message : 'Sign-in failed')
    } finally {
      setBusy(false)
    }
  }

  const handleDisconnect = async () => {
    setBusy(true)
    setLocalError(null)
    try {
      await disconnect()
    } finally {
      setBusy(false)
    }
  }

  const dotTone = ready ? 'ok' : needsSession ? 'amber' : 'off'
  const primaryLine = ready
    ? `${short(address!)} · ${fmtUsd(balanceUsd)}`
    : needsSession
      ? `${short(address!)} — sign in to use credits`
      : walletPresent
        ? 'Connect a wallet to pay per action with USDC on Base'
        : 'No Base-compatible wallet detected'

  const secondaryLine = ready
    ? X402_DISABLE_FREE
      ? `Actions debit credits (API cost × ${X402_MARGIN.toFixed(2)}). Free mode is off.`
      : `Actions debit credits (API cost × ${X402_MARGIN.toFixed(2)}). Disconnect to use Free / your own keys.`
    : needsSession
      ? 'Wallet linked — sign in once to unlock credits (stays until you Disconnect).'
      : X402_DISABLE_FREE
        ? `Free mode is off. Connect a wallet to pay (× ${X402_MARGIN.toFixed(2)}), or use full BYOK (X + Venice key).`
        : `Free / your own keys until you connect. Then actions debit credits (× ${X402_MARGIN.toFixed(2)}).`

  return (
    <section className="rounded-lg border border-[var(--color-border-soft)] p-3.5 mb-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <StatusDot tone={dotTone} pulsing={needsSession} />
            <h3 className="text-[14px] font-medium text-[var(--color-text-primary)]">Credits</h3>
          </div>
          <p className="text-[12px] text-[var(--color-text-secondary)] mt-1 leading-snug">
            {primaryLine}
          </p>
          <p className="text-[11px] text-[var(--color-text-tertiary)] mt-1 leading-snug">
            {secondaryLine}
          </p>
        </div>
        <div className="flex flex-col items-end gap-1.5 shrink-0">
          {ready ? (
            <>
              <button
                type="button"
                className={modalSecondaryBtnClass}
                disabled={busy}
                onClick={openPurchase}
              >
                Purchase credits
              </button>
              <button
                type="button"
                className={`${modalGhostBtnClass} text-[12px] hover:text-red-300 px-0`}
                disabled={busy}
                onClick={() => void handleDisconnect()}
              >
                Disconnect
              </button>
            </>
          ) : needsSession ? (
            <>
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
                onClick={() => void handleDisconnect()}
              >
                Disconnect
              </button>
            </>
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

      <div className="mt-2 flex items-center justify-between gap-2">
        <button
          type="button"
          className="text-[12px] text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] underline underline-offset-2"
          onClick={() => {
            onCloseConnections?.()
            openSettings('billing')
          }}
        >
          Manage in Settings
        </button>
        <div className="min-h-[1.25rem] text-right" aria-live="polite">
          {(localError || error) && (
            <p role="alert" className="text-[12px] text-red-300 leading-snug">
              {localError || error}
            </p>
          )}
        </div>
      </div>
      {/* linked keeps address in a11y tree when mid-session */}
      <span className="sr-only">{linked ? 'Wallet linked' : 'Wallet disconnected'}</span>
    </section>
  )
}
