import { useState } from 'react'
import { useXIntelStore } from '../../stores/x-intel-store'
import { useXSelfStore } from '../../stores/x-self-store'
import { runGather } from '../../lib/x-intel/orchestrate'
import { CostMeter } from './cost-meter'
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

export function TargetRail() {
  const { targets, reports, activeTarget, setActiveTarget, addTarget, removeTarget } = useXIntelStore()
  const connected = useXSelfStore((s) => s.connected)
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const handleRemove = (username: string) => {
    if (!confirm(`Remove @${username} from the Others rail? Gathered data stays encrypted on this device and is revived if you add them again. Clear it anytime from Settings → Data & privacy.`)) return
    removeTarget(username)
  }

  const gather = async (username: string) => {
    setBusy(username)
    setError(null)
    try {
      await runGather(username)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gather failed')
    } finally {
      setBusy(null)
    }
  }

  const handleAdd = async () => {
    const name = input.trim().replace(/^@/, '')
    if (!name) return
    setInput('')
    addTarget(name)
    // addTarget may revive a differently-cased cached key (e.g. askvenice → AskVenice).
    const resolved = useXIntelStore.getState().activeTarget
    if (resolved) await gather(resolved)
  }

  return (
    <div className="w-52 shrink-0 border-r border-[var(--color-border-faint)] bg-[var(--color-bg-base)] flex flex-col">
      <div className="p-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') handleAdd() }}
          placeholder={connected ? '+ Add target (@username)' : 'Connect X first'}
          disabled={!connected}
          className="w-full bg-[var(--color-bg-input)] border border-[var(--color-border-faint)] rounded-md px-2 py-1.5 text-[11px] text-[var(--color-text-primary)] outline-none focus:border-[var(--color-border-strong)] transition-colors placeholder:text-[var(--color-text-placeholder)] disabled:cursor-not-allowed disabled:text-[var(--color-text-tertiary)]"
        />
        {error && <p className="text-[10px] text-red-400/70 mt-1 px-0.5">{error}</p>}
      </div>

      <div className="flex-1 overflow-y-auto px-1.5 pb-2">
        {targets.length === 0 ? (
          <div className="px-2 py-5 text-[11px] text-[var(--color-text-tertiary)] text-center">
            Add a target to start gathering intel
            <div className="mt-2 text-[var(--color-text-quaternary)]">e.g. ErikVoorhees · venice_ai</div>
          </div>
        ) : (
          targets.map((t) => {
            const report = reports[t]
            return (
              <div
                key={t}
                className={cn(
                  'group relative flex items-center gap-1.5 px-2 py-[5px] rounded-md text-[11px] cursor-pointer transition-colors',
                  t === activeTarget
                    ? 'text-[var(--color-text-primary)]'
                    : 'text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-border-faint)]',
                )}
                onClick={() => setActiveTarget(t)}
              >
                {t === activeTarget && (
                  <span className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-3.5 rounded-full bg-[var(--color-accent)]" />
                )}
                {report?.profile?.avatarUrl ? (
                  <img src={report.profile.avatarUrl} alt="" className="w-4 h-4 rounded-full shrink-0" />
                ) : (
                  <div className="w-4 h-4 rounded-full bg-[var(--color-bg-raised)] shrink-0" />
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline justify-between gap-1 min-w-0">
                    <span className="truncate">@{t}</span>
                    {(report?.totalCost ?? 0) > 0 && (
                      <span
                        title={`All-time API spend for @${t}`}
                        className={cn(
                          'shrink-0 font-mono tabular-nums text-[9px]',
                          t === activeTarget ? 'text-[var(--color-text-secondary)]' : 'text-[var(--color-text-tertiary)]',
                        )}
                      >
                        ${report!.totalCost.toFixed(3)}
                      </span>
                    )}
                  </div>
                  <div className="text-[9px] text-[var(--color-text-tertiary)]">
                    {busy === t ? 'gathering…' : relativeTime(report?.profile?.gatheredAt)}
                  </div>
                </div>
                <button
                  onClick={(e) => { e.stopPropagation(); handleRemove(t) }}
                  title="Remove from rail"
                  className="opacity-0 group-hover:opacity-100 text-[var(--color-text-tertiary)] hover:text-[var(--color-text-primary)] transition-all shrink-0 p-0.5"
                >
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                </button>
              </div>
            )
          })
        )}
      </div>

      <CostMeter />
    </div>
  )
}
