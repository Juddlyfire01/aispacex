/** Canonical X permalink for a post id (redirects to the authored URL). */
export function postUrl(id: string): string {
  return `https://x.com/i/status/${id}`
}

/** X profile URL for a username (without the leading @). */
export function profileUrl(username: string): string {
  return `https://x.com/${username.replace(/^@/, '')}`
}

/**
 * X snowflake post id (optionally `post:`-prefixed). 15–20 digits matches the
 * current id width without treating ordinary short numbers as posts.
 */
export const POST_ID_RE = /\b(?:post:)?(\d{15,20})\b/g

/** Sentinel URL scheme for a post id inside a markdown link node. Stripped by
 *  the URL sanitiser, so it never leaks into a real anchor href. */
export const POST_SCHEME = 'x-post:'

/** Wrap a bare post id into the sentinel URL. */
export function postHref(postId: string): string {
  return `${POST_SCHEME}${postId}`
}

/** Recover the post id from a sentinel href, or null if it isn't one. */
export function postIdFromHref(href: string | undefined): string | null {
  if (!href || !href.startsWith(POST_SCHEME)) return null
  return href.slice(POST_SCHEME.length)
}

/**
 * Split evidence text into human prose and the list of cited post ids the model
 * dumped inline (e.g. "post:123, post:456" or bare 15-20 digit snowflake ids).
 * Lets the UI render prose normally and collapse the ids into a linked list.
 */
export function splitEvidence(text: string): { prose: string; ids: string[] } {
  const ids: string[] = []
  const seen = new Set<string>()
  const stripped = text.replace(new RegExp(POST_ID_RE.source, 'g'), (_m, id: string) => {
    if (!seen.has(id)) { seen.add(id); ids.push(id) }
    return ''
  })
  const prose = stripped
    .replace(/\s*,\s*(?=,|$)/g, '')   // drop separators left dangling where ids were removed
    .replace(/\s{2,}/g, ' ')           // collapse internal whitespace runs
    .replace(/\s+([,;.])/g, '$1')      // no space before punctuation
    .replace(/[\s,;·—-]+$/g, '')
    .replace(/^[\s,;·—-]+/g, '')
    .trim()
  return { prose, ids }
}