import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { createPortal } from 'react-dom'
import { computeFloatingRect } from '../../lib/floating-panel'
import { cn } from '../../lib/utils'

const OPEN_DELAY_MS = 200
const PANEL_WIDTH = 240
const PANEL_HEIGHT_ESTIMATE = 52

function computeTooltipRect(
  anchor: DOMRect,
  panelWidth: number,
  panelHeight: number,
  side: 'top' | 'bottom',
): { top: number; left: number } {
  if (side === 'bottom') {
    return computeFloatingRect(anchor, panelWidth, panelHeight)
  }
  const gap = 6
  const padding = 8
  const vw = window.innerWidth
  const vh = window.innerHeight
  let top = anchor.top - panelHeight - gap
  let left = anchor.left + anchor.width / 2 - panelWidth / 2
  if (top < padding) top = anchor.bottom + gap
  if (top + panelHeight > vh - padding) top = Math.max(padding, vh - panelHeight - padding)
  if (left + panelWidth > vw - padding) left = vw - panelWidth - padding
  if (left < padding) left = padding
  return { top, left }
}

/**
 * Short glossary tip on hover/focus. Renders children only when `tip` is empty.
 * Positions via portal so scroll panes do not clip the panel.
 */
export function Tooltip({
  tip,
  children,
  side = 'top',
  className,
  underline = true,
}: {
  tip?: string
  children: ReactNode
  side?: 'top' | 'bottom'
  className?: string
  /** Dotted underline on the trigger — default for metric labels. */
  underline?: boolean
}) {
  const tipId = useId()
  const anchorRef = useRef<HTMLSpanElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const delayRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [open, setOpen] = useState(false)
  const [position, setPosition] = useState({ top: 0, left: 0 })

  const clearDelay = () => {
    if (delayRef.current != null) {
      clearTimeout(delayRef.current)
      delayRef.current = null
    }
  }

  const scheduleOpen = () => {
    clearDelay()
    delayRef.current = setTimeout(() => setOpen(true), OPEN_DELAY_MS)
  }

  const close = () => {
    clearDelay()
    setOpen(false)
  }

  useEffect(() => () => clearDelay(), [])

  const reposition = () => {
    const anchor = anchorRef.current
    if (!anchor) return
    const height = panelRef.current?.offsetHeight ?? PANEL_HEIGHT_ESTIMATE
    const width = Math.min(PANEL_WIDTH, panelRef.current?.offsetWidth || PANEL_WIDTH)
    setPosition(computeTooltipRect(anchor.getBoundingClientRect(), width, height, side))
  }

  useLayoutEffect(() => {
    if (open) reposition()
  }, [open, tip, side])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close()
    }
    const onViewportChange = () => reposition()
    document.addEventListener('keydown', onKey)
    window.addEventListener('resize', onViewportChange)
    window.addEventListener('scroll', onViewportChange, true)
    return () => {
      document.removeEventListener('keydown', onKey)
      window.removeEventListener('resize', onViewportChange)
      window.removeEventListener('scroll', onViewportChange, true)
    }
  }, [open, side])

  if (!tip) return <>{children}</>

  return (
    <>
      <span
        ref={anchorRef}
        tabIndex={0}
        className={cn(
          'inline-flex min-w-0 max-w-full cursor-help outline-none focus-visible:text-[var(--color-accent)]',
          underline && 'border-b border-dotted border-[var(--color-text-tertiary)]',
          className,
        )}
        aria-describedby={open ? tipId : undefined}
        onMouseEnter={scheduleOpen}
        onMouseLeave={close}
        onFocus={scheduleOpen}
        onBlur={close}
      >
        {children}
      </span>

      {open &&
        createPortal(
          <div
            ref={panelRef}
            id={tipId}
            role="tooltip"
            style={{ top: position.top, left: position.left, maxWidth: PANEL_WIDTH }}
            className="fixed z-[200] px-2.5 py-1.5 rounded-md border border-[var(--color-border-soft)] bg-[var(--color-bg-raised)] text-[11px] leading-snug text-[var(--color-text-primary)] pointer-events-none"
          >
            {tip}
          </div>,
          document.body,
        )}
    </>
  )
}
