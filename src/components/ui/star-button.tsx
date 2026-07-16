import { cn } from '../../lib/utils'

type StarButtonProps = {
  starred: boolean
  onToggle: () => void
  /** Accessible name of the item (conversation / chat title). */
  label?: string
  className?: string
  size?: number
  /** Override default title tooltip. */
  title?: string
}

/** Compact bookmark toggle (history rows, Alpha cold keep). */
export function StarButton({
  starred,
  onToggle,
  label = 'item',
  className,
  size = 11,
  title,
}: StarButtonProps) {
  const defaultTitle = starred
    ? 'Remove bookmark (allows delete)'
    : 'Bookmark (keeps at top, blocks delete)'

  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation()
        onToggle()
      }}
      title={title ?? defaultTitle}
      aria-label={starred ? `Remove bookmark from ${label}` : `Bookmark ${label}`}
      aria-pressed={starred}
      className={cn(
        'p-1 rounded transition-colors focus-visible:outline focus-visible:outline-1 focus-visible:outline-[var(--color-accent)]',
        starred
          ? 'text-[var(--color-accent)] hover:text-[var(--color-accent)]'
          : 'text-[var(--color-text-tertiary)] hover:text-[var(--color-accent)]',
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
        <path d="M19 21l-7-5-7 5V5a2 2 0 012-2h10a2 2 0 012 2z" />
      </svg>
    </button>
  )
}
