import { cn } from '../../lib/utils'

/**
 * Surface — the single source of truth for elevation in the app.
 *
 * Pick a surface by ROLE, not by color. Each level maps to one rung of the
 * elevation ladder defined in index.css. A floating element must always be
 * exactly one rung above whatever it floats over:
 *
 *   canvas   → L0  page background            (--color-bg-base)
 *   card     → L1  resting surface            (--color-bg-surface)   cards, bubbles
 *   floating → L2  menus / dropdowns / popovers (--color-bg-overlay)
 *   modal    → L3  dialogs                    (--color-bg-modal)
 *
 * Borders scale with elevation so an edge always reads even where fills are close:
 * L1 uses a faint hairline; L2/L3 use a soft border + shadow.
 */
export type SurfaceLevel = 'canvas' | 'card' | 'floating' | 'modal'

const LEVEL_CLASS: Record<SurfaceLevel, string> = {
  canvas: 'bg-[var(--color-bg-base)] border-[var(--color-border-faint)]',
  card: 'bg-[var(--color-bg-surface)] border-[var(--color-border-faint)]',
  floating:
    'bg-[var(--color-bg-overlay)] border-[var(--color-border-soft)] shadow-lg',
  modal:
    'bg-[var(--color-bg-modal)] border-[var(--color-border-soft)] shadow-2xl shadow-black/50',
}

type SurfaceProps<T extends React.ElementType> = {
  level: SurfaceLevel
  as?: T
  bordered?: boolean
  className?: string
  children?: React.ReactNode
} & Omit<React.ComponentPropsWithoutRef<T>, 'as' | 'className' | 'children'>

export function Surface<T extends React.ElementType = 'div'>({
  level,
  as,
  bordered = true,
  className,
  children,
  ...rest
}: SurfaceProps<T>) {
  const Comp = (as ?? 'div') as React.ElementType
  return (
    <Comp
      className={cn(bordered ? 'border' : '', LEVEL_CLASS[level], className)}
      {...rest}
    >
      {children}
    </Comp>
  )
}

/**
 * Bubble — a chat message surface. `me` renders the accent-tinted "your message"
 * variant (--color-bubble-user); otherwise it's a plain L1 resting surface.
 */
export function Bubble({
  me,
  className,
  children,
}: {
  me?: boolean
  className?: string
  children: React.ReactNode
}) {
  return (
    <div
      className={cn(
        'border',
        me
          ? 'bg-[var(--color-bubble-user)] border-[var(--color-border-soft)]'
          : 'bg-[var(--color-bg-surface)] border-[var(--color-border-faint)]',
        className,
      )}
    >
      {children}
    </div>
  )
}
