import { useCallback, useLayoutEffect, useRef, type UIEvent } from 'react'

/**
 * Keep a scroll container's scrollTop stable across React re-renders that
 * rewrite children (e.g. profile refresh merging new posts/metrics). Without
 * this, store updates + focus restoration often jump the pane mid-read.
 *
 * - `resetKey` (account/target id): switching subjects always starts at top.
 * - `anchorKey` (e.g. active report id): intentional content swap (new report
 *   finished, user picked another snapshot) also jumps to top — not a mid-read
 *   restore of a stale offset against a different document height.
 */
export function usePreserveScroll(resetKey?: string | null, anchorKey?: string | null) {
  const ref = useRef<HTMLDivElement>(null)
  const saved = useRef(0)
  // Skip one preserve pass after we deliberately reset to top.
  const skipPreserve = useRef(false)

  useLayoutEffect(() => {
    saved.current = 0
    skipPreserve.current = true
    if (ref.current) ref.current.scrollTop = 0
  }, [resetKey, anchorKey])

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
    if (Math.abs(el.scrollTop - saved.current) > 0.5) {
      el.scrollTop = saved.current
    }
  })

  const onScroll = useCallback((e: UIEvent<HTMLDivElement>) => {
    saved.current = e.currentTarget.scrollTop
  }, [])

  return { ref, onScroll }
}
