export interface ExtractedArticleResponse {
  url: string
  title: string
  text: string
  excerpt: string
  byline: string
  siteName: string
  length: number
}

export class NewsExtractError extends Error {
  status: number
  code: string
  constructor(message: string, status: number, code: string) {
    super(message)
    this.name = 'NewsExtractError'
    this.status = status
    this.code = code
  }
}

/** Fetch full article text via Readability extract API. */
export async function extractNewsArticle(
  url: string,
  opts?: { signal?: AbortSignal },
): Promise<ExtractedArticleResponse> {
  const res = await fetch('/api/news/extract', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ url }),
    signal: opts?.signal,
  })
  const body = (await res.json().catch(() => ({}))) as Record<string, unknown>
  if (!res.ok) {
    const code = typeof body.error === 'string' ? body.error : `http_${res.status}`
    throw new NewsExtractError(code, res.status, code)
  }
  return body as unknown as ExtractedArticleResponse
}
