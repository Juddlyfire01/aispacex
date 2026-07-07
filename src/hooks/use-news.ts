import { useQuery } from '@tanstack/react-query'
import { fetchNews } from '../lib/news/client'

const NEWS_STALE = 3 * 60_000

export function useNews(feedIds: string[]) {
  const key = [...feedIds].sort()
  return useQuery({
    queryKey: ['news', key],
    queryFn: () => fetchNews(key),
    staleTime: NEWS_STALE,
    refetchInterval: NEWS_STALE,
    enabled: feedIds.length > 0,
  })
}
