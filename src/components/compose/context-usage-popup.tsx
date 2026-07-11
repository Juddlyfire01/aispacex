import { useEffect, useRef, type RefObject } from 'react'
import { formatTokens } from '../../lib/utils'
import type { ContextUsageBreakdown } from '../../lib/compose/token-estimate'
import { COMPRESS_THRESHOLD } from '../../lib/compose/token-estimate'

interface ContextUsagePopupProps {
  open: boolean
  onClose: () => void
  breakdown: ContextUsageBreakdown
  /** Anchor element for click-outside (the ring button). */
  anchorRef: RefObject<HTMLElement | null>
}

function formatUsageTokens(n: number): string {
  if (n >= 1000) return `~${formatTokens(n)}`
  return `~${n}`
}

export function ContextUsagePopup({
  open,
  onClose,
  breakdown,
  anchorRef,
}: ContextUsagePopupProps) {
  const panelRef = useRef<HTMLDivElement>(null)
  const { segments, usedTokens, contextLimit, pct, messageCount, coldArchiveCount } = breakdown
  const displayPct = Math.min(Math.round(pct * 100), 999)
  const nearCompress = pct >= COMPRESS_THRESHOLD

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    const onPointer = (e: MouseEvent) => {
      const t = e.target as Node
      if (panelRef.current?.contains(t)) return
      if (anchorRef.current?.contains(t)) return
      onClose()
    }
    document.addEventListener('keydown', onKey)
    document.addEventListener('mousedown', onPointer)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('mousedown', onPointer)
    }
  }, [open, onClose, anchorRef])

  if (!open) return null

  const barTotal = Math.max(usedTokens, 1)
  const copyReport = async () => {
    const lines = [
      `Context Usage — ${displayPct}% full`,
      `${formatUsageTokens(usedTokens)} / ${formatTokens(contextLimit)} tokens`,
      '',
      ...segments.map((s) => `${s.label}: ${formatUsageTokens(s.tokens)}`),
      '',
      `Messages: ${messageCount}`,
      coldArchiveCount > 0 ? `Cold archives: ${coldArchiveCount}` : null,
      nearCompress ? `At/above ${Math.round(COMPRESS_THRESHOLD * 100)}% compress threshold` : null,
    ].filter(Boolean)
    try {
      await navigator.clipboard.writeText(lines.join('\n'))
    } catch {
      /* ignore */
    }
  }

  return (
    <div
      ref={panelRef}
      role="dialog"
      aria-label="Context usage"
      className="absolute bottom-full right-0 mb-2 w-[320px] z-50 rounded-lg border border-white/[0.08] bg-[#1a1a1c] shadow-xl shadow-black/40 overflow-hidden"
    >
      <div className="flex items-center justify-between px-3.5 pt-3 pb-2">
        <h3 className="text-[12px] font-medium text-white/90">Context Usage</h3>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => void copyReport()}
            className="text-[11px] text-white/45 hover:text-white/75 transition-colors"
          >
            Copy report
          </button>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="text-white/40 hover:text-white/70 p-0.5 transition-colors"
          >
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.6">
              <path d="M3 3l6 6M9 3L3 9" strokeLinecap="round" />
            </svg>
          </button>
        </div>
      </div>

      <div className="px-3.5 pb-3 space-y-3">
        <div className="flex items-baseline justify-between gap-3">
          <span
            className={`text-[15px] font-semibold tabular-nums ${
              nearCompress ? 'text-red-400' : displayPct >= 85 ? 'text-amber-400' : 'text-white/90'
            }`}
          >
            {displayPct}% Full
          </span>
          <span className="text-[11px] font-mono tabular-nums text-white/40">
            {formatUsageTokens(usedTokens)} / {formatTokens(contextLimit)} Tokens
          </span>
        </div>

        {/* Segmented usage bar — filled width = % of context; colors = share of used. */}
        <div className="h-2 w-full rounded-full bg-white/[0.06] overflow-hidden">
          <div
            className="h-full flex min-w-0"
            style={{ width: `${Math.min(Math.max(pct, 0), 1) * 100}%` }}
          >
            {segments.map((s) => (
              <div
                key={s.id}
                title={`${s.label}: ${formatUsageTokens(s.tokens)}`}
                className="h-full first:rounded-l-full last:rounded-r-full"
                style={{
                  width: `${(s.tokens / barTotal) * 100}%`,
                  backgroundColor: s.color,
                  minWidth: s.tokens > 0 ? 2 : 0,
                }}
              />
            ))}
          </div>
        </div>

        <ul className="space-y-1.5">
          {segments.map((s) => (
            <li key={s.id} className="flex items-center gap-2 text-[11px]">
              <span
                className="w-2 h-2 rounded-[2px] shrink-0"
                style={{ backgroundColor: s.color }}
                aria-hidden
              />
              <span className="text-white/55 flex-1 min-w-0 truncate">{s.label}</span>
              <span className="font-mono tabular-nums text-white/70 shrink-0">
                {formatUsageTokens(s.tokens)}
              </span>
            </li>
          ))}
        </ul>
      </div>

      <div className="flex items-center justify-between gap-2 px-3.5 py-2 border-t border-white/[0.06] text-[10px] text-white/35">
        <span>
          {messageCount} message{messageCount === 1 ? '' : 's'}
          {coldArchiveCount > 0
            ? ` · ${coldArchiveCount} cold archive${coldArchiveCount === 1 ? '' : 's'}`
            : ''}
        </span>
        <span className="tabular-nums">
          Compress ≥{Math.round(COMPRESS_THRESHOLD * 100)}%
        </span>
      </div>
    </div>
  )
}
