import { create } from 'zustand'

export interface ConfirmOptions {
  title: string
  description?: string
  confirmLabel?: string
  cancelLabel?: string
  /** Red title + danger confirm styling. */
  danger?: boolean
}

interface ConfirmRequest extends ConfirmOptions {
  resolve: (ok: boolean) => void
}

interface ConfirmState {
  request: ConfirmRequest | null
  open: (opts: ConfirmOptions) => Promise<boolean>
  settle: (ok: boolean) => void
}

export const useConfirmStore = create<ConfirmState>((set, get) => ({
  request: null,
  open: (opts) =>
    new Promise<boolean>((resolve) => {
      // Replace any in-flight confirm (rare); prior promise resolves false.
      const prev = get().request
      if (prev) prev.resolve(false)
      set({
        request: {
          title: opts.title,
          description: opts.description,
          confirmLabel: opts.confirmLabel ?? 'Confirm',
          cancelLabel: opts.cancelLabel ?? 'Cancel',
          danger: opts.danger ?? false,
          resolve,
        },
      })
    }),
  settle: (ok) => {
    const req = get().request
    if (!req) return
    set({ request: null })
    req.resolve(ok)
  },
}))

/** Toast-shell confirm. Resolves true on Confirm, false on Cancel / Esc / backdrop. */
export function confirmDialog(opts: ConfirmOptions): Promise<boolean> {
  return useConfirmStore.getState().open(opts)
}
