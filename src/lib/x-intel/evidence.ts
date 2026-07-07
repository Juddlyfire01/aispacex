/** Canonical X permalink for a post id (redirects to the authored URL). */
export function postUrl(id: string): string {
  return `https://x.com/i/status/${id}`
}

/** X profile URL for a username (without the leading @). */
export function profileUrl(username: string): string {
  return `https://x.com/${username.replace(/^@/, '')}`
}

/**
 * Split evidence text into human prose and the list of cited post ids the model
 * dumped inline (e.g. "post:123, post:456" or bare 15-20 digit snowflake ids).
 * Lets the UI render prose normally and collapse the ids into a linked list.
 */
export function splitEvidence(text: string): { prose: string; ids: string[] } {
  const ids: string[] = []
  const seen = new Set<string>()
  const stripped = text.replace(/\b(?:post:)?(\d{15,20})\b/g, (_m, id: string) => {
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