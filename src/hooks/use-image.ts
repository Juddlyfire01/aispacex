import { useMutation, useQueryClient } from '@tanstack/react-query'
import { venice } from '../lib/venice-client'
import { recordMediaCost } from '../lib/venice/media-cost'
import { chargeAction, assertPaidReady, markActionStart } from '../lib/x402/charge-flow'
import { notifyInsufficientFunds } from '../lib/x402/notify-insufficient'
import type { ImageGenerateRequest, ImageGenerateResponse } from '../types/venice'

export function useImageGenerate() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (req: ImageGenerateRequest) => {
      assertPaidReady()
      const sinceTs = markActionStart()
      const data = await venice<ImageGenerateResponse>('/image/generate', {
        method: 'POST',
        body: JSON.stringify(req),
      })
      const variants = data.images?.length || req.variants || 1
      recordMediaCost(queryClient, 'image', req.model, { variants }, { action: 'image' })
      const charge = await chargeAction('image', { sinceTs })
      if (charge.insufficient) notifyInsufficientFunds(charge)
      return data
    },
  })
}
