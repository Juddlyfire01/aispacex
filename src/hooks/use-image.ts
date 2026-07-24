import { useMutation, useQueryClient } from '@tanstack/react-query'
import { blobFromBase64, mimeFromBase64 } from '../lib/media-blob'
import { persistGeneratedMedia } from '../lib/media-gallery-persist'
import { venice } from '../lib/venice-client'
import { recordMediaCost } from '../lib/venice/media-cost'
import { chargeAction, assertPaidReady, markActionStart } from '../lib/x402/charge-flow'
import { notifyInsufficientFunds } from '../lib/x402/notify-insufficient'
import { finishMediaInflight, startMediaInflight } from '../stores/media-inflight-store'
import type { ImageGenerateRequest, ImageGenerateResponse } from '../types/venice'

export function useImageGenerate() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (req: ImageGenerateRequest) => {
      assertPaidReady({ rail: 'venice' })
      const sinceTs = markActionStart()
      const requestedSlots = Math.max(1, req.variants ?? 1)
      const inflightId = startMediaInflight('image', requestedSlots, req.prompt)
      try {
        const data = await venice<ImageGenerateResponse>('/image/generate', {
          method: 'POST',
          body: JSON.stringify(req),
        })
        const variants = data.images?.length || req.variants || 1

        // Persist before charge so navigate-away still keeps the result in gallery.
        const extras: Record<string, string | number | boolean> = {
          steps: req.steps ?? 0,
          variants,
          safeMode: req.safe_mode ?? false,
        }
        if (req.style_preset) extras.style = req.style_preset
        if (req.aspect_ratio) extras.aspectRatio = req.aspect_ratio
        if (req.resolution) extras.resolution = req.resolution
        if (req.width && req.height) {
          extras.width = req.width
          extras.height = req.height
        }

        for (const img of data.images ?? []) {
          const b64 = typeof img === 'string' ? img : img.b64_json
          const blob = blobFromBase64(b64)
          await persistGeneratedMedia({
            kind: 'image',
            blob,
            mimeType: blob.type || mimeFromBase64(b64),
            prompt: req.prompt,
            negativePrompt: req.negative_prompt,
            model: req.model,
            extras,
          })
        }

        recordMediaCost(queryClient, 'image', req.model, { variants }, { action: 'image' })
        const charge = await chargeAction('image', { sinceTs })
        if (charge.insufficient) notifyInsufficientFunds(charge)
        return data
      } finally {
        finishMediaInflight(inflightId)
      }
    },
  })
}
