import { addTargetWithToast } from '../../lib/x-intel/add-target'
import { InlinePopover, type PopoverItem } from './inline-popover'

/**
 * Reusable inline @mention link. Renders as an accent-coloured, underline-free
 * clickable that opens a small anchored popover — same UX as <EthAddressLink> —
 * offering:
 *   • Add as intel target   (in-app; gathers the account)
 *   • Open profile on X      (new tab)
 *
 * "Add as target" requires a connected X account; when not connected the action
 * still appears but explains the requirement via toast (mirrors prior behaviour).
 * Pass `canAddTarget={false}` for surfaces with no target concept (e.g. the self
 * view) to omit the add action entirely.
 */
export function MentionLink({
  username,
  label,
  canAddTarget = true,
  className,
}: {
  username: string
  /** Display text incl. leading @ (defaults to `@username`). */
  label?: string
  canAddTarget?: boolean
  className?: string
}) {
  const items: PopoverItem[] = [
    ...(canAddTarget
      ? [{ kind: 'action' as const, label: 'Add profile', onClick: () => addTargetWithToast(username) }]
      : []),
    { kind: 'link', label: 'Open profile on X', href: `https://x.com/${username}` },
  ]

  return (
    <InlinePopover
      label={label ?? `@${username}`}
      title={`@${username}`}
      items={items}
      className={className}
    />
  )
}
