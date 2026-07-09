import { cn } from '../../lib/utils'

/**
 * Accent band drawn in the gap where a dragged rail row will land.
 * Renders above (`edge="before"`) or below (`edge="after"`) a row without
 * shifting layout, so the pointer half-detection stays stable.
 */
export function RailDropIndicator({ edge }: { edge: 'before' | 'after' }) {
  return (
    <div
      aria-hidden
      className={cn(
        'absolute left-0.5 right-0.5 z-10 pointer-events-none h-3 rounded-md',
        'bg-[var(--color-accent)]/25 border border-dashed border-[var(--color-accent)]/70',
        'shadow-[0_0_12px_2px_color-mix(in_srgb,var(--color-accent)_40%,transparent)]',
        edge === 'before' ? '-top-1.5' : '-bottom-1.5',
      )}
    />
  )
}
