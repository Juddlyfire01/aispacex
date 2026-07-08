import { useXIntelStore } from '../../stores/x-intel-store'
import { useXSelfStore } from '../../stores/x-self-store'
import { runGather } from '../../lib/x-intel/orchestrate'
import { InlinePopover, type PopoverItem } from './inline-popover'

/**
 * Reusable inline @mention link. Renders as an accent-coloured, underline-free
 * clickable that opens a small anchored popover — same UX as <EthAddressLink> —
 * offering:
 *   • Add as intel target   (in-app; gathers the account)
 *   • Open profile on X      (new tab)
 *
 * "Add as target" requires a connected X account; when not connected the action
 * still appears but explains the requirement on click (mirrors prior behaviour).
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
  const addTarget = useXIntelStore((s) => s.addTarget)
  const connected = useXSelfStore((s) => s.connected)

  const addAsTarget = () => {
    if (!connected) {
      alert('Connect your X account (header → Connect X) to add profiles from a mention.')
      return
    }
    if (confirm(`Add @${username} as a new profile to analyze?`)) {
      addTarget(username)
      runGather(username).catch(() => { /* surfaced in target rail */ })
    }
  }

  const items: PopoverItem[] = [
    ...(canAddTarget ? [{ kind: 'action', label: 'Add profile', onClick: addAsTarget } as PopoverItem] : []),
    { kind: 'link', label: 'Open profile on X', href: `https://x.com/${username}` },
  ]

  return (
    <InlinePopover
      label={label ?? `@${username}`}
      title={`Click for @${username} options`}
      items={items}
      className={className}
    />
  )
}
