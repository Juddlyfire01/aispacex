import { useMemo } from 'react'
import { useXIntelStore } from '../../stores/x-intel-store'
import { useXSelfStore } from '../../stores/x-self-store'
import type { PerformanceSelection } from '../../lib/compose/performance-context'
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

function selectionKey(s: PerformanceSelection | null): string | null {
  if (!s) return null
  return s.kind === 'me' ? `me:${s.accountId}` : `target:${s.username.toLowerCase()}`
}

/**
 * Left rail while Post → Performance is active: navigate self + target profiles.
 * Same density as You / Others rails; no connect/add/drag chrome.
 */
export function PerformanceProfileRail({
  selection,
  onSelect,
}: {
  selection: PerformanceSelection | null
  onSelect: (next: PerformanceSelection) => void
}) {
  const accounts = useXSelfStore((s) => s.accounts)
  const accountOrder = useXSelfStore((s) => s.accountOrder)
  const gatheringAccounts = useXSelfStore((s) => s.gatheringAccounts)

  const targets = useXIntelStore((s) => s.targets)
  const reports = useXIntelStore((s) => s.reports)
  const gatheringTargets = useXIntelStore((s) => s.gatheringTargets)

  const activeKey = selectionKey(selection)

  const selfRows = useMemo(
    () =>
      accountOrder
        .map((id) => {
          const acc = accounts[id]
          if (!acc) return null
          return { id, acc }
        })
        .filter(Boolean) as { id: string; acc: (typeof accounts)[string] }[],
    [accountOrder, accounts],
  )

  const empty = selfRows.length === 0 && targets.length === 0

  return (
    <div className="w-52 shrink-0 border-r border-[var(--color-border-faint)] bg-[var(--color-bg-base)] flex flex-col h-full min-h-0">
      <div className="px-3 pt-2.5 pb-1.5">
        <p className="text-[10px] font-medium uppercase tracking-wide text-[var(--color-text-tertiary)]">
          Profiles
        </p>
        <p className="text-[10px] text-[var(--color-text-quaternary)] mt-0.5">
          Performance for selected account
        </p>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto px-1.5 pb-2">
        {empty ? (
          <div className="px-2 py-5 text-[11px] text-[var(--color-text-tertiary)] text-center">
            Connect a self account or add a target in You / Others to review performance.
          </div>
        ) : (
          <>
            {selfRows.length > 0 && (
              <div className="px-2 pt-1 pb-1 text-[9px] uppercase tracking-wide text-[var(--color-text-quaternary)]">
                You
              </div>
            )}
            {selfRows.map(({ id, acc }) => {
              const key = `me:${id}`
              const isActive = activeKey === key
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => onSelect({ kind: 'me', accountId: id })}
                  className={cn(
                    'group relative w-full flex items-center gap-1.5 px-2 py-[5px] rounded-md text-[11px] text-left transition-colors',
                    isActive
                      ? 'text-[var(--color-text-primary)]'
                      : 'text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-border-faint)]',
                  )}
                >
                  {isActive && (
                    <span className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-3.5 rounded-full bg-[var(--color-accent)]" />
                  )}
                  {acc.profile?.avatarUrl ? (
                    <img
                      src={acc.profile.avatarUrl}
                      alt=""
                      className="w-4 h-4 rounded-full shrink-0"
                    />
                  ) : (
                    <div className="w-4 h-4 rounded-full bg-[var(--color-bg-raised)] shrink-0" />
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline justify-between gap-1 min-w-0">
                      <span className="truncate">@{acc.username}</span>
                      <span className="shrink-0 text-[9px] text-[var(--color-text-quaternary)]">You</span>
                    </div>
                    <div className="text-[9px] text-[var(--color-text-tertiary)]">
                      {gatheringAccounts[id]
                        ? 'updating…'
                        : relativeTime(acc.refreshedAt?.profile ?? acc.profile?.gatheredAt)}
                    </div>
                  </div>
                </button>
              )
            })}

            {targets.length > 0 && (
              <div className="px-2 pt-3 pb-1 text-[9px] uppercase tracking-wide text-[var(--color-text-quaternary)]">
                Others
              </div>
            )}
            {targets.map((t) => {
              const report = reports[t]
              const key = `target:${t.toLowerCase()}`
              const isActive = activeKey === key
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => onSelect({ kind: 'target', username: t })}
                  className={cn(
                    'group relative w-full flex items-center gap-1.5 px-2 py-[5px] rounded-md text-[11px] text-left transition-colors',
                    isActive
                      ? 'text-[var(--color-text-primary)]'
                      : 'text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-border-faint)]',
                  )}
                >
                  {isActive && (
                    <span className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-3.5 rounded-full bg-[var(--color-accent)]" />
                  )}
                  {report?.profile?.avatarUrl ? (
                    <img
                      src={report.profile.avatarUrl}
                      alt=""
                      className="w-4 h-4 rounded-full shrink-0"
                    />
                  ) : (
                    <div className="w-4 h-4 rounded-full bg-[var(--color-bg-raised)] shrink-0" />
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="truncate">@{t}</div>
                    <div className="text-[9px] text-[var(--color-text-tertiary)]">
                      {gatheringTargets[t]
                        ? 'updating…'
                        : relativeTime(report?.refreshedAt?.profile ?? report?.profile?.gatheredAt)}
                    </div>
                  </div>
                </button>
              )
            })}
          </>
        )}
      </div>
    </div>
  )
}
