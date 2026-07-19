import { useEffect, useState } from 'react'
import { useAuthStore } from '../../stores/auth-store'
import { AppWordmark } from '../ui/logo'
import { toast } from '../../stores/toast-store'
import { validateVeniceKey } from '../../lib/validate-venice-key'
import { Modal, modalInputClass, modalGhostBtnClass, modalPrimaryBtnClass } from '../ui/modal'
import { CheckboxField } from '../ui/checkbox'

const MIN_PASSPHRASE = 8

export function ApiKeyDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { apiKey, hasEncrypted, setApiKey, unlock, clearApiKey } = useAuthStore()
  const [value, setValue] = useState(apiKey ?? '')
  const [passphrase, setPassphrase] = useState('')
  const [remember, setRemember] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [forceConnect, setForceConnect] = useState(false)

  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [open, onClose])

  if (!open) return null

  const isUnlockMode = hasEncrypted && !apiKey && !forceConnect
  const passphraseTooShort = remember && passphrase.length > 0 && passphrase.length < MIN_PASSPHRASE

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
      onClose()
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
    if (ok) { toast.success('Key unlocked'); onClose() }
    else setError('Wrong passphrase. Try again or use a different key.')
  }

  const titleId = 'apikey-dialog-title'

  return (
    <Modal open={open} onClose={onClose} aria-labelledby={titleId}>
      <div className="flex items-center gap-3 mb-5">
        <AppWordmark className="text-[17px] shrink-0" />
        <div>
          <h2 id={titleId} className="text-[17px] font-semibold text-[var(--color-text-primary)]">
            {isUnlockMode ? 'Unlock saved key' : 'Connect to Venice'}
          </h2>
          <p className="text-[13px] text-[var(--color-text-secondary)]">
            {isUnlockMode
              ? 'Enter your passphrase to decrypt your saved key.'
              : 'Stored in this tab only by default. Encrypt to keep across sessions.'}
          </p>
        </div>
      </div>

      {isUnlockMode ? (
        <div>
          <label htmlFor="apikey-passphrase" className="sr-only">Passphrase</label>
          <input
            id="apikey-passphrase"
            type="password"
            value={passphrase}
            onChange={(e) => setPassphrase(e.target.value)}
            placeholder="Passphrase"
            className={modalInputClass}
            autoFocus
            autoComplete="current-password"
            onKeyDown={(e) => { if (e.key === 'Enter') handleUnlock() }}
          />
        </div>
      ) : (
        <>
          <label htmlFor="apikey-input" className="sr-only">Venice API key</label>
          <input
            id="apikey-input"
            type="password"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="sk-..."
            className={`${modalInputClass} text-[16px] font-mono`}
            autoFocus
            autoComplete="off"
            onKeyDown={(e) => { if (e.key === 'Enter' && !remember) handleConnect() }}
          />
          <p className="text-[13px] text-[var(--color-text-tertiary)] mt-2">
            Get a key at{' '}
            <a
              href="https://venice.ai/settings/api"
              target="_blank"
              rel="noopener noreferrer"
              className="text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] underline underline-offset-2"
            >
              venice.ai/settings/api
            </a>
            .
          </p>

          <CheckboxField
            label="Remember across sessions (encrypted with passphrase)"
            checked={remember}
            onChange={setRemember}
            size="md"
            className="mt-4 text-[14px] text-[var(--color-text-secondary)] gap-2"
          />

          {remember && (
            <div className="mt-2">
              <label htmlFor="apikey-new-passphrase" className="sr-only">Encryption passphrase</label>
              <input
                id="apikey-new-passphrase"
                type="password"
                value={passphrase}
                onChange={(e) => setPassphrase(e.target.value)}
                placeholder={`Passphrase (min ${MIN_PASSPHRASE} chars)`}
                className={modalInputClass}
                autoComplete="new-password"
                onKeyDown={(e) => { if (e.key === 'Enter' && !passphraseTooShort) handleConnect() }}
              />
              {passphraseTooShort && (
                <p className="text-[12px] text-yellow-300/85 mt-1">Use at least {MIN_PASSPHRASE} characters.</p>
              )}
              <p className="text-[12px] text-[var(--color-text-tertiary)] mt-1">
                Encrypted with AES-GCM via PBKDF2 (250k iterations). We never see your passphrase or key.
              </p>
            </div>
          )}
        </>
      )}

      {isUnlockMode && (
        <button
          type="button"
          onClick={() => { setForceConnect(true); setError(null); setPassphrase('') }}
          className="mt-3 text-[13px] text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] transition-colors underline underline-offset-2"
        >
          Use a different key
        </button>
      )}

      <div className="min-h-[2.25rem] mt-3" aria-live="polite">
        {error && <p role="alert" className="text-[13px] text-red-300 leading-snug">{error}</p>}
      </div>

      <div className="flex flex-wrap gap-2 mt-6 justify-end">
        {(apiKey || hasEncrypted) && (
          <button
            type="button"
            onClick={() => { clearApiKey(); setValue(''); setPassphrase(''); setRemember(false); toast.info('API key cleared') }}
            className={`${modalGhostBtnClass} text-[14px] hover:text-red-300`}
          >
            Disconnect
          </button>
        )}
        <button type="button" onClick={onClose} className={`${modalGhostBtnClass} text-[14px]`}>
          Cancel
        </button>
        <button
          type="button"
          onClick={isUnlockMode ? handleUnlock : handleConnect}
          disabled={busy || (isUnlockMode ? !passphrase : !value.trim() || passphraseTooShort)}
          aria-busy={busy || undefined}
          className={`${modalPrimaryBtnClass} text-[14px]`}
        >
          {busy ? '…' : isUnlockMode ? 'Unlock' : 'Connect'}
        </button>
      </div>
    </Modal>
  )
}
