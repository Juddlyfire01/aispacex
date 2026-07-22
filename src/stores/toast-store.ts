import { create } from 'zustand'
import { VeniceAPIError } from '../lib/venice-client'

export type ToastVariant = 'info' | 'success' | 'error' | 'progress'

export interface Toast {
  id: number
  variant: ToastVariant
  title: string
  description?: string
  action?: { label: string; onClick: () => void }
  duration: number
  /** 0–1 determinate progress; only meaningful for variant `progress`. */
  progress?: number
  /** Secondary line under the bar, e.g. "Step 2 of 3 · Writing narrative". */
  progressLabel?: string
  /**
   * Raw error text offered via a "Copy error" control. When omitted on an
   * error toast, the toaster falls back to copying the description.
   */
  copyError?: string
}

export type ToastUpdate = Partial<
  Pick<
    Toast,
    | 'variant'
    | 'title'
    | 'description'
    | 'action'
    | 'duration'
    | 'progress'
    | 'progressLabel'
    | 'copyError'
  >
>

interface ToastState {
  toasts: Toast[]
  push: (t: Omit<Toast, 'id' | 'duration'> & { duration?: number }) => number
  update: (id: number, patch: ToastUpdate) => void
  dismiss: (id: number) => void
}

let counter = 0
const dismissTimers = new Map<number, ReturnType<typeof setTimeout>>()
/** Keep the bottom-right stack from climbing the viewport. */
const MAX_TOASTS = 3

function clearDismissTimer(id: number) {
  const t = dismissTimers.get(id)
  if (t !== undefined) {
    clearTimeout(t)
    dismissTimers.delete(id)
  }
}

function scheduleDismiss(id: number, duration: number) {
  clearDismissTimer(id)
  if (duration <= 0) return
  const timer = setTimeout(() => {
    dismissTimers.delete(id)
    useToastStore.setState((s) => ({ toasts: s.toasts.filter((x) => x.id !== id) }))
  }, duration)
  dismissTimers.set(id, timer)
}

export const useToastStore = create<ToastState>((set, get) => ({
  toasts: [],
  push: ({ duration = 4500, ...t }) => {
    const id = ++counter
    set((s) => {
      const next = [...s.toasts, { ...t, id, duration }]
      // Variant-aware eviction: never drop a live `progress` toast to satisfy the
      // cap. Dropping one orphans a running job — its bar vanishes and the later
      // complete()/fail() update() becomes a silent no-op (lost result/error).
      // Evict the oldest auto-dismissable toast instead; if every toast is a live
      // job, let the stack temporarily exceed MAX_TOASTS (they resolve on their own).
      while (next.length > MAX_TOASTS) {
        const idx = next.findIndex((x) => x.variant !== 'progress')
        if (idx === -1) break
        const [dropped] = next.splice(idx, 1)
        clearDismissTimer(dropped.id)
      }
      return { toasts: next }
    })
    scheduleDismiss(id, duration)
    return id
  },
  update: (id, patch) => {
    const existing = get().toasts.find((t) => t.id === id)
    if (!existing) return
    const nextDuration = patch.duration !== undefined ? patch.duration : existing.duration
    set((s) => ({
      toasts: s.toasts.map((t) => (t.id === id ? { ...t, ...patch, duration: nextDuration } : t)),
    }))
    if (patch.duration !== undefined) {
      scheduleDismiss(id, nextDuration)
    }
  },
  dismiss: (id) => {
    clearDismissTimer(id)
    set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }))
  },
}))

export const toast = {
  info: (title: string, description?: string) =>
    useToastStore.getState().push({ variant: 'info', title, description }),
  success: (title: string, description?: string, action?: Toast['action']) =>
    useToastStore.getState().push({
      variant: 'success',
      title,
      description,
      action,
      duration: action ? 6500 : 4500,
    }),
  error: (
    title: string,
    description?: string,
    action?: Toast['action'],
    copyError?: string,
  ) =>
    useToastStore
      .getState()
      .push({ variant: 'error', title, description, action, copyError, duration: 6500 }),
  /**
   * Generation-suite (and general) API failure toast. Human description prefers
   * Zod issues → message → code → status fallback; Copy error includes status,
   * code, issues, and stack for debugging.
   */
  fromError: (err: unknown, title = 'Something went wrong') => {
    return useToastStore.getState().push({
      variant: 'error',
      title,
      description: humanErrorDescription(err),
      copyError: debugErrorText(err),
      duration: 6500,
    })
  },
  /** Alias of fromError — same uniform generation-suite error surface. */
  generationError: (err: unknown, title: string) => toast.fromError(err, title),
  /**
   * Long-running job toast. Does not auto-dismiss until complete/fail
   * (or the user closes it). Returns an id for update/complete/fail.
   */
  progress: (
    title: string,
    opts?: { description?: string; progress?: number; progressLabel?: string },
  ) =>
    useToastStore.getState().push({
      variant: 'progress',
      title,
      description: opts?.description,
      progress: opts?.progress ?? 0,
      progressLabel: opts?.progressLabel,
      duration: 0,
    }),
  /** Merge fields onto an existing toast. No-op if the toast was dismissed. */
  update: (id: number, patch: ToastUpdate) => useToastStore.getState().update(id, patch),
  /** Turn a progress toast into a success toast that auto-dismisses. */
  complete: (id: number, title: string, description?: string) =>
    useToastStore.getState().update(id, {
      variant: 'success',
      title,
      description,
      progress: 1,
      progressLabel: 'Complete',
      duration: 4500,
    }),
  /** Turn a progress toast into an error toast that auto-dismisses. */
  fail: (id: number, title: string, description?: string, copyError?: string) =>
    useToastStore.getState().update(id, {
      variant: 'error',
      title,
      description,
      copyError,
      progress: 1,
      progressLabel: 'Failed',
      // Longer so multi-line failure reasons stay readable.
      duration: 12_000,
    }),
  /** Remove a toast immediately (e.g. abandon a progress toast without success/fail). */
  dismiss: (id: number) => useToastStore.getState().dismiss(id),
}

/** User-facing toast description — actionable, never bare `HTTP 400`. */
export function humanErrorDescription(err: unknown): string | undefined {
  if (err instanceof VeniceAPIError) {
    if (err.issues && err.issues.length > 0) return err.issues.join(' · ')
    if (err.message && !/^HTTP \d+$/.test(err.message)) return err.message
    if (err.code) return err.code
    if (err.status > 0) return `Request rejected (${err.status})`
    return err.message || undefined
  }
  if (err instanceof Error) return err.message
  if (typeof err === 'string') return err
  return undefined
}

/** Structured debug payload for the toaster "Copy error" control. */
export function debugErrorText(err: unknown): string | undefined {
  if (err instanceof VeniceAPIError) {
    const lines = [`message: ${err.message}`, `status: ${err.status}`]
    if (err.code) lines.push(`code: ${err.code}`)
    if (err.issues && err.issues.length > 0) {
      lines.push('issues:')
      for (const issue of err.issues) lines.push(`  - ${issue}`)
    }
    if (err.suggestedPrompt) lines.push(`suggestedPrompt: ${err.suggestedPrompt}`)
    if (err.stack?.trim()) {
      lines.push('')
      lines.push(err.stack.trim())
    }
    return lines.join('\n')
  }
  return rawErrorText(err)
}

/** Full error text (message + stack) for non-Venice errors. */
function rawErrorText(err: unknown): string | undefined {
  if (err instanceof Error) {
    return err.stack?.trim() || err.message
  }
  if (typeof err === 'string') return err
  if (err == null) return undefined
  try {
    return JSON.stringify(err, null, 2)
  } catch {
    return String(err)
  }
}
