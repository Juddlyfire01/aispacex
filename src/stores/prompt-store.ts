import { create } from 'zustand'

export interface PromptOptions {
  title: string
  description?: string
  defaultValue?: string
  placeholder?: string
  confirmLabel?: string
  cancelLabel?: string
}

interface PromptRequest extends PromptOptions {
  resolve: (value: string | null) => void
}

interface PromptState {
  request: PromptRequest | null
  open: (opts: PromptOptions) => Promise<string | null>
  settle: (value: string | null) => void
}

export const usePromptStore = create<PromptState>((set, get) => ({
  request: null,
  open: (opts) =>
    new Promise<string | null>((resolve) => {
      const prev = get().request
      if (prev) prev.resolve(null)
      set({
        request: {
          title: opts.title,
          description: opts.description,
          defaultValue: opts.defaultValue ?? '',
          placeholder: opts.placeholder,
          confirmLabel: opts.confirmLabel ?? 'OK',
          cancelLabel: opts.cancelLabel ?? 'Cancel',
          resolve,
        },
      })
    }),
  settle: (value) => {
    const req = get().request
    if (!req) return
    set({ request: null })
    req.resolve(value)
  },
}))

/** Toast-shell text prompt. Resolves entered string on OK, null on Cancel / Esc / backdrop. */
export function promptDialog(opts: PromptOptions): Promise<string | null> {
  return usePromptStore.getState().open(opts)
}
