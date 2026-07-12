import { useState, useRef, useLayoutEffect, useEffect, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { computeFloatingRect } from '../../lib/floating-panel'
import { cn } from '../../lib/utils'

const POPOVER_WIDTH = 176
const ITEM_HEIGHT = 34

/** External-link glyph shown on new-tab menu items. */
function ExternalIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 opacity-50">
      <path d="M4.5 2.5H2.5V9.5H9.5V7.5" />
      <path d="M7 2.5H9.5V5" />
      <path d="M9.5 2.5L5.5 6.5" />
    </svg>
  )
}

/** A single menu entry — either an external link (new tab) or an in-app action. */
export type PopoverItem =
  | { kind: 'link'; label: string; href: string }
  | { kind: 'action'; label: string; onClick: () => void; icon?: ReactNode }

/**
 * Reusable inline trigger + anchored popover menu. The trigger renders `label`
 * as an accent-coloured, underline-free clickable; clicking opens a small
 * portalled menu of `items`. Shared by on-chain identity links and @mention
 * links so every inline "click to act" affordance looks and behaves identically.
 *
 * Positioning + dismissal reuse `computeFloatingRect` and the portal +
 * click-outside / Escape / scroll-dismiss pattern from the emoji picker.
 */
export function InlinePopover({
  label,
  title,
  items,
  className,
}: {
  label: ReactNode
  title?: string
  items: PopoverItem[]
  className?: string
}) {
  const [open, setOpen] = useState(false)
  const [position, setPosition] = useState({ top: 0, left: 0 })
  const anchorRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)

  const reposition = () => {
    const anchor = anchorRef.current
    if (!anchor) return
    const height = panelRef.current?.offsetHeight ?? items.length * ITEM_HEIGHT + 8
    setPosition(computeFloatingRect(anchor.getBoundingClientRect(), POPOVER_WIDTH, height))
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
      if (!target.closest('[data-inline-popover]') && !anchorRef.current?.contains(target)) setOpen(false)
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

  const itemCls =
    'flex items-center justify-between gap-2 w-full text-left px-2.5 py-1.5 rounded-md text-[13px] text-white/75 no-underline hover:bg-white/[0.06] hover:text-white transition-colors'

  return (
    <>
      <button
        ref={anchorRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        title={title}
        className={cn(
          'entity-link cursor-pointer break-all',
          className,
        )}
      >
        {label}
      </button>

      {open &&
        createPortal(
          <div
            ref={panelRef}
            data-inline-popover
            style={{ top: position.top, left: position.left, width: POPOVER_WIDTH }}
            className="fixed z-[200] p-1 rounded-lg border border-[var(--color-border-faint)] bg-[var(--color-bg-input)] shadow-2xl animate-scale-in"
          >
            {items.map((item, i) =>
              item.kind === 'link' ? (
                <a
                  key={i}
                  href={item.href}
                  target="_blank"
                  rel="noopener noreferrer nofollow"
                  onClick={() => setOpen(false)}
                  className={itemCls}
                >
                  <span>{item.label}</span>
                  <ExternalIcon />
                </a>
              ) : (
                <button
                  key={i}
                  type="button"
                  onClick={() => {
                    setOpen(false)
                    item.onClick()
                  }}
                  className={itemCls}
                >
                  <span>{item.label}</span>
                  {item.icon ?? <span className="w-[11px]" />}
                </button>
              ),
            )}
          </div>,
          document.body,
        )}
    </>
  )
}
