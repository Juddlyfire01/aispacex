import type { NewsCategory, NewsFeed } from './types'

export const NEWS_FEEDS: NewsFeed[] = [
  // AI
  { id: 'tc-ai', name: 'TechCrunch AI', url: 'https://techcrunch.com/category/artificial-intelligence/feed/', category: 'ai' },
  { id: 'verge-ai', name: 'The Verge AI', url: 'https://www.theverge.com/rss/ai-artificial-intelligence/index.xml', category: 'ai' },
  { id: 'vb-ai', name: 'VentureBeat AI', url: 'https://venturebeat.com/category/ai/feed/', category: 'ai' },
  { id: 'arstechnica-ai', name: 'Ars Technica AI', url: 'https://arstechnica.com/ai/feed/', category: 'ai' },
  // Crypto
  { id: 'coindesk', name: 'CoinDesk', url: 'https://www.coindesk.com/arc/outboundfeeds/rss/', category: 'crypto' },
  { id: 'cointelegraph', name: 'Cointelegraph', url: 'https://cointelegraph.com/rss', category: 'crypto' },
  { id: 'theblock', name: 'The Block', url: 'https://www.theblock.co/rss.xml', category: 'crypto' },
  { id: 'decrypt', name: 'Decrypt', url: 'https://decrypt.co/feed', category: 'crypto' },
  // Tech
  { id: 'verge', name: 'The Verge', url: 'https://www.theverge.com/rss/index.xml', category: 'tech' },
  { id: 'arstechnica', name: 'Ars Technica', url: 'https://feeds.arstechnica.com/arstechnica/index', category: 'tech' },
  { id: 'techcrunch', name: 'TechCrunch', url: 'https://techcrunch.com/feed/', category: 'tech' },
  { id: 'hn', name: 'Hacker News', url: 'https://hnrss.org/frontpage', category: 'tech' },
  // Business (default OFF)
  { id: 'cnbc-business', name: 'CNBC Business', url: 'https://search.cnbc.com/rs/search/combinedcms/view.xml?partnerId=wrss01&id=10001147', category: 'business' },
  { id: 'reuters-business', name: 'Reuters Business', url: 'https://www.reutersagency.com/feed/?best-topics=business-finance&post_type=best', category: 'business' },
  // World (default OFF)
  { id: 'bbc-world', name: 'BBC World', url: 'https://feeds.bbci.co.uk/news/world/rss.xml', category: 'world' },
  { id: 'aljazeera', name: 'Al Jazeera', url: 'https://www.aljazeera.com/xml/rss/all.xml', category: 'world' },
  // Science (default OFF)
  { id: 'nature', name: 'Nature News', url: 'https://www.nature.com/nature.rss', category: 'science' },
  { id: 'sciencedaily', name: 'ScienceDaily', url: 'https://www.sciencedaily.com/rss/all.xml', category: 'science' },
  { id: 'arstechnica-science', name: 'Ars Technica Science', url: 'https://arstechnica.com/science/feed/', category: 'science' },
]

export const NEWS_CATEGORIES: { id: NewsCategory; label: string }[] = [
  { id: 'ai', label: 'AI' },
  { id: 'crypto', label: 'Crypto' },
  { id: 'tech', label: 'Tech' },
  { id: 'business', label: 'Business' },
  { id: 'world', label: 'World' },
  { id: 'science', label: 'Science' },
]

/** Categories enabled by default (AI + Crypto + Tech on; rest off). */
export const DEFAULT_CATEGORIES: NewsCategory[] = ['ai', 'crypto', 'tech']

/** Feeds excluded from the default set even though their category is on. */
const DEFAULT_EXCLUDED_FEED_IDS = new Set(['coindesk', 'cointelegraph'])

export const DEFAULT_FEED_IDS: string[] = NEWS_FEEDS
  .filter((f) => DEFAULT_CATEGORIES.includes(f.category) && !DEFAULT_EXCLUDED_FEED_IDS.has(f.id))
  .map((f) => f.id)

const FEED_BY_ID = new Map(NEWS_FEEDS.map((f) => [f.id, f]))

export function getFeed(id: string): NewsFeed | undefined {
  return FEED_BY_ID.get(id)
}
