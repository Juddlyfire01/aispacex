import { useEffect, useState } from 'react'
import { useAuthStore } from '../../stores/auth-store'
import { useXSelfStore } from '../../stores/x-self-store'
import { AppWordmark } from '../ui/logo'
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

const MIN_PASSPHRASE = 8

function useVeniceStatus() {
  const apiKey = useAuthStore((s) => s.apiKey)
  const hasEncrypted = useAuthStore((s) => s.hasEncrypted)
  if (isUserVeniceKey(apiKey)) {
    return { tone: 'teal' as const, text: 'Using your API key' }
  }
  if (VENICE_SERVER_FRONTED && apiKey) {
    return { tone: 'teal' as const, text: 'Using app-provided credentials (alpha)' }
  }
  if (hasEncrypted) {
    return { tone: 'amber' as const, text: 'Saved key locked — unlock to use your key' }
  }
  if (VENICE_SERVER_FRONTED) {
    return { tone: 'teal' as const, text: 'Using app-provided credentials (alpha)' }
  }
  return { tone: 'slate' as const, text: 'API key required' }
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

  useEffect(() => {
    if (!open) return
    setError(null)
    setShowVeniceForm(false)
    setForceConnect(false)
    setValue('')
    setPassphrase('')
    setRemember(false)
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
    toast.info(VENICE_SERVER_FRONTED ? 'Using app-provided Venice again' : 'API key cleared')
  }

  return (
    <Modal open={open} onClose={onClose} aria-labelledby={titleId} className="max-w-md">
      <div className="flex items-center gap-3 mb-5">
        <AppWordmark className="text-[17px] shrink-0" />
        <div>
          <h2 id={titleId} className="text-[17px] font-semibold text-[var(--color-text-primary)]">
            Connections
          </h2>
          <p className="text-[13px] text-[var(--color-text-secondary)]">
            What’s powering this session — and what you can unlock.
          </p>
        </div>
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
                Optional — add your own key to override app credentials (privacy-first, stays on this device).
              </p>
            )}
          </div>
          <div className="flex flex-col items-end gap-1.5 shrink-0">
            {!showVeniceForm && (
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
            )}
            {(isUserVeniceKey(apiKey) || hasEncrypted) && (
              <button
                type="button"
                className={`${modalGhostBtnClass} text-[12px] hover:text-red-300 px-0`}
                onClick={handleClearVenice}
              >
                Disconnect
              </button>
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
      <section className="rounded-lg border border-[var(--color-border-soft)] p-3.5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <StatusDot tone={xConnected ? 'teal' : 'slate'} pulsing={!xConnected && !xConnecting} />
              <h3 className="text-[14px] font-medium text-[var(--color-text-primary)]">X account</h3>
            </div>
            <p className="text-[12px] text-[var(--color-text-secondary)] mt-1 leading-snug">
              {xConnecting
                ? 'Connecting…'
                : xConnected
                  ? `Connected as @${xUsername ?? '…'}`
                  : 'Not connected — posting locked'}
            </p>
            <p className="text-[11px] text-[var(--color-text-tertiary)] mt-1 leading-snug">
              Optional — connect to post. You can gather any public profile without connecting.
            </p>
          </div>
          <div className="flex flex-col items-end gap-1.5 shrink-0">
            {xConnected ? (
              <button
                type="button"
                className={`${modalGhostBtnClass} text-[12px] hover:text-red-300 px-0`}
                onClick={() => { void disconnectActiveAccount().then(() => toast.info('X account disconnected')) }}
              >
                Disconnect
              </button>
            ) : (
              <button
                type="button"
                className={modalSecondaryBtnClass}
                disabled={xConnecting}
                onClick={() => beginSelfLogin()}
              >
                {xConnecting ? 'Connecting…' : 'Connect X'}
              </button>
            )}
          </div>
        </div>
      </section>

      <div className="flex justify-end mt-5">
        <button type="button" onClick={onClose} className={`${modalPrimaryBtnClass} text-[14px]`}>
          Done
        </button>
      </div>
    </Modal>
  )
}
