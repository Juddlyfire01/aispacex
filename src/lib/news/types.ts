export type NewsCategory = 'ai' | 'crypto' | 'tech' | 'business' | 'world' | 'science'

export interface NewsFeed {
  id: string
  name: string
  url: string
  category: NewsCategory
}

export interface NewsItem {
  id: string // stable hash of url
  feedId: string
  category: NewsCategory
  sourceName: string
  title: string
  summary: string // HTML-stripped, truncated
  url: string
  imageUrl?: string
  publishedAt: string // ISO 8601; '' when the feed omits a date
}

export interface NewsFeedFailure {
  feedId: string
  error: string
}

export interface NewsResponse {
  items: NewsItem[]
  failures: NewsFeedFailure[]
}
