import { cn } from '../../lib/utils'

/**
 * Thin accent line in the gap where a dragged rail row will land.
 * Mirrors the active-profile vertical bar — same color, horizontal.
 * Renders above (`edge="before"`) or below (`edge="after"`) without shifting layout.
 */
export function RailDropIndicator({ edge }: { edge: 'before' | 'after' }) {
  return (
    <div
      aria-hidden
      className={cn(
        'absolute left-1.5 right-1.5 z-10 pointer-events-none h-0.5 rounded-full bg-[var(--color-accent)]',
        edge === 'before' ? '-top-px' : '-bottom-px',
      )}
    />
  )
}
