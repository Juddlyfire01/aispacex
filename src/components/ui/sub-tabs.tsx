import { cn } from '../../lib/utils'

interface TabItem<T extends string> {
  id: T
  label: string
}

/** Page-level tabs — underline on active, no pill fill (X Lights Out style). */
export function SubTabs<T extends string>({
  tabs,
  value,
  onChange,
  className,
  size = 'md',
}: {
  tabs: TabItem<T>[]
  value: T
  onChange: (id: T) => void
  className?: string
  size?: 'sm' | 'md'
}) {
  return (
    <div className={cn('flex items-center gap-0 shrink-0 bg-[var(--color-bg-base)] border-b border-[var(--color-border-faint)]', className)}>
      {tabs.map(({ id, label }) => (
        <button
          key={id}
          type="button"
          onClick={() => onChange(id)}
          className={cn(
            'font-medium -mb-px border-b-2 transition-colors duration-150',
            size === 'sm' ? 'text-[11px] px-3 py-2.5' : 'text-[13px] px-3 py-2.5',
            value === id
              ? 'text-[var(--color-text-primary)] border-[var(--color-accent)]'
              : 'text-[var(--color-text-secondary)] border-transparent hover:text-[var(--color-text-primary)]',
          )}
        >
          {label}
        </button>
      ))}
    </div>
  )
}

/** In-form mode switcher — bordered group, raised surface on active (no white flash). */
export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  className,
  size = 'md',
}: {
  options: readonly (readonly [T, string])[]
  value: T
  onChange: (id: T) => void
  className?: string
  size?: 'sm' | 'md'
}) {
  return (
    <div className={cn('flex gap-px rounded-lg p-0.5 bg-[var(--color-bg-base)] border border-[var(--color-border-soft)]', className)}>
      {options.map(([id, label]) => (
        <button
          key={id}
          type="button"
          onClick={() => onChange(id)}
          className={cn(
            'flex-1 font-medium rounded-md transition-colors duration-150',
            size === 'sm' ? 'text-[11px] px-2 py-1.5' : 'text-[13px] px-2.5 py-2',
            value === id
              ? 'bg-[var(--color-bg-raised)] text-[var(--color-text-primary)]'
              : 'text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]',
          )}
        >
          {label}
        </button>
      ))}
    </div>
  )
}
