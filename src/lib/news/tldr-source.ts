// Helpers to turn a raw `/augment/scrape` markdown dump into a clean source
// string for summarization. Many news sites (crypto sites especially) embed
// large boilerplate widgets — live price tickers, "recommended" article
// teasers, newsletter signups — ABOVE the actual article body. A naive
// `content.slice(0, N)` truncation can end up feeding the LLM nothing but
// ticker noise, producing a summary totally unrelated to the article.
//
// Strategy (general-purpose, not site-specific):
// 1. Strip repeating "### [SYM](url) / $price / +/-x%" ticker blocks — a
//    common pattern across crypto news sites' scraped markdown.
// 2. Try to anchor the content to the article's own title (which almost
//    always appears verbatim near the real article body), so we start the
//    slice at the right place even when boilerplate precedes it.
// 3. Only then truncate to the character budget sent to the LLM.

const PRICE_TICKER_BLOCK =
  /###\s*\[[A-Za-z0-9?]{1,12}\]\([^)]*\)\s*\n+\$[\d,.]+\s*\n+-?\d+(\.\d+)?%\s*/g

export function stripPriceTicker(content: string): string {
  return content.replace(PRICE_TICKER_BLOCK, '').replace(/\n{3,}/g, '\n\n').trim()
}

/**
 * Slice `content` starting at the first point the article's own title
 * appears, so unrelated boilerplate preceding the real article is dropped.
 * Falls back to returning `content` unchanged if the title can't be located
 * (e.g. scrape genuinely failed to capture the article at all).
 */
export function anchorToTitle(content: string, title: string): string {
  const cleanTitle = title.trim()
  if (cleanTitle.length < 8) return content

  const haystack = content.toLowerCase()
  const idx = haystack.indexOf(cleanTitle.toLowerCase())
  if (idx !== -1) return content.slice(idx)

  // Titles are sometimes re-wrapped/re-punctuated by the site's markdown
  // (curly quotes, trailing " - Source" suffixes, etc). Try a distinctive
  // prefix instead of the full title.
  const prefixLen = Math.min(40, cleanTitle.length)
  if (prefixLen < 8) return content
  const prefix = cleanTitle.slice(0, prefixLen).toLowerCase()
  const idx2 = haystack.indexOf(prefix)
  if (idx2 !== -1) return content.slice(idx2)

  return content
}

export function prepareScrapedSource(content: string, title: string, maxChars: number): string {
  const stripped = stripPriceTicker(content)
  const anchored = anchorToTitle(stripped, title)
  return anchored.slice(0, maxChars).trim()
}
