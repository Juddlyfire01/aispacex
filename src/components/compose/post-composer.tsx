import { useEffect } from 'react'
import { useComposeStore } from '../../stores/compose-store'
import { containsUrl } from '../../lib/compose/tweet-length'
import {
  effectiveLongform,
  filterReplySettingOptions,
  syncDraftForVerification,
} from '../../lib/compose/verified-features'
import { useComposeVerified } from '../../hooks/use-compose-verified'
import type { ReplySettings } from '../../lib/compose/types'
import { CheckboxField } from '../ui/checkbox'
import { SegmentEditor } from './segment-editor'
import { TargetPicker } from './target-picker'

interface PostComposerProps {
  threadId: string
}

export function PostComposer({ threadId }: PostComposerProps) {
  const thread = useComposeStore((s) => s.threads[threadId])
  const addSegment = useComposeStore((s) => s.addSegment)
  const applyDraftPatch = useComposeStore((s) => s.applyDraftPatch)
  const setLongformPreference = useComposeStore((s) => s.setLongformPreference)
  const longformPreference = useComposeStore((s) => s.longformPreference)
  const resetDraft = useComposeStore((s) => s.resetDraft)
  const { connected, isVerified } = useComposeVerified()

  useEffect(() => {
    const current = useComposeStore.getState().threads[threadId]
    if (!current) return
    const pref = useComposeStore.getState().longformPreference
    const patch = syncDraftForVerification(current.draft, isVerified, pref)
    if (patch) applyDraftPatch(threadId, patch)
  }, [isVerified, longformPreference, threadId, applyDraftPatch])

  if (!thread) {
    return <div className="flex items-center justify-center h-full text-[12px] text-white/15">Start composing</div>
  }

  const { draft } = thread
  const hasLink = draft.segments.some((seg) => containsUrl(seg.text))
  const longform = effectiveLongform(draft.longform, isVerified)
  const replyOptions = filterReplySettingOptions(isVerified)

  return (
    <div className="h-full overflow-y-auto px-5 py-4 space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-medium text-white/25 uppercase tracking-[0.08em]">Draft</span>
        <button onClick={() => resetDraft(threadId)} className="text-[10px] text-white/25 hover:text-white/50 transition-colors">
          Clear
        </button>
      </div>

      <TargetPicker threadId={threadId} target={draft.target} />

      <div className="space-y-2">
        {draft.segments.map((seg, i) => (
          <SegmentEditor
            key={seg.id}
            threadId={threadId}
            segment={seg}
            index={i}
            total={draft.segments.length}
            longform={longform}
          />
        ))}
      </div>

      <button
        onClick={() => addSegment(threadId)}
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
        {isVerified ? (
          <CheckboxField
            label="Long-form (up to 25k chars)"
            checked={draft.longform}
            onChange={(longform) => {
              setLongformPreference(longform)
              applyDraftPatch(threadId, { longform })
            }}
            className="text-[11px] text-white/50 gap-2"
          />
        ) : (
          <p className="text-[10px] text-white/30 leading-snug">
            {!connected
              ? 'Connect your X account to post. Verified accounts unlock long-form posts and verified-only reply settings.'
              : 'Long-form posts and verified-only reply settings require a verified X account.'}
          </p>
        )}
        <CheckboxField
          label="Label as AI-generated (made_with_ai)"
          checked={draft.madeWithAi}
          onChange={(madeWithAi) => applyDraftPatch(threadId, { madeWithAi })}
          className="text-[11px] text-white/50 gap-2"
        />
        <label className="block text-[11px] text-white/40">
          Who can reply
          <select
            value={draft.replySettings ?? 'everyone'}
            onChange={(e) => applyDraftPatch(threadId, { replySettings: e.target.value as ReplySettings })}
            className="w-full mt-1 bg-[var(--color-bg-input)] border border-[var(--color-border-faint)] rounded-md px-2 py-1.5 text-[11px] text-white/70 outline-none"
          >
            {replyOptions.map((r) => (
              <option key={r.value} value={r.value}>{r.label}</option>
            ))}
          </select>
        </label>
      </div>
    </div>
  )
}
