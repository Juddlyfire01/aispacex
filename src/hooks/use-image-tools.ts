import { useMutation } from '@tanstack/react-query'
import { persistGeneratedMedia } from '../lib/media-gallery-persist'
import { veniceBlob } from '../lib/venice-client'
import { assertPaidReady } from '../lib/x402/charge-flow'
import { finishMediaInflight, startMediaInflight } from '../stores/media-inflight-store'
import type { ImageEditRequest, ImageUpscaleRequest } from '../types/venice'

/**
 * All three return raw Blobs. Gallery persist + inflight placeholders live here
 * so navigate-away keeps skeletons until the result lands in the gallery.
 * Credits gate runs here and again inside veniceFetch.
 */
export function useImageEdit() {
  return useMutation({
    mutationFn: async (req: ImageEditRequest) => {
      assertPaidReady({ rail: 'venice' })
      const inflightId = startMediaInflight('image', 1, req.prompt)
      try {
        const blob = await veniceBlob('/image/edit', req)
        await persistGeneratedMedia({
          kind: 'image',
          blob,
          mimeType: blob.type || 'image/png',
          prompt: req.prompt,
          model: req.modelId ?? 'edit',
          extras: { tool: 'edit' },
        })
        return blob
      } finally {
        finishMediaInflight(inflightId)
      }
    },
  })
}

export function useImageUpscale() {
  return useMutation({
    mutationFn: async (req: ImageUpscaleRequest) => {
      assertPaidReady({ rail: 'venice' })
      const inflightId = startMediaInflight('image', 1, `Upscale ${req.scale ?? ''}×`)
      try {
        const blob = await veniceBlob('/image/upscale', req)
        await persistGeneratedMedia({
          kind: 'image',
          blob,
          mimeType: blob.type || 'image/png',
          prompt: `Upscale ${req.scale ?? ''}×`.trim(),
          model: 'upscale',
          extras: {
            tool: 'upscale',
            ...(req.scale != null ? { scale: req.scale } : {}),
            ...(req.creativity != null ? { creativity: req.creativity } : {}),
          },
        })
        return blob
      } finally {
        finishMediaInflight(inflightId)
      }
    },
  })
}

export function useBackgroundRemove() {
  return useMutation({
    mutationFn: async (image: string) => {
      assertPaidReady({ rail: 'venice' })
      const inflightId = startMediaInflight('image', 1, 'Background removed')
      try {
        const blob = await veniceBlob('/image/background-remove', { image })
        await persistGeneratedMedia({
          kind: 'image',
          blob,
          mimeType: blob.type || 'image/png',
          prompt: 'Background removed',
          model: 'background-remove',
          extras: { tool: 'remove-bg' },
        })
        return blob
      } finally {
        finishMediaInflight(inflightId)
      }
    },
  })
}
