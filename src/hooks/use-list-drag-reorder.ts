import { useCallback, useRef, useState, type DragEvent, type MouseEvent } from 'react'

/**
 * HTML5 drag-and-drop helpers for reordering a vertical list of rail rows.
 * Tracks an insertion gap (0..length) so the UI can highlight the slot the
 * item will drop into. Click-to-select still works: a completed reorder
 * suppresses the subsequent click.
 */
export function useListDragReorder(
  itemCount: number,
  onReorder: (fromIndex: number, toIndex: number) => void,
) {
  const dragFrom = useRef<number | null>(null)
  const suppressClick = useRef(false)
  const [draggingIndex, setDraggingIndex] = useState<number | null>(null)
  /** Gap index the dragged item will insert into (0 = before first, length = after last). */
  const [insertIndex, setInsertIndex] = useState<number | null>(null)

  const clearDrag = useCallback(() => {
    dragFrom.current = null
    setDraggingIndex(null)
    setInsertIndex(null)
  }, [])

  /** Convert a gap index into the destination index for moveItemInArray. */
  const gapToDestination = useCallback((from: number, gap: number): number | null => {
    // Dropping into the gaps adjacent to the dragged item is a no-op.
    if (gap === from || gap === from + 1) return null
    return from < gap ? gap - 1 : gap
  }, [])

  const updateInsertFromPointer = useCallback((e: DragEvent, index: number) => {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
    const mid = rect.top + rect.height / 2
    const gap = e.clientY < mid ? index : index + 1
    setInsertIndex((prev) => (prev === gap ? prev : gap))
  }, [])

  const getItemProps = useCallback(
    (index: number) => ({
      draggable: true as const,
      onDragStart: (e: DragEvent) => {
        // Don't start a row drag from action buttons (compose, remove, etc.).
        const target = e.target as HTMLElement
        if (target.closest('button, a, input, textarea, select')) {
          e.preventDefault()
          return
        }
        dragFrom.current = index
        setDraggingIndex(index)
        setInsertIndex(index)
        suppressClick.current = false
        e.dataTransfer.effectAllowed = 'move'
        e.dataTransfer.setData('text/plain', String(index))
      },
      onDragOver: (e: DragEvent) => {
        if (dragFrom.current === null) return
        e.preventDefault()
        e.dataTransfer.dropEffect = 'move'
        updateInsertFromPointer(e, index)
      },
      onDrop: (e: DragEvent) => {
        e.preventDefault()
        e.stopPropagation()
        const from = dragFrom.current
        const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
        const mid = rect.top + rect.height / 2
        const gap = e.clientY < mid ? index : index + 1
        clearDrag()
        if (from === null) return
        const to = gapToDestination(from, gap)
        if (to === null) return
        suppressClick.current = true
        onReorder(from, to)
      },
      onDragEnd: () => {
        clearDrag()
      },
      onClickCapture: (e: MouseEvent) => {
        if (!suppressClick.current) return
        suppressClick.current = false
        e.preventDefault()
        e.stopPropagation()
      },
    }),
    [clearDrag, gapToDestination, onReorder, updateInsertFromPointer],
  )

  /**
   * Whether to paint the drop slot before `index` (or after the last item when
   * index === itemCount). Hides no-op slots next to the dragged row.
   */
  const showDropSlot = useCallback(
    (gapIndex: number): boolean => {
      if (draggingIndex === null || insertIndex === null) return false
      if (insertIndex !== gapIndex) return false
      if (gapIndex === draggingIndex || gapIndex === draggingIndex + 1) return false
      if (gapIndex < 0 || gapIndex > itemCount) return false
      return true
    },
    [draggingIndex, insertIndex, itemCount],
  )

  return { getItemProps, draggingIndex, insertIndex, showDropSlot }
}
