import { useEffect, useRef, useState } from 'react'
import { cn } from '../../lib/utils'

/**
 * Collapsed rail control: a single "+ Add" button that opens a popover holding
 * an Add-profile text field and an "Org affiliates" launcher. Dismisses on
 * Escape / outside click. Filtering lives in its own control (RailFilterMenu).
 */
export function RailAddMenu({
  value,
  onChange,
  onSubmit,
  onOpenAffiliates,
  error,
}: {
  value: string
  onChange: (v: string) => void
  onSubmit: () => void
  onOpenAffiliates: () => void
  error?: string | null
}) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!open) return
    const t = requestAnimationFrame(() => inputRef.current?.focus())
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    const onPointer = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('keydown', onKey)
    document.addEventListener('mousedown', onPointer)
    return () => {
      cancelAnimationFrame(t)
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('mousedown', onPointer)
    }
  }, [open])

  const submitAndKeepOpen = () => {
    if (!value.trim()) return
    onSubmit()
    // Leave the popover open so the user can add several in a row.
  }

  const itemCls =
    'w-full flex items-center gap-2 rounded-md px-2 py-1.5 text-[11px] text-white/70 hover:bg-white/[0.06] hover:text-white/90 transition-colors'

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="menu"
        className="w-full min-h-9 flex items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-[11px] font-medium leading-none bg-[var(--color-btn-primary-bg)] text-[var(--color-btn-primary-fg)] hover:opacity-90 transition-opacity focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--color-accent)] focus-visible:outline-offset-2"
      >
        + Add
        <svg
          width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor"
          strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"
          className={cn('transition-transform', open && 'rotate-180')}
          aria-hidden
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {open && (
        <div
          role="menu"
          className="absolute left-0 right-0 top-full mt-1.5 z-50 p-1.5 rounded-lg border border-[var(--color-border-soft)] bg-[var(--color-bg-input)] shadow-2xl animate-scale-in space-y-1"
        >
          <input
            ref={inputRef}
            type="text"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); submitAndKeepOpen() } }}
            placeholder="Add profile (@username)"
            aria-label="Add profile"
            autoComplete="off"
            spellCheck={false}
            className="w-full bg-[var(--color-bg-base)] border border-[var(--color-border-faint)] rounded-md px-2 py-1.5 text-[11px] text-[var(--color-text-primary)] outline-none focus:border-[var(--color-border-strong)] transition-colors placeholder:text-[var(--color-text-placeholder)]"
          />
          {error && <p className="text-[10px] text-red-400/70 px-0.5">{error}</p>}

          <button
            type="button"
            role="menuitem"
            onClick={() => { setOpen(false); onOpenAffiliates() }}
            className={itemCls}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden className="shrink-0 opacity-70">
              <path d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z" />
            </svg>
            Org affiliates
          </button>
        </div>
      )}
    </div>
  )
}
