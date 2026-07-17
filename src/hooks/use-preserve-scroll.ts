import { useCallback, useLayoutEffect, useRef, type UIEvent } from 'react'

/**
 * Keep a scroll container's scrollTop stable across React re-renders that
 * rewrite children (e.g. profile refresh merging new posts/metrics). Without
 * this, store updates + focus restoration often jump the pane mid-read.
 *
 * - `resetKey` (account/target id): switching subjects always starts at top.
 * - `anchorKey` (e.g. active report id): a content swap (new report finished,
 *   user picked another snapshot) does NOT jump — it freezes the current scroll
 *   position and skips the stale-offset restore for that render, so a report
 *   finishing while the user reads mid-page never yanks the pane to the top.
 *
 * Under CSS `zoom` (interface scale 90%/125%), browsers snap scrollTop to
 * fractional device pixels. Naively writing scrollTop every commit then fighting
 * that snap causes an infinite layout loop (fan spin, frozen tab). We accept the
 * post-write snapped value as truth, ignore programmatic scroll events, and use
 * a 1px threshold so subpixel noise cannot re-trigger a write.
 */
export function usePreserveScroll(resetKey?: string | null, anchorKey?: string | null) {
  const ref = useRef<HTMLDivElement>(null)
  const saved = useRef(0)
  // Skip one preserve pass after a deliberate reset / content swap.
  const skipPreserve = useRef(false)
  // True while we assign scrollTop so onScroll does not clobber `saved`.
  const restoring = useRef(false)

  // Switching subjects starts at the top.
  useLayoutEffect(() => {
    saved.current = 0
    skipPreserve.current = true
    const el = ref.current
    if (!el) return
    restoring.current = true
    el.scrollTop = 0
    restoring.current = false
  }, [resetKey])

  // A content swap (active report changed) must not jump: keep the user where
  // they are and skip one stale-offset restore against the new document height.
  useLayoutEffect(() => {
    const el = ref.current
    skipPreserve.current = true
    if (el) saved.current = el.scrollTop
  }, [anchorKey])

  // After every paint that might have reset scroll (data rewrite, focus scroll),
  // put the user back where they were — unless we just reset for a new subject/report.
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    if (skipPreserve.current) {
      skipPreserve.current = false
      saved.current = el.scrollTop
      return
    }
    const current = el.scrollTop
    const target = saved.current
    // 1px: zoom/subpixel noise is typically ≪1; fighting it loops forever.
    if (Math.abs(current - target) < 1) return
    restoring.current = true
    el.scrollTop = target
    // Accept the browser's snapped value so the next commit does not fight again.
    saved.current = el.scrollTop
    restoring.current = false
  })

  const onScroll = useCallback((e: UIEvent<HTMLDivElement>) => {
    if (restoring.current) return
    saved.current = e.currentTarget.scrollTop
  }, [])

  return { ref, onScroll }
}
