import { useRef } from 'react'
import { useComposeStore } from '../../stores/compose-store'
import { tweetLength } from '../../lib/compose/tweet-length'
import { TWEET_LIMIT, LONGFORM_LIMIT, type PostSegment } from '../../lib/compose/types'
import { CharRing } from './char-ring'
import { FormatToolbar } from './format-toolbar'
import { MediaAttachments } from './media-attachments'
import { PollEditor } from './poll-editor'
import { DraftSegmentToolbar } from './draft-media-button'

interface SegmentEditorProps {
  threadId: string
  segment: PostSegment
  index: number
  total: number
  longform: boolean
}

export function SegmentEditor({ threadId, segment, index, total, longform }: SegmentEditorProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  // Own this segment from the store so sibling editors don't re-render on each key,
  // and media/poll stay live even when the parent only passes a structural stub.
  const liveSegment: PostSegment =
    useComposeStore(
      (s) => s.threads[threadId]?.draft.segments.find((seg) => seg.id === segment.id),
    ) ?? segment
  const text = liveSegment.text
  const setSegmentText = useComposeStore((s) => s.setSegmentText)
  const removeSegment = useComposeStore((s) => s.removeSegment)
  const moveSegment = useComposeStore((s) => s.moveSegment)

  const limit = longform ? LONGFORM_LIMIT : TWEET_LIMIT
  const used = tweetLength(text)

  return (
    <div className="space-y-1.5">
      {/* Draft bubble — text + media thumbs only (no poll / action chrome) */}
      <div className="border border-[var(--color-border-faint)] rounded-lg p-3 bg-[var(--color-bg-surface)] space-y-2">
        {total > 1 && (
          <div className="flex items-center gap-2 text-[10px] text-white/25">
            <span className="font-mono">{index + 1}/{total}</span>
            <div className="flex-1" />
            <button
              onClick={() => moveSegment(threadId, segment.id, -1)}
              disabled={index === 0}
              className="hover:text-white/60 transition-colors disabled:opacity-20"
            >
              ↑
            </button>
            <button
              onClick={() => moveSegment(threadId, segment.id, 1)}
              disabled={index === total - 1}
              className="hover:text-white/60 transition-colors disabled:opacity-20"
            >
              ↓
            </button>
            <button onClick={() => removeSegment(threadId, segment.id)} className="hover:text-red-400/70 transition-colors">
              Remove
            </button>
          </div>
        )}

        <FormatToolbar
          value={text}
          onChange={(next) => setSegmentText(threadId, segment.id, next)}
          textareaRef={textareaRef}
        />

        <textarea
          ref={textareaRef}
          value={text}
          onChange={(e) => setSegmentText(threadId, segment.id, e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && e.shiftKey) {
              e.preventDefault()
              const el = e.currentTarget
              const { selectionStart: start, selectionEnd: end, value } = el
              const next = value.slice(0, start) + '\n' + value.slice(end)
              setSegmentText(threadId, segment.id, next)
              requestAnimationFrame(() => {
                el.selectionStart = el.selectionEnd = start + 1
              })
            }
          }}
          rows={Math.max(6, Math.ceil((text.length || 1) / 60))}
          placeholder={index === 0 ? 'What do you want to post?' : 'Continue the thread…'}
          className="w-full bg-transparent text-[13px] text-white/85 font-with-emoji outline-none resize-none placeholder:text-[var(--color-text-placeholder)] min-h-[7.5rem]"
        />

        <MediaAttachments threadId={threadId} segment={liveSegment} />

        <div className="flex items-center justify-end pt-0.5">
          <CharRing used={used} limit={limit} />
        </div>
      </div>

      {/* Toolbar under every bubble — same language as + Add thread */}
      <DraftSegmentToolbar threadId={threadId} segment={liveSegment} />

      {/* Poll form only when enabled — sits under the toolbar, not in the bubble */}
      {liveSegment.poll && (
        <PollEditor threadId={threadId} segment={liveSegment} />
      )}
    </div>
  )
}
