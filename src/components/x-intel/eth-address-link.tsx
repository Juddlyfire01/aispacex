import { ETH_EXPLORERS } from '../../lib/x-intel/etherscan'
import { InlinePopover, type PopoverItem } from './inline-popover'

/**
 * Reusable inline link for an Ethereum identity (ENS name or raw address).
 *
 * Renders the identity as an entity-link (X blue). Clicking it opens a small
 * anchored popover offering "Open in Etherscan" / "Open in Basescan" (both
 * new-tab). Shared by every surface that surfaces on-chain identities — bios,
 * activity feed, chat bubbles, report narrative — so the affordance and
 * styling stay identical everywhere.
 */
export function EthAddressLink({ identity, className }: { identity: string; className?: string }) {
  const items: PopoverItem[] = ETH_EXPLORERS.map((ex) => ({
    kind: 'link',
    label: `Open in ${ex.name}`,
    href: ex.url(identity),
  }))

  return (
    <InlinePopover
      label={identity}
      title={`Click to view ${identity} on a block explorer`}
      items={items}
      className={className}
    />
  )
}
