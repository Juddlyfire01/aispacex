import { findAndReplace } from 'mdast-util-find-and-replace'
import type { Root } from 'mdast'
import { ENS_NAME_RE, ETH_ADDRESS_RE, ethIdentityHref } from './etherscan'

/**
 * Remark plugin that auto-links bare Ethereum addresses (`0x…`) and ENS names
 * (`*.eth`) in markdown text — the markdown-surface counterpart to the
 * token-based `linkify()` used for plain X text. Runs over mdast text nodes
 * only and skips existing links/code, so already-linked or fenced content is
 * left untouched.
 *
 * Emits a link node with the `eth-identity:` sentinel scheme rather than a real
 * explorer URL; the markdown link renderer recognises that scheme and swaps in
 * the interactive <EthAddressLink> popover (Etherscan / Basescan). The sentinel
 * is stripped by the URL sanitiser, so it can never render as a raw anchor.
 *
 * Fresh RegExp instances are created per invocation because
 * `mdast-util-find-and-replace` mutates `lastIndex` on the global regexes.
 */
export function remarkEtherscan() {
  return (tree: Root) => {
    const toLink = (value: string) => ({
      type: 'link' as const,
      url: ethIdentityHref(value),
      title: null,
      children: [{ type: 'text' as const, value }],
    })
    findAndReplace(
      tree,
      [
        [new RegExp(ETH_ADDRESS_RE.source, 'g'), (value: string) => toLink(value)],
        [new RegExp(ENS_NAME_RE.source, 'g'), (value: string) => toLink(value)],
      ],
      { ignore: ['link', 'linkReference', 'code', 'inlineCode'] },
    )
  }
}
