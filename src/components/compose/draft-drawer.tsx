import { useEffect, useState } from 'react'
import { useComposeStore } from '../../stores/compose-store'
import { PostComposer } from './post-composer'
import { ComposeActions } from './compose-actions'

/** Draft pane — lives in the chat split (not an overlay). Width owned by parent. */
export function DraftDrawer() {
  const draftDrawerOpen = useComposeStore((s) => s.draftDrawerOpen)
  const setDraftDrawerOpen = useComposeStore((s) => s.setDraftDrawerOpen)
  const activeThreadId = useComposeStore((s) => s.activeThreadId)
  const activeThreadExists = useComposeStore((s) =>
    Boolean(s.activeThreadId && s.threads[s.activeThreadId]),
  )
  const [copied, setCopied] = useState(false)

  const threadId = draftDrawerOpen && activeThreadExists ? activeThreadId : null

  useEffect(() => {
    if (!threadId) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        setDraftDrawerOpen(false)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [threadId, setDraftDrawerOpen])

  if (!threadId) return null

  return (
    <div className="h-full min-h-0 min-w-0 flex flex-col bg-[var(--color-bg-base)]">
      <div className="flex items-center justify-between gap-2 px-4 py-2.5 border-b border-[var(--color-border-faint)] shrink-0">
        <h2 className="text-[12px] font-semibold text-[var(--color-text-primary)] tracking-wide uppercase">
          Draft
        </h2>
        <button
          type="button"
          onClick={() => setDraftDrawerOpen(false)}
          aria-label="Close draft"
          className="px-2 py-1 text-[11px] text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] rounded-md hover:bg-[var(--color-border-faint)] transition-colors"
        >
          Close
        </button>
      </div>
      <div className="flex-1 min-h-0 flex flex-col">
        <div className="flex-1 min-h-0 overflow-y-auto">
          <PostComposer threadId={threadId} />
        </div>
        <ComposeActions threadId={threadId} copied={copied} setCopied={setCopied} />
      </div>
    </div>
  )
}
