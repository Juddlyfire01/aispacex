import { useComposeStore } from '../../stores/compose-store'
import { containsUrl } from '../../lib/compose/tweet-length'
import type { ReplySettings } from '../../lib/compose/types'
import { SegmentEditor } from './segment-editor'
import { TargetPicker } from './target-picker'

interface PostComposerProps {
  context: string
}

const REPLY_SETTINGS: { value: ReplySettings; label: string }[] = [
  { value: 'everyone', label: 'Everyone can reply' },
  { value: 'following', label: 'Accounts you follow' },
  { value: 'mentionedUsers', label: 'Only mentioned' },
  { value: 'subscribers', label: 'Subscribers' },
  { value: 'verified', label: 'Verified accounts' },
]

export function PostComposer({ context }: PostComposerProps) {
  const session = useComposeStore((s) => s.sessions[context])
  const addSegment = useComposeStore((s) => s.addSegment)
  const applyDraftPatch = useComposeStore((s) => s.applyDraftPatch)
  const resetDraft = useComposeStore((s) => s.resetDraft)

  if (!session) {
    return <div className="flex items-center justify-center h-full text-[12px] text-white/15">Start composing</div>
  }

  const { draft } = session
  const hasLink = draft.segments.some((seg) => containsUrl(seg.text))

  return (
    <div className="h-full overflow-y-auto px-5 py-4 space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-medium text-white/25 uppercase tracking-[0.08em]">Draft</span>
        <button onClick={() => resetDraft(context)} className="text-[10px] text-white/25 hover:text-white/50 transition-colors">
          Clear
        </button>
      </div>

      <TargetPicker context={context} target={draft.target} />

      <div className="space-y-2">
        {draft.segments.map((seg, i) => (
          <SegmentEditor
            key={seg.id}
            context={context}
            segment={seg}
            index={i}
            total={draft.segments.length}
            longform={draft.longform}
          />
        ))}
      </div>

      <button
        onClick={() => addSegment(context)}
        className="text-[11px] text-white/30 hover:text-white/60 transition-colors"
      >
        + Add to thread
      </button>

      {hasLink && (
        <p className="text-[10px] text-amber-400/70">
          Contains a link — X charges ~$0.20 per post with a URL (vs $0.015 without).
        </p>
      )}

      <div className="pt-2 border-t border-white/[0.05] space-y-2">
        <label className="flex items-center gap-2 text-[11px] text-white/50 cursor-pointer">
          <input
            type="checkbox"
            checked={draft.longform}
            onChange={(e) => applyDraftPatch(context, { longform: e.target.checked })}
            className="accent-white"
          />
          Long-form (up to 25k chars — renders for Premium accounts)
        </label>
        <label className="flex items-center gap-2 text-[11px] text-white/50 cursor-pointer">
          <input
            type="checkbox"
            checked={draft.madeWithAi}
            onChange={(e) => applyDraftPatch(context, { madeWithAi: e.target.checked })}
            className="accent-white"
          />
          Label as AI-generated (made_with_ai)
        </label>
        <label className="block text-[11px] text-white/40">
          Who can reply
          <select
            value={draft.replySettings ?? 'everyone'}
            onChange={(e) => applyDraftPatch(context, { replySettings: e.target.value as ReplySettings })}
            className="w-full mt-1 bg-[var(--color-bg-input)] border border-[var(--color-border-faint)] rounded-md px-2 py-1.5 text-[11px] text-white/70 outline-none"
          >
            {REPLY_SETTINGS.map((r) => (
              <option key={r.value} value={r.value}>{r.label}</option>
            ))}
          </select>
        </label>
      </div>
    </div>
  )
}
