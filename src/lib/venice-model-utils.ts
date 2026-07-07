import { venice } from './venice-client'
import type { ModelsResponse, VeniceModel } from '../types/venice'

interface ModelsTraitsResponse {
  data: Record<string, string>
}

export interface ModelsQueryResult {
  models: VeniceModel[]
  defaultModelId: string
}

/** Utility image SKUs — not text-to-image generate; handled on Image → Edit / Upscale / Remove BG. */
export const EXCLUDED_IMAGE_GENERATION_IDS = new Set(['bria-bg-remover'])

const FALLBACK_MODEL_ID: Record<string, string> = {
  text: 'zai-org-glm-4.7',
  image: 'z-image-turbo',
  tts: 'tts-kokoro',
  music: 'ace-step-15',
  video: 'wan-2-7-text-to-video',
  embedding: 'text-embedding-bge-m3',
}

export function filterModelsForPicker(type: string | undefined, models: VeniceModel[]): VeniceModel[] {
  const online = models.filter((m) => !m.model_spec?.offline)
  const filtered = type === 'image'
    ? online.filter((m) => !EXCLUDED_IMAGE_GENERATION_IDS.has(m.id))
    : online
  return [...filtered].sort((a, b) => a.id.localeCompare(b.id))
}

/** Resolve Venice's `default` trait — traits map first, then per-model traits, then fallback id. */
export function resolveDefaultModelId(
  models: VeniceModel[],
  traits: Record<string, string> | undefined,
  type: string | undefined,
): string {
  const fallback = (type && FALLBACK_MODEL_ID[type]) || models[0]?.id || ''
  const traitId = traits?.default
  if (traitId && models.some((m) => m.id === traitId)) return traitId

  const tagged = models.find((m) => m.model_spec?.traits?.includes('default'))
  if (tagged) return tagged.id

  return fallback
}

export function fallbackModelId(type: string | undefined): string {
  return (type && FALLBACK_MODEL_ID[type]) || ''
}

export async function fetchModelsBundle(type: string): Promise<ModelsQueryResult> {
  const [modelsRes, traitsRes] = await Promise.all([
    venice<ModelsResponse>(`/models?type=${type}`, { noAuth: true }),
    venice<ModelsTraitsResponse>(`/models/traits?type=${type}`, { noAuth: true }).catch(
      () => ({ data: {} as Record<string, string> }),
    ),
  ])
  const models = filterModelsForPicker(type, modelsRes.data)
  const defaultModelId = resolveDefaultModelId(models, traitsRes.data, type)
  return { models, defaultModelId }
}
