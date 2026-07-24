import { useMutation, useQueryClient } from '@tanstack/react-query'
import { persistGeneratedMedia } from '../lib/media-gallery-persist'
import { veniceBlob, veniceFormData } from '../lib/venice-client'
import { recordMediaCost } from '../lib/venice/media-cost'
import { chargeAction, assertPaidReady, markActionStart } from '../lib/x402/charge-flow'
import { notifyInsufficientFunds } from '../lib/x402/notify-insufficient'
import { finishMediaInflight, startMediaInflight } from '../stores/media-inflight-store'
import type { TTSRequest } from '../types/venice'

/**
 * TTS returns a Blob; the *caller* owns the lifecycle of any object URL it
 * creates from that blob. Use `useBlobUrl` in the consuming component.
 * Gallery persist + inflight placeholders live here so navigate-away keeps both.
 */
export function useTTS() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (req: TTSRequest) => {
      assertPaidReady({ rail: 'venice' })
      const sinceTs = markActionStart()
      const inflightId = startMediaInflight('tts', 1, req.input)
      try {
        const blob = await veniceBlob('/audio/speech', req)
        const format = req.response_format ?? 'mp3'
        await persistGeneratedMedia({
          kind: 'tts',
          blob,
          mimeType: blob.type || `audio/${format === 'mp3' ? 'mpeg' : format}`,
          prompt: req.input ?? '',
          model: req.model,
          extras: {
            voice: req.voice ?? '',
            speed: req.speed ?? 1,
            format,
          },
        })
        recordMediaCost(
          queryClient,
          'tts',
          req.model,
          { characters: req.input?.length ?? 0 },
          { action: 'tts' },
        )
        const charge = await chargeAction('tts', { sinceTs })
        if (charge.insufficient) notifyInsufficientFunds(charge)
        return blob
      } finally {
        finishMediaInflight(inflightId)
      }
    },
  })
}

export function useTranscription() {
  return useMutation({
    mutationFn: (file: File) => {
      const formData = new FormData()
      formData.append('file', file)
      formData.append('model', 'whisper-large-v3')
      return veniceFormData<{ text: string }>('/audio/transcriptions', formData)
    },
  })
}
