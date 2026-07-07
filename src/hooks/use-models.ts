import { useQuery } from '@tanstack/react-query'
import {
  fallbackModelId,
  fetchModelsBundle,
  type ModelsQueryResult,
} from '../lib/venice-model-utils'
import type { VeniceModel, VideoConstraints } from '../types/venice'

export function useModels(type?: string) {
  const query = useQuery<ModelsQueryResult>({
    queryKey: ['models', type],
    enabled: Boolean(type),
    queryFn: () => fetchModelsBundle(type!),
    staleTime: 5 * 60 * 1000,
  })

  return {
    ...query,
    data: query.data?.models,
    defaultModelId: query.data?.defaultModelId ?? fallbackModelId(type),
  }
}

export interface VideoModelGroup {
  name: string
  textModel?: VeniceModel
  imageModel?: VeniceModel
  sets: string[]
}

export function useVideoModels() {
  const query = useModels('video')

  const groups: VideoModelGroup[] = []
  if (query.data) {
    const map = new Map<string, VideoModelGroup>()
    for (const m of query.data) {
      const c = m.model_spec?.constraints as VideoConstraints | undefined
      if (!c) continue
      const name = m.model_spec?.name || m.id
      const key = name.toLowerCase()
      if (!map.has(key)) {
        map.set(key, { name, sets: m.model_spec?.model_sets || [] })
      }
      const group = map.get(key)!
      if (c.model_type === 'text-to-video') group.textModel = m
      else if (c.model_type === 'image-to-video') group.imageModel = m
      const newSets = m.model_spec?.model_sets || []
      for (const s of newSets) {
        if (!group.sets.includes(s)) group.sets.push(s)
      }
    }
    groups.push(...map.values())
  }

  return { ...query, groups }
}
