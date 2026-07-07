// X counts a post's length with its own weighting: every URL (regardless of its
// real length) counts as a fixed 23 characters (t.co wrapping), and everything
// else counts by Unicode code point. This mirrors that closely enough for a
// composer char counter — exact parity would require twitter-text's full table.

const URL_WEIGHT = 23

// Pragmatic URL matcher: http(s) links and bare domains with a common TLD.
const URL_RE =
  /\b(?:https?:\/\/)[^\s]+|\b(?:[a-z0-9-]+\.)+(?:com|net|org|io|co|ai|gg|app|dev|xyz|me|tv|news|so|to)\b(?:\/[^\s]*)?/gi

/** Count of URL-like tokens in the text. */
export function countUrls(text: string): number {
  const matches = text.match(URL_RE)
  return matches ? matches.length : 0
}

/** Whether the text contains at least one URL (drives the $0.20 cost hint). */
export function containsUrl(text: string): boolean {
  return countUrls(text) > 0
}

/**
 * Weighted length of a post: URLs count as 23 chars, the rest by code point.
 */
export function tweetLength(text: string): number {
  let stripped = text
  let urlCount = 0
  stripped = stripped.replace(URL_RE, () => {
    urlCount++
    return ''
  })
  // Code-point length of the non-URL remainder (handles emoji/astral chars).
  const rest = [...stripped].length
  return rest + urlCount * URL_WEIGHT
}

/** Characters remaining against a limit (negative when over). */
export function remaining(text: string, limit: number): number {
  return limit - tweetLength(text)
}
