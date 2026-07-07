import { useQueries } from '@tanstack/react-query'
import { fetchModelsBundle } from '../lib/venice-model-utils'

export type ModelCatalog = {
  text: string[]
  image: string[]
  tts: string[]
  music: string[]
  video: string[]
}

const TYPES: (keyof ModelCatalog)[] = ['text', 'image', 'tts', 'music', 'video']

export function useModelCatalog() {
  const queries = useQueries({
    queries: TYPES.map((type) => ({
      queryKey: ['models', type],
      queryFn: () => fetchModelsBundle(type),
      staleTime: 5 * 60 * 1000,
    })),
  })

  const catalog: ModelCatalog = {
    text: queries[0].data?.models.map((m) => m.id) ?? [],
    image: queries[1].data?.models.map((m) => m.id) ?? [],
    tts: queries[2].data?.models.map((m) => m.id) ?? [],
    music: queries[3].data?.models.map((m) => m.id) ?? [],
    video: queries[4].data?.models.map((m) => m.id) ?? [],
  }

  const isLoading = queries.some((q) => q.isLoading)

  return { catalog, isLoading }
}
