import type { NewsItem } from '../news/types'
import { estimateTokens } from './token-estimate'

/** Soft cap on how many bookmarks appear in the hot pointer list. */
export const NEWS_HOT_BOOKMARK_CAP = 40

export function formatBookmarkedNewsHot(bookmarks: NewsItem[]): string {
  if (!bookmarks.length) return ''

  const items = bookmarks.slice(0, NEWS_HOT_BOOKMARK_CAP)
  const lines = items.map((b, i) => {
    const date = b.publishedAt ? b.publishedAt.slice(0, 10) : 'undated'
    return `${i + 1}. [${b.id}] ${b.sourceName} · ${date}\n   ${b.title}\n   ${b.url}`
  })

  const more =
    bookmarks.length > NEWS_HOT_BOOKMARK_CAP
      ? `\n… +${bookmarks.length - NEWS_HOT_BOOKMARK_CAP} more bookmarks (not listed)`
      : ''

  return [
    '===== BOOKMARKED NEWS (RSS) =====',
    'Pointers only — call news_read with id or url when a story is relevant.',
    ...lines,
    `===== END BOOKMARKED NEWS${more} =====`,
  ].join('\n')
}

/** Merge intel hot pack text with bookmarked-news pointers. */
export function mergeHotWithNewsBookmarks(
  intelHotText: string,
  bookmarks: NewsItem[],
): { text: string; newsTokens: number } {
  const newsBlock = formatBookmarkedNewsHot(bookmarks)
  if (!newsBlock) {
    return { text: intelHotText, newsTokens: 0 }
  }
  const text = intelHotText.trim()
    ? `${intelHotText.trim()}\n\n${newsBlock}`
    : newsBlock
  return { text, newsTokens: estimateTokens(newsBlock) }
}
