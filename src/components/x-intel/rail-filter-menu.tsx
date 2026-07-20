import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { computeFloatingRect } from '../../lib/floating-panel'
import { cn } from '../../lib/utils'

const MENU_WIDTH = 200

/** Funnel / filter glyph. */
function FilterIcon({ className }: { className?: string }) {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden className={className}>
      <path d="M3 5h18l-7 8v6l-4-2v-4z" />
    </svg>
  )
}

/**
 * Classic rail filter control: a "Filter" button (funnel icon + label, with a
 * dot when a filter is active) that opens its own small popover of filter
 * options. Currently exposes the "Official only" toggle — accounts that carry
 * an X organization affiliation badge. Dismisses on Escape / outside click.
 */
export function RailFilterMenu({
  officialOnly,
  onToggleOfficial,
  affiliatedCount,
}: {
  officialOnly: boolean
  onToggleOfficial: () => void
  /** Number of affiliated accounts on the rail — shown as a hint. */
  affiliatedCount: number
}) {
  const [open, setOpen] = useState(false)
  const [position, setPosition] = useState({ top: 0, left: 0 })
  const anchorRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)

  const reposition = () => {
    const anchor = anchorRef.current
    if (!anchor) return
    const height = panelRef.current?.offsetHeight ?? 80
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

  const active = officialOnly

  return (
    <div className="relative">
      <button
        ref={anchorRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="menu"
        title="Filter the rail"
        className={cn(
          'w-full min-h-9 flex items-center justify-center gap-1.5 rounded-md border px-2.5 py-1.5 text-[11px] font-medium leading-none transition-colors',
          active
            ? 'border-[var(--color-accent)]/40 text-[var(--color-accent)] bg-[var(--color-accent)]/[0.06]'
            : 'border-[var(--color-border-faint)] text-[var(--color-text-tertiary)] hover:text-[var(--color-text-primary)] hover:border-[var(--color-border-strong)]',
        )}
      >
        <FilterIcon />
        Filter
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
            Filter by
          </div>
          <button
            type="button"
            role="menuitemcheckbox"
            aria-checked={officialOnly}
            onClick={onToggleOfficial}
            disabled={affiliatedCount === 0}
            className={cn(
              'w-full flex items-center gap-2 rounded-md px-2 py-1.5 text-[11px] transition-colors disabled:opacity-40 disabled:cursor-default',
              officialOnly
                ? 'text-[var(--color-accent)] bg-[var(--color-accent)]/[0.06]'
                : 'text-[var(--color-text-secondary)] hover:bg-[var(--color-border-faint)] hover:text-[var(--color-text-primary)]',
            )}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden className="shrink-0 opacity-80">
              <path d="M12 2l2.4 4.9 5.4.8-3.9 3.8.9 5.4-4.8-2.5-4.8 2.5.9-5.4L3.2 7.7l5.4-.8z" />
            </svg>
            Official only
            <span className="ml-auto text-[10px] text-[var(--color-text-tertiary)]">
              {officialOnly ? 'on' : affiliatedCount}
            </span>
          </button>
          </div>,
          document.body,
        )}
    </div>
  )
}
