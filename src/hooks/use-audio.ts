import { useMutation, useQueryClient } from '@tanstack/react-query'
import { veniceBlob, veniceFormData } from '../lib/venice-client'
import { recordMediaCost } from '../lib/venice/media-cost'
import { chargeAction, assertPaidReady, markActionStart } from '../lib/x402/charge-flow'
import { notifyInsufficientFunds } from '../lib/x402/notify-insufficient'
import type { TTSRequest } from '../types/venice'

/**
 * TTS returns a Blob; the *caller* owns the lifecycle of any object URL it
 * creates from that blob. Use `useBlobUrl` in the consuming component.
 */
export function useTTS() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (req: TTSRequest) => {
      assertPaidReady({ rail: 'venice' })
      const sinceTs = markActionStart()
      const blob = await veniceBlob('/audio/speech', req)
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
