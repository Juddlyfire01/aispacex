import type { ReactNode } from 'react'
import { cn } from '../../lib/utils'

export type CheckboxTick = 'accent' | 'muted'
export type CheckboxSize = 'sm' | 'md'

const BOX_SIZE: Record<CheckboxSize, string> = {
  sm: 'w-3 h-3',
  md: 'w-3.5 h-3.5',
}

const ICON_SIZE: Record<CheckboxSize, string> = {
  sm: 'w-2.5 h-2.5',
  md: 'w-3 h-3',
}

export interface CheckboxProps {
  checked: boolean
  onChange: (checked: boolean) => void
  tick?: CheckboxTick
  size?: CheckboxSize
  disabled?: boolean
  id?: string
  'aria-label'?: string
  inputClassName?: string
  boxClassName?: string
}

/** Custom-styled checkbox (feed-style). Pair with a parent `<label>` or use `CheckboxField`. */
export function Checkbox({
  checked,
  onChange,
  tick = 'accent',
  size = 'sm',
  disabled,
  id,
  'aria-label': ariaLabel,
  inputClassName,
  boxClassName,
}: CheckboxProps) {
  return (
    <>
      <input
        id={id}
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        disabled={disabled}
        aria-label={ariaLabel}
        className={cn('peer sr-only', inputClassName)}
      />
      <span
        aria-hidden
        className={cn(
          BOX_SIZE[size],
          'shrink-0 rounded-sm border border-[var(--color-border-strong)] bg-[var(--color-bg-input)]',
          'flex items-center justify-center',
          'peer-checked:border-white/20 peer-checked:bg-white/[0.08]',
          'peer-focus-visible:outline-2 peer-focus-visible:outline-[var(--color-accent-soft)] peer-focus-visible:outline-offset-1',
          'peer-disabled:opacity-40',
          'peer-checked:[&_svg]:opacity-100',
          boxClassName,
        )}
      >
        <svg
          viewBox="0 0 12 12"
          fill="none"
          className={cn(
            ICON_SIZE[size],
            'opacity-0',
            tick === 'accent' ? 'text-[var(--color-accent)]' : 'text-white/55',
          )}
        >
          <path
            d="M2 6.5 5 9.5 10 3.5"
            stroke="currentColor"
            strokeWidth="1.75"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </span>
    </>
  )
}

export interface CheckboxFieldProps extends Omit<CheckboxProps, 'aria-label'> {
  label: ReactNode
  className?: string
  labelClassName?: string
  title?: string
}

/** Checkbox with an inline text label. */
export function CheckboxField({
  label,
  className,
  labelClassName,
  title,
  ...checkbox
}: CheckboxFieldProps) {
  return (
    <label
      title={title}
      className={cn(
        'flex items-center gap-1.5 cursor-pointer select-none',
        checkbox.disabled && 'opacity-50 cursor-not-allowed',
        className,
      )}
    >
      <Checkbox {...checkbox} />
      <span className={labelClassName}>{label}</span>
    </label>
  )
}
