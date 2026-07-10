import { create } from 'zustand'

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
}

export type ToastUpdate = Partial<
  Pick<Toast, 'variant' | 'title' | 'description' | 'action' | 'duration' | 'progress' | 'progressLabel'>
>

interface ToastState {
  toasts: Toast[]
  push: (t: Omit<Toast, 'id' | 'duration'> & { duration?: number }) => number
  update: (id: number, patch: ToastUpdate) => void
  dismiss: (id: number) => void
}

let counter = 0
const dismissTimers = new Map<number, ReturnType<typeof setTimeout>>()

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
    set((s) => ({ toasts: [...s.toasts, { ...t, id, duration }] }))
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
  success: (title: string, description?: string) =>
    useToastStore.getState().push({ variant: 'success', title, description }),
  error: (title: string, description?: string, action?: Toast['action']) =>
    useToastStore.getState().push({ variant: 'error', title, description, action, duration: 6500 }),
  fromError: (err: unknown, title = 'Something went wrong') => {
    const description = err instanceof Error ? err.message : typeof err === 'string' ? err : undefined
    return useToastStore.getState().push({ variant: 'error', title, description, duration: 6500 })
  },
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
      progressLabel: undefined,
      duration: 4500,
    }),
  /** Turn a progress toast into an error toast that auto-dismisses. */
  fail: (id: number, title: string, description?: string) =>
    useToastStore.getState().update(id, {
      variant: 'error',
      title,
      description,
      progress: undefined,
      progressLabel: undefined,
      duration: 6500,
    }),
}
