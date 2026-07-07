import type { NewsResponse } from './types'

const NEWS_BASE = '/api/news/proxy'

export class NewsError extends Error {
  status: number
  constructor(message: string, status: number) {
    super(message)
    this.name = 'NewsError'
    this.status = status
  }
}

export async function fetchNews(feedIds: string[]): Promise<NewsResponse> {
  if (feedIds.length === 0) return { items: [], failures: [] }
  const url = new URL(NEWS_BASE, window.location.origin)
  url.searchParams.set('feeds', feedIds.join(','))
  const res = await fetch(url.toString(), { headers: { Accept: 'application/json' } })
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    let message = body || res.statusText
    try {
      const parsed = JSON.parse(body) as { error?: string }
      if (parsed.error) message = parsed.error
    } catch { /* keep raw */ }
    throw new NewsError(message, res.status)
  }
  const text = await res.text()
  try {
    return JSON.parse(text) as NewsResponse
  } catch {
    throw new NewsError('News proxy returned a non-JSON response', res.status)
  }
}
