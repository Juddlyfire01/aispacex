import { useEffect, useState } from 'react'
import { useAuthStore } from '../../stores/auth-store'
import { useXSelfStore } from '../../stores/x-self-store'
import { toast } from '../../stores/toast-store'
import { validateVeniceKey } from '../../lib/validate-venice-key'
import { Modal, modalInputClass, modalGhostBtnClass, modalPrimaryBtnClass, modalSecondaryBtnClass } from '../ui/modal'
import { CheckboxField } from '../ui/checkbox'
import { StatusDot } from '../ui/shared'
import {
  VENICE_SERVER_FRONTED,
  isUserVeniceKey,
} from '../../lib/venice-config'
import { beginSelfLogin } from '../../lib/x-intel/self-client'
import { disconnectActiveAccount } from '../../lib/x-intel/self-orchestrate'
import { useXAppCredentialsStore, syncXByokCookies } from '../../stores/x-app-credentials-store'
import { useX402Store } from '../../stores/x402-store'
import { X402_ENABLED, X402_DISABLE_FREE } from '../../lib/x402/config'
import { isCreditsWalletConnected } from '../../lib/x402/charge-flow'
import { CreditsStrip } from '../x402/credits-strip'

const MIN_PASSPHRASE = 8

function useVeniceStatus() {
  const apiKey = useAuthStore((s) => s.apiKey)
  const hasEncrypted = useAuthStore((s) => s.hasEncrypted)
  // Re-render when credits wallet connects so Free-off status updates.
  useX402Store((s) => s.status)
  useX402Store((s) => s.address)

  if (isUserVeniceKey(apiKey)) {
    return { tone: 'ok' as const, text: 'Using your API key' }
  }
  if (VENICE_SERVER_FRONTED && apiKey) {
    if (X402_DISABLE_FREE && !isCreditsWalletConnected()) {
      return {
        tone: 'off' as const,
        text: 'Free mode is off — app credentials need Credits or your key',
      }
    }
    if (X402_DISABLE_FREE && isCreditsWalletConnected()) {
      return { tone: 'ok' as const, text: 'App credentials via Credits' }
    }
    return { tone: 'ok' as const, text: 'Using app-provided credentials (alpha)' }
  }
  if (hasEncrypted) {
    return {
      tone: 'amber' as const,
      text: X402_DISABLE_FREE
        ? 'Saved key locked — unlock, or connect Credits'
        : 'Saved key locked — unlock to use your key',
    }
  }
  if (VENICE_SERVER_FRONTED) {
    if (X402_DISABLE_FREE && !isCreditsWalletConnected()) {
      return {
        tone: 'off' as const,
        text: 'Free mode is off — connect Credits or add your Venice key',
      }
    }
    return { tone: 'ok' as const, text: 'Using app-provided credentials (alpha)' }
  }
  return { tone: 'off' as const, text: 'API key required' }
}

export function ConnectionsDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { apiKey, hasEncrypted, setApiKey, unlock, clearApiKey } = useAuthStore()
  const xConnected = useXSelfStore((s) => s.connected)
  const xConnecting = useXSelfStore((s) => s.connecting)
  const activeAccountId = useXSelfStore((s) => s.activeAccountId)
  const accounts = useXSelfStore((s) => s.accounts)
  const xUsername = activeAccountId ? accounts[activeAccountId]?.username : null

  const [value, setValue] = useState('')
  const [passphrase, setPassphrase] = useState('')
  const [remember, setRemember] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showVeniceForm, setShowVeniceForm] = useState(false)
  const [forceConnect, setForceConnect] = useState(false)
  const [showXAppForm, setShowXAppForm] = useState(false)
  const [xAppBusy, setXAppBusy] = useState(false)
  const [xAppError, setXAppError] = useState<string | null>(null)

  const xAppClientId = useXAppCredentialsStore((s) => s.clientId)
  const xAppClientSecret = useXAppCredentialsStore((s) => s.clientSecret)
  const xAppBearer = useXAppCredentialsStore((s) => s.bearer)
  const setXAppCredentials = useXAppCredentialsStore((s) => s.setCredentials)
  const clearXAppCredentials = useXAppCredentialsStore((s) => s.clearCredentials)
  const hasXAppCreds = Boolean(xAppClientId.trim() || xAppClientSecret.trim() || xAppBearer.trim())

  const [draftClientId, setDraftClientId] = useState('')
  const [draftClientSecret, setDraftClientSecret] = useState('')
  const [draftBearer, setDraftBearer] = useState('')

  useEffect(() => {
    if (!open) return
    setError(null)
    setShowVeniceForm(false)
    setForceConnect(false)
    setValue('')
    setPassphrase('')
    setRemember(false)
    setShowXAppForm(false)
    setXAppError(null)
    setDraftClientId(useXAppCredentialsStore.getState().clientId)
    setDraftClientSecret(useXAppCredentialsStore.getState().clientSecret)
    setDraftBearer(useXAppCredentialsStore.getState().bearer)
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [open, onClose])

  const veniceStatus = useVeniceStatus()

  if (!open) return null

  const isUnlockMode = hasEncrypted && !isUserVeniceKey(apiKey) && !forceConnect && showVeniceForm
  const passphraseTooShort = remember && passphrase.length > 0 && passphrase.length < MIN_PASSPHRASE
  const titleId = 'connections-dialog-title'

  const handleConnect = async () => {
    if (!value.trim()) return
    if (remember) {
      if (!passphrase) { setError('Passphrase required to remember this key.'); return }
      if (passphrase.length < MIN_PASSPHRASE) { setError(`Passphrase must be at least ${MIN_PASSPHRASE} characters.`); return }
    }
    setBusy(true)
    setError(null)
    try {
      const validation = await validateVeniceKey(value.trim())
      if (!validation.ok) {
        setError(validation.message)
        return
      }
      await setApiKey(value.trim(), remember ? { passphrase } : undefined)
      toast.success(remember ? 'Key saved (encrypted)' : 'Key set for this session')
      setShowVeniceForm(false)
      setValue('')
      setPassphrase('')
      setRemember(false)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save key')
    } finally {
      setBusy(false)
    }
  }

  const handleUnlock = async () => {
    if (!passphrase) return
    setBusy(true)
    setError(null)
    const ok = await unlock(passphrase)
    setBusy(false)
    if (ok) {
      toast.success('Key unlocked')
      setShowVeniceForm(false)
      setPassphrase('')
    } else {
      setError('Wrong passphrase. Try again or use a different key.')
    }
  }

  const handleClearVenice = () => {
    clearApiKey()
    setValue('')
    setPassphrase('')
    setRemember(false)
    setForceConnect(false)
    toast.info(
      VENICE_SERVER_FRONTED
        ? X402_DISABLE_FREE
          ? 'Key cleared — connect Credits or add a key to continue'
          : 'Using app-provided Venice again'
        : 'API key cleared',
    )
  }

  return (
    <Modal open={open} onClose={onClose} aria-labelledby={titleId} className="max-w-md">
      <div className="mb-5">
        <h2 id={titleId} className="text-[17px] font-semibold text-[var(--color-text-primary)]">
          Connections
        </h2>
        <p className="text-[13px] text-[var(--color-text-secondary)]">
          {X402_DISABLE_FREE
            ? 'Free mode is off — connect Credits, or use your own Venice key + X account.'
            : 'What’s powering this session — and what you can unlock.'}
        </p>
      </div>

      {/* Venice */}
      <section className="rounded-lg border border-[var(--color-border-soft)] p-3.5 mb-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <StatusDot tone={veniceStatus.tone} />
              <h3 className="text-[14px] font-medium text-[var(--color-text-primary)]">Venice</h3>
            </div>
            <p className="text-[12px] text-[var(--color-text-secondary)] mt-1 leading-snug">
              {veniceStatus.text}
            </p>
            {VENICE_SERVER_FRONTED && !isUserVeniceKey(apiKey) && (
              <p className="text-[11px] text-[var(--color-text-tertiary)] mt-1 leading-snug">
                {X402_DISABLE_FREE
                  ? isCreditsWalletConnected()
                    ? 'Paid actions use app Venice credentials; add your own key to override (stays on this device).'
                    : 'Connect a Credits wallet to use app Venice, or add your own key (BYOK, stays on this device).'
                  : 'Optional — add your own key to override app credentials (privacy-first, stays on this device).'}
              </p>
            )}
          </div>
          <div className="flex flex-col items-end gap-1.5 shrink-0">
            {!showVeniceForm && (
              <>
                <button
                  type="button"
                  className={modalSecondaryBtnClass}
                  onClick={() => {
                    setShowVeniceForm(true)
                    setForceConnect(!(hasEncrypted && !isUserVeniceKey(apiKey)))
                    setError(null)
                  }}
                >
                  {isUserVeniceKey(apiKey)
                    ? 'Replace key'
                    : hasEncrypted && !isUserVeniceKey(apiKey)
                      ? 'Unlock key'
                      : 'Use your key'}
                </button>
                {(isUserVeniceKey(apiKey) || hasEncrypted) && (
                  <button
                    type="button"
                    className={`${modalGhostBtnClass} text-[12px] hover:text-red-300 px-0`}
                    onClick={handleClearVenice}
                  >
                    Disconnect
                  </button>
                )}
              </>
            )}
          </div>
        </div>

        {showVeniceForm && (
          <div className="mt-3 pt-3 border-t border-[var(--color-border-faint)]">
            {isUnlockMode ? (
              <div>
                <label htmlFor="conn-apikey-passphrase" className="sr-only">Passphrase</label>
                <input
                  id="conn-apikey-passphrase"
                  type="password"
                  value={passphrase}
                  onChange={(e) => setPassphrase(e.target.value)}
                  placeholder="Passphrase"
                  className={modalInputClass}
                  autoFocus
                  autoComplete="current-password"
                  onKeyDown={(e) => { if (e.key === 'Enter') void handleUnlock() }}
                />
                <button
                  type="button"
                  onClick={() => { setForceConnect(true); setError(null); setPassphrase('') }}
                  className="mt-2 text-[12px] text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] underline underline-offset-2"
                >
                  Use a different key
                </button>
              </div>
            ) : (
              <>
                <label htmlFor="conn-apikey-input" className="sr-only">Venice API key</label>
                <input
                  id="conn-apikey-input"
                  type="password"
                  value={value}
                  onChange={(e) => setValue(e.target.value)}
                  placeholder="sk-..."
                  className={`${modalInputClass} text-[15px] font-mono`}
                  autoFocus
                  autoComplete="off"
                  onKeyDown={(e) => { if (e.key === 'Enter' && !remember) void handleConnect() }}
                />
                <p className="text-[12px] text-[var(--color-text-tertiary)] mt-1.5">
                  Get a key at{' '}
                  <a
                    href="https://venice.ai/settings/api"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline underline-offset-2"
                  >
                    venice.ai/settings/api
                  </a>
                  . Encrypted locally — we never see your key.
                </p>
                <CheckboxField
                  label="Remember across sessions (encrypted with passphrase)"
                  checked={remember}
                  onChange={setRemember}
                  size="md"
                  className="mt-3 text-[13px] text-[var(--color-text-secondary)] gap-2"
                />
                {remember && (
                  <div className="mt-2">
                    <label htmlFor="conn-apikey-new-passphrase" className="sr-only">Encryption passphrase</label>
                    <input
                      id="conn-apikey-new-passphrase"
                      type="password"
                      value={passphrase}
                      onChange={(e) => setPassphrase(e.target.value)}
                      placeholder={`Passphrase (min ${MIN_PASSPHRASE} chars)`}
                      className={modalInputClass}
                      autoComplete="new-password"
                      onKeyDown={(e) => { if (e.key === 'Enter' && !passphraseTooShort) void handleConnect() }}
                    />
                    {passphraseTooShort && (
                      <p className="text-[12px] text-yellow-300/85 mt-1">Use at least {MIN_PASSPHRASE} characters.</p>
                    )}
                  </div>
                )}
              </>
            )}
            <div className="min-h-[1.75rem] mt-2" aria-live="polite">
              {error && <p role="alert" className="text-[12px] text-red-300 leading-snug">{error}</p>}
            </div>
            <div className="flex justify-end gap-2 mt-2">
              <button type="button" className={modalGhostBtnClass} onClick={() => { setShowVeniceForm(false); setError(null) }}>
                Cancel
              </button>
              <button
                type="button"
                className={modalPrimaryBtnClass}
                disabled={busy || (isUnlockMode ? !passphrase : !value.trim() || passphraseTooShort)}
                aria-busy={busy || undefined}
                onClick={() => { void (isUnlockMode ? handleUnlock() : handleConnect()) }}
              >
                {busy ? '…' : isUnlockMode ? 'Unlock' : 'Connect'}
              </button>
            </div>
          </div>
        )}
      </section>

      {/* X */}
      <section className="rounded-lg border border-[var(--color-border-soft)] p-3.5 mb-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <StatusDot tone={xConnected ? 'ok' : 'off'} pulsing={!xConnected && !xConnecting} />
              <h3 className="text-[14px] font-medium text-[var(--color-text-primary)]">X account</h3>
            </div>
            <p className="text-[12px] text-[var(--color-text-secondary)] mt-1 leading-snug">
              {xConnecting
                ? 'Connecting…'
                : xConnected
                  ? `Connected as @${xUsername ?? '…'}`
                  : X402_DISABLE_FREE
                    ? 'Not connected — needed for BYOK gather (or use Credits)'
                    : 'Not connected — posting locked'}
            </p>
            <p className="text-[11px] text-[var(--color-text-tertiary)] mt-1 leading-snug">
              {X402_DISABLE_FREE
                ? xConnected
                  ? 'Connected for posting and BYOK gather. Free app-bearer gather is off.'
                  : 'Free app-bearer gather is off. Connect X for BYOK, or pay with Credits.'
                : 'Optional — connect to post. You can gather any public profile without connecting.'}
            </p>
            {hasXAppCreds && (
              <p className="text-[11px] text-teal-300/80 mt-1 leading-snug">
                Using your X developer app credentials for API costs.
              </p>
            )}
          </div>
          <div className="flex flex-col items-end gap-1.5 shrink-0">
            {xConnected ? (
              <button
                type="button"
                className={modalSecondaryBtnClass}
                onClick={() => { void disconnectActiveAccount().then(() => toast.info('X account disconnected')) }}
              >
                Disconnect
              </button>
            ) : (
              <button
                type="button"
                className={modalSecondaryBtnClass}
                disabled={xConnecting}
                onClick={() => { void beginSelfLogin() }}
              >
                {xConnecting ? 'Connecting…' : 'Connect X'}
              </button>
            )}
          </div>
        </div>

        <div className="mt-3 pt-3 border-t border-[var(--color-border-faint)]">
          <button
            type="button"
            className="text-[12px] text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] underline underline-offset-2"
            onClick={() => {
              setShowXAppForm((v) => !v)
              setXAppError(null)
              setDraftClientId(xAppClientId)
              setDraftClientSecret(xAppClientSecret)
              setDraftBearer(xAppBearer)
            }}
          >
            {showXAppForm ? 'Hide' : 'Advanced'} — your X developer app (Client ID / Secret)
          </button>

          {showXAppForm && (
            <div className="mt-3 space-y-2.5">
              <p className="text-[11px] text-[var(--color-text-tertiary)] leading-snug">
                Override app-provided X credentials so gather and OAuth bill your developer app.
                Register this site’s callback URL in the{' '}
                <a
                  href="https://developer.x.com"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline underline-offset-2"
                >
                  X developer portal
                </a>
                . Stored in this tab; synced as HttpOnly cookies for API calls — not saved to our database.
              </p>
              <div>
                <label htmlFor="x-byok-client-id" className="block text-[11px] text-[var(--color-text-tertiary)] mb-1">
                  Client ID
                </label>
                <input
                  id="x-byok-client-id"
                  type="text"
                  value={draftClientId}
                  onChange={(e) => setDraftClientId(e.target.value)}
                  placeholder="Your X app Client ID"
                  className={`${modalInputClass} text-[13px] font-mono`}
                  autoComplete="off"
                />
              </div>
              <div>
                <label htmlFor="x-byok-client-secret" className="block text-[11px] text-[var(--color-text-tertiary)] mb-1">
                  Client Secret <span className="text-[var(--color-text-quaternary)]">(optional for public clients)</span>
                </label>
                <input
                  id="x-byok-client-secret"
                  type="password"
                  value={draftClientSecret}
                  onChange={(e) => setDraftClientSecret(e.target.value)}
                  placeholder="Client Secret"
                  className={`${modalInputClass} text-[13px] font-mono`}
                  autoComplete="off"
                />
              </div>
              <div>
                <label htmlFor="x-byok-bearer" className="block text-[11px] text-[var(--color-text-tertiary)] mb-1">
                  Bearer Token <span className="text-[var(--color-text-quaternary)]">(optional — public gather / read costs)</span>
                </label>
                <input
                  id="x-byok-bearer"
                  type="password"
                  value={draftBearer}
                  onChange={(e) => setDraftBearer(e.target.value)}
                  placeholder="App-only Bearer Token"
                  className={`${modalInputClass} text-[13px] font-mono`}
                  autoComplete="off"
                />
              </div>
              <div className="min-h-[1.5rem]" aria-live="polite">
                {xAppError && <p role="alert" className="text-[12px] text-red-300 leading-snug">{xAppError}</p>}
              </div>
              <div className="flex flex-wrap justify-end gap-2">
                {hasXAppCreds && (
                  <button
                    type="button"
                    className={`${modalGhostBtnClass} text-[12px] hover:text-red-300`}
                    disabled={xAppBusy}
                    onClick={() => {
                      void (async () => {
                        setXAppBusy(true)
                        setXAppError(null)
                        clearXAppCredentials()
                        setDraftClientId('')
                        setDraftClientSecret('')
                        setDraftBearer('')
                        const result = await syncXByokCookies()
                        setXAppBusy(false)
                        if (!result.ok) {
                          setXAppError(result.error ?? 'Failed to clear')
                          return
                        }
                        toast.info('Using app-provided X credentials again')
                        setShowXAppForm(false)
                      })()
                    }}
                  >
                    Clear
                  </button>
                )}
                <button
                  type="button"
                  className={modalPrimaryBtnClass}
                  disabled={xAppBusy || (!draftClientId.trim() && !draftClientSecret.trim() && !draftBearer.trim())}
                  aria-busy={xAppBusy || undefined}
                  onClick={() => {
                    void (async () => {
                      setXAppBusy(true)
                      setXAppError(null)
                      setXAppCredentials({
                        clientId: draftClientId.trim(),
                        clientSecret: draftClientSecret.trim(),
                        bearer: draftBearer.trim(),
                      })
                      const result = await syncXByokCookies()
                      setXAppBusy(false)
                      if (!result.ok) {
                        setXAppError(result.error ?? 'Failed to save')
                        return
                      }
                      toast.success('X app credentials saved for this session')
                      setShowXAppForm(false)
                    })()
                  }}
                >
                  {xAppBusy ? '…' : 'Save'}
                </button>
              </div>
            </div>
          )}
        </div>
      </section>

      {/* Credits (x402) — quick purchase strip; full Billing lives in Settings */}
      {X402_ENABLED && (
        <div className="mt-3">
          <CreditsStrip onCloseConnections={onClose} />
        </div>
      )}

      <div className="flex justify-end mt-5">
        <button type="button" onClick={onClose} className={`${modalPrimaryBtnClass} text-[14px]`}>
          Done
        </button>
      </div>
    </Modal>
  )
}
