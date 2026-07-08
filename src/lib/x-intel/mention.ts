/**
 * Shared detection + sentinel-link plumbing for X @mentions in markdown surfaces
 * (report narrative, assistant chat output). Mirrors the ETH-identity pattern in
 * etherscan.ts so every surface turns `@handle` into the same interactive
 * <MentionLink> popover (Add as intel target / Open profile on X).
 */

/**
 * An @mention: leading @ followed by 1–15 word chars (X's handle limit), not
 * preceded by a word char or `/` so we don't match emails (`foo@bar`) or path
 * fragments. `g` flag for find-and-replace; fresh instances made per use since
 * mdast-util-find-and-replace mutates lastIndex.
 */
export const MENTION_RE = /(?:^|[^\w/@])@(\w{1,15})\b/g

/** Sentinel URL scheme for a mention inside a markdown link node. Stripped by
 *  the URL sanitiser, so it never leaks into a real anchor href. */
export const MENTION_SCHEME = 'x-mention:'

/** Wrap a bare username (no @) into the sentinel URL. */
export function mentionHref(username: string): string {
  return `${MENTION_SCHEME}${username}`
}

/** Recover the username from a sentinel href, or null if it isn't one. */
export function usernameFromHref(href: string | undefined): string | null {
  if (!href || !href.startsWith(MENTION_SCHEME)) return null
  return href.slice(MENTION_SCHEME.length)
}
