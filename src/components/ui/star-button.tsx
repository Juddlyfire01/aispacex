import { cn } from '../../lib/utils'

type StarButtonProps = {
  starred: boolean
  onToggle: () => void
  /** Accessible name of the item (conversation / chat title). */
  label?: string
  className?: string
  size?: number
}

/** Compact star toggle for history rows. */
export function StarButton({
  starred,
  onToggle,
  label = 'chat',
  className,
  size = 11,
}: StarButtonProps) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation()
        onToggle()
      }}
      title={starred ? 'Unstar (allows delete)' : 'Star (pins to top, blocks delete)'}
      aria-label={starred ? `Unstar ${label}` : `Star ${label}`}
      aria-pressed={starred}
      className={cn(
        'p-1 rounded transition-colors focus-visible:outline focus-visible:outline-1 focus-visible:outline-[var(--color-accent)]',
        starred
          ? 'text-amber-300/90 hover:text-amber-200'
          : 'text-[var(--color-text-tertiary)] hover:text-amber-300/80',
        className,
      )}
    >
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill={starred ? 'currentColor' : 'none'}
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
      >
        <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
      </svg>
    </button>
  )
}
