import { useState } from 'react'
import { useXSelfStore } from '../../stores/x-self-store'
import { beginSelfLogin, selfLogout } from '../../lib/x-intel/self-client'
import { selectSelfAccount, refreshSelfSession } from '../../lib/x-intel/self-orchestrate'
import { openComposeForTarget } from '../../lib/compose/open-compose'
import { CostMeter } from './cost-meter'
import { RailTopConnectButton } from './rail-top-control'
import { cn } from '../../lib/utils'

function relativeTime(iso: string | undefined): string {
  if (!iso) return 'never'
  const ms = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(ms / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.floor(hours / 24)}d ago`
}

/** Rail of connected self X accounts. Mirrors TargetRail's structure but for
 *  the Profile tab: a "+ Connect another account" entry at top, a scrollable
 *  list of connected accounts (each switchable + disconnectable), and the same
 *  avatar/username/last-gathered row shape. Clicking a row switches the active
 *  account server-side (no re-auth needed). */
export function SelfRail() {
  const accounts = useXSelfStore((s) => s.accounts)
  const accountOrder = useXSelfStore((s) => s.accountOrder)
  const activeAccountId = useXSelfStore((s) => s.activeAccountId)
  const disconnectAccount = useXSelfStore((s) => s.disconnectAccount)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const handleSwitch = async (id: string) => {
    if (id === activeAccountId) return
    setBusy(id)
    setError(null)
    try {
      const ok = await selectSelfAccount(id)
      if (!ok) {
        // Fall back to re-probing so the store reflects server truth.
        await refreshSelfSession()
        setError('Could not switch — account may be disconnected.')
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Switch failed')
    } finally {
      setBusy(null)
    }
  }

  const handleDisconnect = async (id: string, username: string) => {
    if (!confirm(`Disconnect @${username}? Your gathered data stays encrypted on this device and is revived if you reconnect. Clear it anytime from Settings → Data & privacy.`)) return
    await selfLogout(id)
    disconnectAccount(id)
    // If we just removed the active account, the server fell back to another
    // (or none); re-probe to sync the store's activeAccountId + connected flag.
    if (id === activeAccountId) {
      await refreshSelfSession()
    }
  }

  const handleCompose = (username: string) => {
    // The compose workspace posts through whichever OAuth session is active
    // server-side, so just jump to the Post tab. Pre-loading the account's own
    // username as compose context mirrors the target-rail affordance.
    openComposeForTarget(username)
  }

  return (
    <div className="w-52 shrink-0 border-r border-[var(--color-border-faint)] bg-[var(--color-bg-base)] flex flex-col">
      <div className="p-2">
        <RailTopConnectButton onClick={beginSelfLogin} />
        {error && <p className="text-[10px] text-red-400/70 mt-1 px-0.5">{error}</p>}
      </div>

      <div className="flex-1 overflow-y-auto px-1.5 pb-2">
        {accountOrder.length === 0 ? (
          <div className="px-2 py-5 text-[11px] text-[var(--color-text-tertiary)] text-center">
            Connect an X account to see your own profile, posts, bookmarks & likes.
          </div>
        ) : (
          accountOrder.map((id) => {
            const acc = accounts[id]
            if (!acc) return null
            const isActive = id === activeAccountId
            return (
              <div
                key={id}
                className={cn(
                  'group relative flex items-center gap-1.5 px-2 py-[5px] rounded-md text-[11px] cursor-pointer transition-colors',
                  isActive
                    ? 'text-[var(--color-text-primary)]'
                    : 'text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-border-faint)]',
                )}
                onClick={() => handleSwitch(id)}
              >
                {isActive && (
                  <span className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-3.5 rounded-full bg-[var(--color-accent)]" />
                )}
                {acc.profile?.avatarUrl ? (
                  <img src={acc.profile.avatarUrl} alt="" className="w-4 h-4 rounded-full shrink-0" />
                ) : (
                  <div className="w-4 h-4 rounded-full bg-[var(--color-bg-raised)] shrink-0" />
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline justify-between gap-1 min-w-0">
                    <span className="truncate">@{acc.username}</span>
                  </div>
                  <div className="text-[9px] text-[var(--color-text-tertiary)]">
                    {busy === id ? 'switching…' : relativeTime(acc.refreshedAt?.profile ?? acc.profile?.gatheredAt)}
                  </div>
                </div>
                <button
                  onClick={(e) => { e.stopPropagation(); handleCompose(acc.username) }}
                  title="Compose post"
                  className="opacity-0 group-hover:opacity-100 text-[var(--color-text-tertiary)] hover:text-[var(--color-text-primary)] transition-all shrink-0 p-0.5"
                >
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 20h9" />
                    <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
                  </svg>
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); handleDisconnect(id, acc.username) }}
                  title="Disconnect"
                  className="opacity-0 group-hover:opacity-100 text-[var(--color-text-tertiary)] hover:text-[var(--color-text-primary)] transition-all shrink-0 p-0.5"
                >
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                </button>
              </div>
            )
          })
        )}
      </div>

      <CostMeter defaultView="combined" />
    </div>
  )
}
