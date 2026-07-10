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

/**
 * Broader matcher used only for inline auto-linking (remarkPost). Accepts a bare
 * snowflake OR a thousands-comma-grouped one (e.g. `2,075,587,500,908,333,628`)
 * so a model that "prettifies" ids still gets a clickable link. Callers must run
 * the capture through {@link normalizePostId} to strip commas and validate width.
 */
export const POST_ID_LINKIFY_RE = /\b(?:post:)?(\d{1,3}(?:,\d{3})+|\d{15,20})\b/g

/**
 * Normalize a raw post-id match (possibly comma-grouped) to bare digits, or null
 * if it isn't a plausible 15–20 digit snowflake once separators are removed.
 */
export function normalizePostId(raw: string): string | null {
  const digits = raw.replace(/,/g, '')
  return digits.length >= 15 && digits.length <= 20 ? digits : null
}

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
 * Extract a snowflake post id from an x.com / twitter.com status URL.
 * Covers `/i/status/<id>` and `/@user/status/<id>` forms (with optional query).
 */
export function postIdFromStatusUrl(href: string | undefined): string | null {
  if (!href) return null
  try {
    const u = new URL(href)
    const host = u.hostname.replace(/^www\./, '').toLowerCase()
    if (!isStatusHost(host)) return null
    const m = u.pathname.match(/\/(?:i\/status|[^/]+\/status)\/(\d{15,20})(?:\/|$)/)
    return m?.[1] ?? null
  } catch {
    // Relative or non-URL strings — try a loose path match.
    const m = href.match(
      /(?:x|twitter|fxtwitter|fixupx|vxtwitter|nitter)\.[^/\s]+\/(?:i\/status|[^/\s]+\/status)\/(\d{15,20})/i,
    )
    return m?.[1] ?? null
  }
}

/**
 * Hosts we treat as X status permalinks: canonical X/Twitter plus the common
 * embed-fixer and Nitter mirrors the model may cite. Any `nitter.*` host counts.
 */
function isStatusHost(host: string): boolean {
  if (
    host === 'x.com' ||
    host === 'twitter.com' ||
    host === 'mobile.twitter.com' ||
    host === 'fxtwitter.com' ||
    host === 'fixupx.com' ||
    host === 'vxtwitter.com'
  ) {
    return true
  }
  return host === 'nitter.net' || host.startsWith('nitter.')
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