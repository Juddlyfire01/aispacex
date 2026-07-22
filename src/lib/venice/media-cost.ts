import type { QueryClient } from '@tanstack/react-query'
import type { VeniceModel } from '../../types/venice'
import type { ModelsQueryResult } from '../venice-model-utils'
import { estimateMediaUsd, type MediaKind, type MediaCostParams } from './usage-cost'
import { useVeniceCostStore } from '../../stores/venice-cost-store'
import type { CostKind } from '../cost/ledger'

/** react-query cache type → the model list `useModels(type)` fetches. */
const TYPE_FOR_KIND: Record<MediaKind, string> = {
  image: 'image',
  video: 'video',
  music: 'music',
  tts: 'tts',
}

const LEDGER_KIND: Record<MediaKind, CostKind> = {
  image: 'image',
  video: 'video',
  music: 'music',
  tts: 'tts',
}

/** Find a model spec by id from the cached models bundle for its type. */
export function findModelSpec(
  queryClient: QueryClient,
  kind: MediaKind,
  modelId: string,
): VeniceModel | undefined {
  const cache = queryClient.getQueryData<ModelsQueryResult>(['models', TYPE_FOR_KIND[kind]])
  return cache?.models.find((m) => m.id === modelId)
}

/**
 * Record the cost of a completed media generation into the Venice cost store
 * and the unified ledger. Resolves the model spec from the react-query cache so
 * callers only need the model id + generation params. No-ops when the model or
 * its pricing is unavailable (cost degrades to 0 / "unpriced").
 */
export function recordMediaCost(
  queryClient: QueryClient,
  kind: MediaKind,
  modelId: string,
  params: MediaCostParams = {},
  ledger?: { action?: string; meta?: Record<string, unknown> },
): number {
  const model = findModelSpec(queryClient, kind, modelId)
  const usd = estimateMediaUsd(model, kind, params)
  if (usd <= 0) return 0
  useVeniceCostStore.getState().addUsd(usd, {
    action: ledger?.action,
    kind: LEDGER_KIND[kind],
    meta: { modelId, kind, ...params, ...ledger?.meta },
  })
  return usd
}
