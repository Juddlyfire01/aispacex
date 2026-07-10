import type { ReactNode } from 'react'
import { openComposeForPost } from '../../lib/compose/open-compose'
import { postUrl } from '../../lib/x-intel/evidence'
import { InlinePopover, type PopoverItem } from './inline-popover'

/**
 * Reusable inline post-id link. Renders as an accent-coloured, underline-free
 * clickable that opens a small anchored popover — same UX as <MentionLink> /
 * <EthAddressLink> — offering:
 *   • Open in X      (new tab status permalink)
 *   • Add to draft   (Post tab, reply draft pre-filled with this post id)
 */
export function PostLink({
  postId,
  label,
  className,
}: {
  postId: string
  /** Display content (defaults to a short `post <id…>` label). */
  label?: ReactNode
  className?: string
}) {
  const display =
    label ??
    (postId.length > 12 ? `post ${postId.slice(0, 8)}…` : `post ${postId}`)

  const items: PopoverItem[] = [
    { kind: 'link', label: 'Open in X', href: postUrl(postId) },
    {
      kind: 'action',
      label: 'Add to draft',
      onClick: () => openComposeForPost(postId),
    },
  ]

  return (
    <InlinePopover
      label={display}
      title={`Click for post ${postId} options`}
      items={items}
      className={className}
    />
  )
}
