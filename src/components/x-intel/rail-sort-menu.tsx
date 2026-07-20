import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { computeFloatingRect } from '../../lib/floating-panel'
import { cn } from '../../lib/utils'

const MENU_WIDTH = 220

export type RailSortKey = 'manual' | 'followers' | 'recent' | 'name' | 'cost'

export const RAIL_SORT_OPTIONS: { key: RailSortKey; label: string; hint: string }[] = [
  { key: 'manual', label: 'Manual', hint: 'Drag to reorder' },
  { key: 'followers', label: 'Followers', hint: 'Most first' },
  { key: 'recent', label: 'Recently updated', hint: 'Newest first' },
  { key: 'name', label: 'Name', hint: 'A → Z' },
  { key: 'cost', label: 'API spend', hint: 'Highest first' },
]

/** Sort glyph (bars, descending). */
function SortIcon({ className }: { className?: string }) {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden className={className}>
      <line x1="4" y1="7" x2="20" y2="7" />
      <line x1="6" y1="12" x2="18" y2="12" />
      <line x1="9" y1="17" x2="15" y2="17" />
    </svg>
  )
}

/**
 * Secondary rail control: a full-width "Sort" button that opens its own popover
 * of ordering options. "Manual" keeps the user's drag order; any other key
 * derives the order from gathered report data (and disables drag while active).
 * Dismisses on Escape / outside click.
 */
export function RailSortMenu({
  sortKey,
  onChange,
}: {
  sortKey: RailSortKey
  onChange: (key: RailSortKey) => void
}) {
  const [open, setOpen] = useState(false)
  const [position, setPosition] = useState({ top: 0, left: 0 })
  const anchorRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)

  const reposition = () => {
    const anchor = anchorRef.current
    if (!anchor) return
    const height = panelRef.current?.offsetHeight ?? 220
    setPosition(computeFloatingRect(anchor.getBoundingClientRect(), MENU_WIDTH, height))
  }

  useLayoutEffect(() => {
    if (open) reposition()
  }, [open])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    const onPointer = (e: MouseEvent) => {
      const target = e.target as HTMLElement
      if (!panelRef.current?.contains(target) && !anchorRef.current?.contains(target)) setOpen(false)
    }
    const onViewportChange = () => reposition()
    document.addEventListener('keydown', onKey)
    document.addEventListener('mousedown', onPointer)
    window.addEventListener('resize', onViewportChange)
    window.addEventListener('scroll', onViewportChange, true)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('mousedown', onPointer)
      window.removeEventListener('resize', onViewportChange)
      window.removeEventListener('scroll', onViewportChange, true)
    }
  }, [open])

  const active = sortKey !== 'manual'
  const current = RAIL_SORT_OPTIONS.find((o) => o.key === sortKey)

  return (
    <div className="relative">
      <button
        ref={anchorRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="menu"
        title="Sort the rail"
        className={cn(
          'w-full min-h-9 flex items-center justify-center gap-1.5 rounded-md border px-2.5 py-1.5 text-[11px] font-medium leading-none transition-colors',
          active
            ? 'border-[var(--color-accent)]/40 text-[var(--color-accent)] bg-[var(--color-accent)]/[0.06]'
            : 'border-[var(--color-border-faint)] text-[var(--color-text-tertiary)] hover:text-[var(--color-text-primary)] hover:border-[var(--color-border-strong)]',
        )}
      >
        <SortIcon />
        {active ? current?.label ?? 'Sort' : 'Sort'}
        {active && <span className="w-1.5 h-1.5 rounded-full bg-[var(--color-accent)]" />}
        <svg
          width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor"
          strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"
          className={cn('ml-0.5 transition-transform', open && 'rotate-180')}
          aria-hidden
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {open &&
        createPortal(
          <div
            ref={panelRef}
            role="menu"
            style={{ top: position.top, left: position.left, width: MENU_WIDTH }}
            className="fixed z-[200] p-1.5 rounded-lg border border-[var(--color-border-soft)] bg-[var(--color-bg-input)] shadow-2xl animate-scale-in"
          >
          <div className="px-2 py-1 text-[9px] font-medium uppercase tracking-[0.08em] text-[var(--color-text-quaternary)]">
            Sort by
          </div>
          {RAIL_SORT_OPTIONS.map((opt) => {
            const selected = opt.key === sortKey
            return (
              <button
                key={opt.key}
                type="button"
                role="menuitemradio"
                aria-checked={selected}
                onClick={() => { onChange(opt.key); setOpen(false) }}
                className={cn(
                  'w-full flex items-center gap-2 rounded-md px-2 py-1.5 text-[11px] transition-colors',
                  selected
                    ? 'text-[var(--color-accent)] bg-[var(--color-accent)]/[0.06]'
                    : 'text-[var(--color-text-secondary)] hover:bg-[var(--color-border-faint)] hover:text-[var(--color-text-primary)]',
                )}
              >
                <span className="w-3 shrink-0 text-[var(--color-accent)]">{selected ? '✓' : ''}</span>
                {opt.label}
                <span className="ml-auto text-[10px] text-[var(--color-text-quaternary)]">{opt.hint}</span>
              </button>
            )
          })}
          </div>,
          document.body,
        )}
    </div>
  )
}
