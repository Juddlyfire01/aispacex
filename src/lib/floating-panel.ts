/** Viewport-aware fixed coordinates for a panel anchored to a trigger element. */
export function computeFloatingRect(
  anchor: DOMRect,
  panelWidth: number,
  panelHeight: number,
  gap = 6,
  padding = 8,
  viewport?: { width: number; height: number },
): { top: number; left: number } {
  const vw = viewport?.width ?? window.innerWidth
  const vh = viewport?.height ?? window.innerHeight

  let top = anchor.bottom + gap
  let left = anchor.left

  if (top + panelHeight > vh - padding) {
    top = anchor.top - panelHeight - gap
  }
  if (top < padding) top = padding

  if (left + panelWidth > vw - padding) {
    left = anchor.right - panelWidth
  }
  if (left < padding) left = padding

  return { top, left }
}

export const EMOJI_PICKER_WIDTH = 352

/** Upper bound before layout; actual height is measured after render. */
export const EMOJI_PICKER_HEIGHT_ESTIMATE = 300
