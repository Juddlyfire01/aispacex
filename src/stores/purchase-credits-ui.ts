import { create } from 'zustand'

/** Global open state for the Purchase credits modal (Connections strip, Settings, insufficient funds). */
interface PurchaseCreditsUiState {
  open: boolean
  openPurchase: () => void
  closePurchase: () => void
}

export const usePurchaseCreditsUi = create<PurchaseCreditsUiState>((set) => ({
  open: false,
  openPurchase: () => set({ open: true }),
  closePurchase: () => set({ open: false }),
}))
