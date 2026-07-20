import { useXSelfStore } from '../../stores/x-self-store'
import { useXIntelStore } from '../../stores/x-intel-store'
import { confirmDialog } from '../../stores/confirm-store'

/** A single clearable data row: label + a short data summary + a Clear button. */
function DataRow({
  title,
  subtitle,
  onClear,
}: {
  title: string
  subtitle: string
  onClear: () => void
}) {
  return (
    <div className="flex items-center gap-3 px-3 py-2.5 rounded-lg border border-[var(--color-border-faint)] bg-[var(--color-bg-input)]">
      <div className="flex-1 min-w-0">
        <div className="text-[13px] text-[var(--color-text-primary)] truncate">{title}</div>
        <div className="text-[11px] text-[var(--color-text-tertiary)] truncate">{subtitle}</div>
      </div>
      <button
        type="button"
        onClick={onClear}
        className="shrink-0 text-[11px] font-medium text-red-400/80 hover:text-red-400 border border-red-400/20 hover:border-red-400/40 rounded-md px-2.5 py-1 transition-colors"
      >
        Clear
      </button>
    </div>
  )
}

/**
 * Settings → Data & privacy. Lists every locally-cached intel dataset — your own
 * connected/disconnected X accounts and every analyzed target — and lets the user
 * clear them selectively or all at once. All client stores are encrypted at rest
 * with a device-bound key; clearing here is a hard, irreversible purge.
 */
export function DataPrivacySection() {
  const accounts = useXSelfStore((s) => s.accounts)
  const accountOrder = useXSelfStore((s) => s.accountOrder)
  const purgeAccount = useXSelfStore((s) => s.purgeAccount)
  const purgeAllAccounts = useXSelfStore((s) => s.purgeAllAccounts)

  const reports = useXIntelStore((s) => s.reports)
  const targetsOnRail = useXIntelStore((s) => s.targets)
  const purgeTarget = useXIntelStore((s) => s.purgeTarget)
  const clearAllTargets = useXIntelStore((s) => s.clearAllTargets)

  const selfIds = Object.keys(accounts)
  const targetKeys = Object.keys(reports)
  const connectedSet = new Set(accountOrder)
  const railSet = new Set(targetsOnRail.map((t) => t.toLowerCase()))

  const dataSummary = (postCount: number, reportCount: number, extra?: string): string => {
    const parts = [`${postCount} post${postCount === 1 ? '' : 's'}`, `${reportCount} report${reportCount === 1 ? '' : 's'}`]
    if (extra) parts.push(extra)
    return parts.join(' · ')
  }

  const confirmPurge = async (label: string, fn: () => void) => {
    const ok = await confirmDialog({
      title: 'Delete cached data',
      description: `Permanently delete all cached data for ${label}? This cannot be undone.`,
      confirmLabel: 'Delete',
      danger: true,
    })
    if (ok) fn()
  }

  return (
    <div className="flex flex-col gap-8 max-w-xl">
      <p className="text-[12px] text-[var(--color-text-tertiary)] leading-relaxed">
        Local app data (X intel, compose chats, main chat, settings, news, workflows, and
        playground state) is stored only on this device, encrypted at rest with a device-bound
        key. Disconnecting an account or removing a profile from the Others rail keeps its data
        cached — use the controls below to permanently erase it.
      </p>

      <p className="text-[12px] text-[var(--color-text-tertiary)] leading-relaxed">
        <span className="text-[var(--color-text-secondary)] font-medium">Shared library:</span>{' '}
        Analyzed profiles in the Others rail hold public X data (profiles, posts, and derived
        reports). To save everyone repeat gathers, this public data is contributed to a shared
        library so other users can load a profile someone already analyzed. Your own connected
        accounts and all other app data (chats, settings, spend, synthesis preferences) are never
        shared — they stay on this device.
      </p>

      {/* Your own accounts */}
      <section className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <h3 className="text-[13px] font-semibold text-[var(--color-text-primary)]">Your accounts</h3>
          {selfIds.length > 0 && (
            <button
              type="button"
              onClick={() => confirmPurge('all of your accounts', purgeAllAccounts)}
              className="text-[11px] font-medium text-red-400/80 hover:text-red-400 transition-colors"
            >
              Clear all
            </button>
          )}
        </div>
        {selfIds.length === 0 ? (
          <p className="text-[11px] text-[var(--color-text-tertiary)]">No cached account data.</p>
        ) : (
          <div className="flex flex-col gap-1.5">
            {selfIds.map((id) => {
              const a = accounts[id]
              const connected = connectedSet.has(id)
              return (
                <DataRow
                  key={id}
                  title={`@${a.username}`}
                  subtitle={dataSummary(
                    a.posts.length,
                    a.reportHistory.length,
                    connected ? 'connected' : 'disconnected (cached)',
                  )}
                  onClear={() => confirmPurge(`@${a.username}`, () => purgeAccount(id))}
                />
              )
            })}
          </div>
        )}
      </section>

      {/* Analyzed targets */}
      <section className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <h3 className="text-[13px] font-semibold text-[var(--color-text-primary)]">Analyzed profiles (Others)</h3>
          {targetKeys.length > 0 && (
            <button
              type="button"
              onClick={() => confirmPurge('all analyzed profiles', clearAllTargets)}
              className="text-[11px] font-medium text-red-400/80 hover:text-red-400 transition-colors"
            >
              Clear all
            </button>
          )}
        </div>
        {targetKeys.length === 0 ? (
          <p className="text-[11px] text-[var(--color-text-tertiary)]">No cached profile data.</p>
        ) : (
          <div className="flex flex-col gap-1.5">
            {targetKeys.map((key) => {
              const r = reports[key]
              const onRail = railSet.has(key.toLowerCase())
              return (
                <DataRow
                  key={key}
                  title={`@${r.username}`}
                  subtitle={dataSummary(
                    r.posts.length,
                    r.reportHistory.length,
                    onRail ? 'in Others rail' : 'removed from rail (cached)',
                  )}
                  onClear={() => confirmPurge(`@${r.username}`, () => purgeTarget(key))}
                />
              )
            })}
          </div>
        )}
      </section>
    </div>
  )
}
