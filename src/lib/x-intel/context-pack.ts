/**
 * Pack own posts into the report transcript window.
 * Articles are always prioritized: include all up to floor(cap/10) slots
 * (min 1), leftover slots go to other posts; token share of articles capped
 * so one Series-A body cannot eat the whole window.
 */
import type { Post } from './types'
import { estimateTextTokens } from './token-estimate'
import { postFormatOf } from './style-features'

/** 1 article slot per this many context-cap posts. */
export const ARTICLE_SLOT_RATIO = 10
/** Max share of packed transcript tokens reserved for article bodies. */
export const ARTICLE_TOKEN_SHARE = 0.35

export function articleSlotCeiling(cap: number): number {
  if (cap <= 0) return 0
  return Math.max(1, Math.floor(cap / ARTICLE_SLOT_RATIO))
}

function byNewestThenEngagement(a: Post, b: Post): number {
  const td = b.createdAt.localeCompare(a.createdAt)
  if (td !== 0) return td
  return (b.metrics.likes ?? 0) - (a.metrics.likes ?? 0)
}

function tokensOf(posts: Post[]): number {
  return posts.reduce((sum, p) => sum + estimateTextTokens(p.text ?? ''), 0)
}

export function isArticlePost(p: Post): boolean {
  return postFormatOf(p) === 'article'
}

/**
 * Select up to `cap` posts for synthesis transcript.
 * Returns posts in newest-first chronological order among the selected set.
 */
export function packPostsForContext(posts: Post[], cap: number): Post[] {
  if (cap <= 0 || posts.length === 0) return []
  if (posts.length <= cap && posts.every((p) => !isArticlePost(p))) {
    return [...posts].sort(byNewestThenEngagement).slice(0, cap)
  }

  const sorted = [...posts].sort(byNewestThenEngagement)
  const articles = sorted.filter(isArticlePost)
  const others = sorted.filter((p) => !isArticlePost(p))
  const ceiling = articleSlotCeiling(cap)

  const pickedArticles: Post[] = []
  for (const article of articles) {
    if (pickedArticles.length >= ceiling) break
    const candidate = [...pickedArticles, article]
    const remainingSlots = Math.max(0, cap - candidate.length)
    const othersSample = others.slice(0, remainingSlots)
    const aTok = tokensOf(candidate)
    const oTok = tokensOf(othersSample)
    const total = aTok + oTok
    // Always keep at least one article when present; after that honor token share.
    if (
      candidate.length > 1 &&
      total > 0 &&
      aTok / total > ARTICLE_TOKEN_SHARE
    ) {
      break
    }
    pickedArticles.push(article)
  }

  const remaining = Math.max(0, cap - pickedArticles.length)
  const pickedOthers = others.slice(0, remaining)
  const selected = new Set([...pickedArticles, ...pickedOthers].map((p) => p.id))
  return sorted.filter((p) => selected.has(p.id))
}

export function formatTranscriptLine(p: Post): string {
  const fmt = postFormatOf(p)
  const titleBit =
    fmt === 'article' && p.articleTitle ? ` title:${JSON.stringify(p.articleTitle)}` : ''
  return `[${p.createdAt}] (${fmt}/${p.kind}, ${p.metrics.likes}L/${p.metrics.reposts}R/${p.metrics.bookmarks}B, id:${p.id}${titleBit}) ${p.text}`
}
