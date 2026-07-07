import { cn } from '../../lib/utils'

export function PanelToggleIcon({ className }: { className?: string }) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <path d="M9 3v18" />
    </svg>
  )
}

export function PanelToggleButton({
  expanded,
  onClick,
  label,
  className,
}: {
  expanded: boolean
  onClick: () => void
  label?: string
  className?: string
}) {
  const ariaLabel = label ?? (expanded ? 'Collapse panel' : 'Expand panel')
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={ariaLabel}
      aria-expanded={expanded}
      title={ariaLabel}
      className={cn(
        'text-[var(--color-text-tertiary)] hover:text-[var(--color-text-primary)] transition-colors p-1 rounded-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--color-accent)] focus-visible:outline-offset-2',
        className,
      )}
    >
      <PanelToggleIcon />
    </button>
  )
}
