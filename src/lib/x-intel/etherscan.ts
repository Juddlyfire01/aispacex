/**
 * Shared detection + link building for Ethereum identities (ENS names and raw
 * addresses) so every surface — bios, post feeds, chat bubbles, report
 * narrative — links to block explorers the same way. Single source of truth.
 *
 * Both Etherscan and Basescan resolve `/address/<name>.eth` and `/address/0x…`
 * directly, so the same route works for either identity form on either chain.
 */

/** 0x-prefixed 40-hex-char address. Word-boundaried so it won't match inside
 *  longer hex blobs (e.g. tx hashes are 64 chars). */
export const ETH_ADDRESS_RE = /\b0x[a-fA-F0-9]{40}\b/g

/** ENS name: a label (letters/digits/hyphen) ending in `.eth`. Kept simple —
 *  we intentionally only auto-link `.eth` (the common case) to avoid false
 *  positives on ordinary domains. Sub-names like `foo.willy.eth` match too. */
export const ENS_NAME_RE = /\b(?:[a-zA-Z0-9-]+\.)+eth\b/g

/** A block explorer the user can open an identity in. */
export interface EthExplorer {
  name: string
  /** Short host label for tooltips/aria. */
  host: string
  url: (nameOrAddress: string) => string
}

/** Explorers offered in the identity popover. Etherscan first (canonical ENS
 *  chain), then Basescan (VVV/DIEM live on Base). */
export const ETH_EXPLORERS: EthExplorer[] = [
  { name: 'Etherscan', host: 'etherscan.io', url: (id) => `https://etherscan.io/address/${encodeURIComponent(id)}` },
  { name: 'Basescan', host: 'basescan.org', url: (id) => `https://basescan.org/address/${encodeURIComponent(id)}` },
]

/** Build the Etherscan address URL for an ENS name or raw address. Used as the
 *  default/href for markdown link nodes and non-interactive fallbacks. */
export function etherscanAddressUrl(nameOrAddress: string): string {
  return ETH_EXPLORERS[0].url(nameOrAddress)
}

/** Sentinel URL scheme emitted by the remark plugin so the markdown link
 *  renderer can recognise an ETH identity and swap in the interactive popover
 *  without brittle string parsing. `eth:` is stripped by the URL sanitiser, so
 *  it never leaks into a real anchor href. */
export const ETH_IDENTITY_SCHEME = 'eth-identity:'

/** Wrap an identity into the sentinel URL used inside markdown link nodes. */
export function ethIdentityHref(nameOrAddress: string): string {
  return `${ETH_IDENTITY_SCHEME}${nameOrAddress}`
}

/** Recover the identity from a sentinel href, or null if it isn't one. */
export function identityFromHref(href: string | undefined): string | null {
  if (!href || !href.startsWith(ETH_IDENTITY_SCHEME)) return null
  return href.slice(ETH_IDENTITY_SCHEME.length)
}
