import { useState } from 'react'
import { PostLink } from './post-link'
import { formatTokens, cn } from '../../lib/utils'
import type { Post } from '../../lib/x-intel/types'

const EVIDENCE_VISIBLE = 10

/** Classic chain-link glyph for the Open-in-X affordance. */
function LinkIcon({ className }: { className?: string }) {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
      <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
    </svg>
  )
}

/**
 * Collapsible cited-source list (themes, narrative arcs, network rows).
 * Expands to excerpts that jump to Feed when the post is held locally, else PostLink.
 */
export function EvidencePosts({
  ids,
  posts,
  onJumpToPost,
  label = 'cited post',
}: {
  ids: string[]
  posts: Post[]
  onJumpToPost: (postId: string) => void
  /** Singular noun used in the toggle, e.g. "cited post" / "source post". */
  label?: string
}) {
  const [open, setOpen] = useState(false)
  if (ids.length === 0) return null
  const plural = ids.length === 1 ? label : `${label}s`
  return (
    <div className="mt-1">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1.5 text-[10px] font-mono text-[var(--color-text-quaternary)] hover:text-[var(--color-text-secondary)] transition-colors"
      >
        <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" className={cn('transition-transform', open && 'rotate-90')}>
          <polyline points="9 18 15 12 9 6" />
        </svg>
        {ids.length} {plural}
      </button>
      {open && (
        <div
          className={cn(
            'mt-1 space-y-1 pl-3 border-l border-[var(--color-border-faint)]',
            ids.length > EVIDENCE_VISIBLE && 'max-h-[15rem] overflow-y-auto pr-1',
          )}
        >
          {ids.map((id) => {
            const post = posts.find((p) => p.id === id)
            return (
              <div key={id} className="flex items-start gap-1.5 text-[11px]">
                {post ? (
                  <button
                    type="button"
                    onClick={() => onJumpToPost(id)}
                    className="text-left flex-1 min-w-0 text-[var(--color-text-tertiary)] hover:text-[var(--color-text-secondary)] transition-colors"
                    title="View in Feed"
                  >
                    {post.text.slice(0, 120)}{post.text.length > 120 ? '…' : ''}
                    <span className="font-mono text-[9px] text-[var(--color-text-quaternary)]"> · {formatTokens(post.metrics.likes)}L</span>
                  </button>
                ) : (
                  <span className="flex-1 min-w-0 font-mono text-[10px]">
                    <PostLink postId={id} />
                  </span>
                )}
                {post && (
                  <span className="shrink-0 mt-0.5">
                    <PostLink postId={id} label={<LinkIcon />} />
                  </span>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
