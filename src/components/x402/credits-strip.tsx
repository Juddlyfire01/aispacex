import { useState } from 'react'
import { useX402 } from '../../hooks/use-x402'
import { hasWallet } from '../../lib/x402/wallet'
import { X402_MARGIN, X402_DISABLE_FREE } from '../../lib/x402/config'
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
 * Connecting a wallet opts into paid billing; disconnect returns to Free/BYOK.
 */
export function CreditsStrip({ onCloseConnections }: { onCloseConnections?: () => void }) {
  const {
    address,
    status,
    error,
    balanceUsd,
    connect,
    disconnect,
    authenticateAndLoad,
  } = useX402()
  const openPurchase = usePurchaseCreditsUi((s) => s.openPurchase)
  const openSettings = useSettingsStore((s) => s.openSettings)

  const [busy, setBusy] = useState(false)
  const [localError, setLocalError] = useState<string | null>(null)

  const walletPresent = hasWallet()
  const connected = status === 'connected' && Boolean(address)

  const handleConnect = async () => {
    setBusy(true)
    setLocalError(null)
    try {
      await connect()
      const loaded = await authenticateAndLoad()
      if (!loaded) setLocalError('Connected — sign in to load your balance.')
    } catch (e) {
      setLocalError(e instanceof Error ? e.message : 'Connection failed')
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

  return (
    <section className="rounded-lg border border-[var(--color-border-soft)] p-3.5 mb-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <StatusDot tone={connected ? 'ok' : 'off'} />
            <h3 className="text-[14px] font-medium text-[var(--color-text-primary)]">Credits</h3>
          </div>
          <p className="text-[12px] text-[var(--color-text-secondary)] mt-1 leading-snug">
            {connected
              ? `${short(address!)} · ${fmtUsd(balanceUsd)}`
              : walletPresent
                ? 'Connect a wallet to pay per action with USDC on Base'
                : 'No Base-compatible wallet detected'}
          </p>
          <p className="text-[11px] text-[var(--color-text-tertiary)] mt-1 leading-snug">
            {connected
              ? X402_DISABLE_FREE
                ? `Actions debit credits (API cost × ${X402_MARGIN.toFixed(2)}). Free mode is off.`
                : `Actions debit credits (API cost × ${X402_MARGIN.toFixed(2)}). Disconnect to use Free / your own keys.`
              : X402_DISABLE_FREE
                ? `Free mode is off. Connect a wallet to pay (× ${X402_MARGIN.toFixed(2)}), or use full BYOK (X + Venice key).`
                : `Free / your own keys until you connect. Then actions debit credits (× ${X402_MARGIN.toFixed(2)}).`}
          </p>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {connected ? (
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
        <button
          type="button"
          className="text-[12px] text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] underline underline-offset-2 ml-auto"
          onClick={() => {
            onCloseConnections?.()
            openSettings('billing')
          }}
        >
          Manage in Settings
        </button>
      </div>

      <div className="min-h-[1.25rem] mt-2" aria-live="polite">
        {(localError || error) && (
          <p role="alert" className="text-[12px] text-red-300 leading-snug">
            {localError || error}
          </p>
        )}
      </div>
    </section>
  )
}
