import { venice } from './venice-client'
import type { ModelsResponse, VeniceModel } from '../types/venice'

interface ModelsTraitsResponse {
  data: Record<string, string>
}

export interface ModelsQueryResult {
  models: VeniceModel[]
  defaultModelId: string
  /** Venice `most_uncensored` trait when present (e.g. venice-uncensored-1-2). */
  mostUncensoredModelId: string
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

/** Resolve Venice's `most_uncensored` trait — traits map, then model tag, then latest venice-uncensored* id. */
export function resolveMostUncensoredModelId(
  models: VeniceModel[],
  traits: Record<string, string> | undefined,
): string {
  const traitId = traits?.most_uncensored
  if (traitId && models.some((m) => m.id === traitId)) return traitId

  const tagged = models.find((m) => m.model_spec?.traits?.includes('most_uncensored'))
  if (tagged) return tagged.id

  // Prefer core Venice Uncensored SKUs (not e2ee- / role-play variants) by version-ish id.
  const veniceCore = models
    .filter((m) => /^venice-uncensored(-\d+)?(-\d+)?$/i.test(m.id) || /^venice-uncensored-\d+-\d+$/i.test(m.id))
    .sort((a, b) => b.id.localeCompare(a.id, undefined, { numeric: true }))
  if (veniceCore[0]) return veniceCore[0].id

  const anyVeniceUncensored = models
    .filter((m) => /^venice-uncensored/i.test(m.id))
    .sort((a, b) => b.id.localeCompare(a.id, undefined, { numeric: true }))
  if (anyVeniceUncensored[0]) return anyVeniceUncensored[0].id

  return ''
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
  const mostUncensoredModelId = resolveMostUncensoredModelId(models, traitsRes.data)
  return { models, defaultModelId, mostUncensoredModelId }
}
