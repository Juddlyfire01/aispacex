import { useEffect, useId, useRef, useState } from 'react'
import { usePromptStore } from '../../stores/prompt-store'
import {
  DIALOG_SHELL,
  dialogCancelBtnClass,
  dialogConfirmBtnClass,
} from './confirm-dialog'
import { cn } from '../../lib/utils'

/**
 * Global prompt host — toaster-shaped card with a text field.
 */
export function PromptDialogHost() {
  const request = usePromptStore((s) => s.request)
  const settle = usePromptStore((s) => s.settle)
  const titleId = useId()
  const inputRef = useRef<HTMLInputElement>(null)
  const [value, setValue] = useState('')

  useEffect(() => {
    if (!request) return
    setValue(request.defaultValue ?? '')
    // Focus after paint so the input is mounted.
    const t = requestAnimationFrame(() => inputRef.current?.focus())
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        settle(null)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => {
      cancelAnimationFrame(t)
      window.removeEventListener('keydown', onKey)
    }
  }, [request, settle])

  if (!request) return null

  const submit = () => settle(value.trim() ? value.trim() : value)

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center" role="presentation">
      <button
        type="button"
        aria-label="Dismiss"
        className="absolute inset-0 bg-black/70"
        onClick={() => settle(null)}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={cn(DIALOG_SHELL, 'min-h-[7.5rem]')}
        onClick={(e) => e.stopPropagation()}
      >
        <div id={titleId} className="truncate text-[13.5px] font-medium text-[var(--color-accent)]">
          {request.title}
        </div>
        <div className="mt-0.5 min-h-[1.25rem] text-[12.5px] leading-relaxed text-[var(--color-text-secondary)] break-words">
          {request.description ?? '\u00a0'}
        </div>
        <div className="mt-2">
          <input
            ref={inputRef}
            type="url"
            value={value}
            placeholder={request.placeholder ?? 'https://'}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                submit()
              }
            }}
            className="w-full rounded-md border border-[var(--color-border-soft)] bg-[var(--color-bg-base)] px-2.5 py-1.5 text-[12.5px] text-[var(--color-text-primary)] outline-none placeholder:text-[var(--color-text-placeholder)] focus:border-[var(--color-border-strong)]"
          />
        </div>
        <div className="mt-2 flex h-[1.125rem] items-center justify-end gap-3">
          <button type="button" className={dialogCancelBtnClass} onClick={() => settle(null)}>
            {request.cancelLabel}
          </button>
          <button type="button" className={dialogConfirmBtnClass} onClick={submit}>
            {request.confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
