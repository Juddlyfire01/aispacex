import { useCallback, useRef } from 'react'
import { useComposePrefsStore } from '../../stores/compose-prefs-store'

/** Drag handle between chat and draft panes. */
export function DraftSplitHandle() {
  const widthPct = useComposePrefsStore((s) => s.draftDrawerWidthPct)
  const setWidthPct = useComposePrefsStore((s) => s.setDraftDrawerWidthPct)
  const dragging = useRef(false)
  const splitRef = useRef<HTMLDivElement>(null)

  const onPointerMove = useCallback(
    (e: PointerEvent) => {
      if (!dragging.current) return
      const split = splitRef.current?.parentElement
      if (!split) return
      const rect = split.getBoundingClientRect()
      if (rect.width <= 0) return
      // Drawer is on the right — width % from right edge.
      const fromRight = ((rect.right - e.clientX) / rect.width) * 100
      setWidthPct(fromRight)
    },
    [setWidthPct],
  )

  const endDrag = useCallback(() => {
    if (!dragging.current) return
    dragging.current = false
    document.body.style.cursor = ''
    document.body.style.userSelect = ''
    window.removeEventListener('pointermove', onPointerMove)
    window.removeEventListener('pointerup', endDrag)
    window.removeEventListener('pointercancel', endDrag)
  }, [onPointerMove])

  const beginDrag = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      e.preventDefault()
      dragging.current = true
      document.body.style.cursor = 'col-resize'
      document.body.style.userSelect = 'none'
      ;(e.target as HTMLElement).setPointerCapture?.(e.pointerId)
      window.addEventListener('pointermove', onPointerMove)
      window.addEventListener('pointerup', endDrag)
      window.addEventListener('pointercancel', endDrag)
    },
    [onPointerMove, endDrag],
  )

  return (
    <div
      ref={splitRef}
      role="separator"
      aria-orientation="vertical"
      aria-valuenow={Math.round(widthPct)}
      aria-valuemin={25}
      aria-valuemax={75}
      aria-label="Resize draft pane"
      onPointerDown={beginDrag}
      className="group relative w-1.5 shrink-0 cursor-col-resize bg-[var(--color-border-faint)] hover:bg-[var(--color-border-faint)] active:bg-[var(--color-text-quaternary)] transition-colors"
    >
      <div className="absolute inset-y-0 -left-1 -right-1" />
      <div className="pointer-events-none absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 h-8 w-0.5 rounded-full bg-[var(--color-border-faint)] opacity-0 group-hover:opacity-100 transition-opacity" />
    </div>
  )
}
