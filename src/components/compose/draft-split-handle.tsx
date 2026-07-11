import { useCallback, useEffect, useRef } from 'react'
import { useComposeStore } from '../../stores/compose-store'

/** Drag handle between chat and draft panes. */
export function DraftSplitHandle() {
  const widthPct = useComposeStore((s) => s.draftDrawerWidthPct)
  const setWidthPct = useComposeStore((s) => s.setDraftDrawerWidthPct)
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
  }, [])

  useEffect(() => {
    window.addEventListener('pointermove', onPointerMove)
    window.addEventListener('pointerup', endDrag)
    window.addEventListener('pointercancel', endDrag)
    return () => {
      window.removeEventListener('pointermove', onPointerMove)
      window.removeEventListener('pointerup', endDrag)
      window.removeEventListener('pointercancel', endDrag)
    }
  }, [onPointerMove, endDrag])

  return (
    <div
      ref={splitRef}
      role="separator"
      aria-orientation="vertical"
      aria-valuenow={Math.round(widthPct)}
      aria-valuemin={25}
      aria-valuemax={75}
      aria-label="Resize draft pane"
      onPointerDown={(e) => {
        e.preventDefault()
        dragging.current = true
        document.body.style.cursor = 'col-resize'
        document.body.style.userSelect = 'none'
        ;(e.target as HTMLElement).setPointerCapture?.(e.pointerId)
      }}
      className="group relative w-1.5 shrink-0 cursor-col-resize bg-[var(--color-border-faint)] hover:bg-white/20 active:bg-white/30 transition-colors"
    >
      <div className="absolute inset-y-0 -left-1 -right-1" />
      <div className="pointer-events-none absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 h-8 w-0.5 rounded-full bg-white/25 opacity-0 group-hover:opacity-100 transition-opacity" />
    </div>
  )
}
