import { useEffect, useMemo } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { useComposeStore } from '../../stores/compose-store'
import { containsUrl } from '../../lib/compose/tweet-length'
import {
  resolveLongform,
  filterReplySettingOptions,
  syncDraftForVerification,
} from '../../lib/compose/verified-features'
import { useComposeVerified } from '../../hooks/use-compose-verified'
import { clearArticleIfStale, promoteDraftToArticle } from '../../lib/compose/format'
import { emptySegment, type ReplySettings } from '../../lib/compose/types'
import { CheckboxField } from '../ui/checkbox'
import { SegmentEditor } from './segment-editor'
import { TargetPicker } from './target-picker'
import { RegisterControls } from './register-controls'
import { FormatPreference } from './format-preference'
import { ArticleComposer } from './article-composer'

interface PostComposerProps {
  threadId: string
}

export function PostComposer({ threadId }: PostComposerProps) {
  // Structural draft fields only — segment text is owned by SegmentEditor so
  // typing one segment does not re-render the whole composer shell.
  // All values must be primitives/stable refs so useShallow can skip re-renders
  // when only segment *text* changes (not ids / flags).
  const shell = useComposeStore(
    useShallow((s) => {
      const d = s.threads[threadId]?.draft
      if (!d) return null
      return {
        segmentIdsKey: d.segments.map((seg) => seg.id).join('\0'),
        target: d.target,
        longform: d.longform,
        madeWithAi: d.madeWithAi,
        replySettings: d.replySettings,
        // Match resolveDraftFormat: only treat as article when title/body has content.
        hasArticleContent: Boolean(
          d.article && (d.article.title.trim() || d.article.bodyMarkdown.trim()),
        ),
        hasLink: d.segments.some((seg) => containsUrl(seg.text)),
      }
    }),
  )
  const applyDraftPatch = useComposeStore((s) => s.applyDraftPatch)
  const setLongformPreference = useComposeStore((s) => s.setLongformPreference)
  const longformPreference = useComposeStore((s) => s.longformPreference)
  const preferredFormat = useComposeStore(
    (s) => s.threads[threadId]?.preferredFormat ?? 'auto',
  )
  const resetDraft = useComposeStore((s) => s.resetDraft)
  const { connected, isVerified } = useComposeVerified()

  useEffect(() => {
    const current = useComposeStore.getState().threads[threadId]
    if (!current) return
    const pref = useComposeStore.getState().longformPreference
    const patch = syncDraftForVerification(current.draft, isVerified, pref)
    if (patch) applyDraftPatch(threadId, patch)
  }, [isVerified, longformPreference, threadId, applyDraftPatch])

  // Seed / migrate into article when user picks Article preference.
  // Prefer promoting segment copy over wiping it for an empty shell.
  useEffect(() => {
    if (preferredFormat !== 'article') return
    const current = useComposeStore.getState().threads[threadId]
    if (!current) return
    const patch = promoteDraftToArticle(current.draft)
    if (patch) applyDraftPatch(threadId, patch)
  }, [preferredFormat, threadId, applyDraftPatch])

  // Clear stale article on explicit non-article shapes. Auto keeps article when
  // the draft still resolves as article.
  useEffect(() => {
    if (
      preferredFormat !== 'post' &&
      preferredFormat !== 'thread' &&
      preferredFormat !== 'longform'
    ) {
      return
    }
    const current = useComposeStore.getState().threads[threadId]
    if (!current?.draft.article) return
    applyDraftPatch(
      threadId,
      clearArticleIfStale({ longform: preferredFormat === 'longform' }, preferredFormat),
    )
  }, [preferredFormat, threadId, applyDraftPatch])

  const segments = useMemo(() => {
    if (!shell?.segmentIdsKey) return []
    // Pass stub segments; SegmentEditor reads live text from the store.
    return shell.segmentIdsKey.split('\0').filter(Boolean).map((id) => ({
      id,
      text: '',
      media: [] as [],
    }))
  }, [shell?.segmentIdsKey])

  if (!shell) {
    return <div className="flex items-center justify-center h-full text-[12px] text-[var(--color-text-quaternary)]">Start composing</div>
  }

  // Prefer explicit format preference; only probe article presence for auto.
  const showArticle =
    preferredFormat === 'article' ||
    (preferredFormat === 'auto' && shell.hasArticleContent)
  const longform = resolveLongform(shell.longform, preferredFormat, isVerified)
  const replyOptions = filterReplySettingOptions(isVerified)

  return (
    <div className="h-full overflow-y-auto px-5 py-4 space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0 flex-1">
          <FormatPreference threadId={threadId} />
        </div>
        {showArticle && (
          <button
            type="button"
            onClick={() => resetDraft(threadId)}
            className="shrink-0 text-[10px] text-[var(--color-text-quaternary)] hover:text-[var(--color-text-tertiary)] transition-colors self-end mb-0.5"
          >
            Clear
          </button>
        )}
      </div>
      {showArticle ? (
        <ArticleComposer threadId={threadId} />
      ) : (
        <>
          <TargetPicker threadId={threadId} target={shell.target} />

          <div className="space-y-3">
            {segments.map((seg, i) => (
              <SegmentEditor
                key={seg.id}
                threadId={threadId}
                segment={seg}
                index={i}
                total={segments.length}
                longform={longform}
              />
            ))}
          </div>

          {shell.hasLink && (
            <p className="text-[10px] text-amber-400/70">
              Contains a link — X charges ~$0.20 per post with a URL (vs $0.015 without).
            </p>
          )}
        </>
      )}

      <div className="pt-2 border-t border-[var(--color-border-faint)] space-y-2">
        {!showArticle && (
          isVerified ? (
            <CheckboxField
              label="Long-form (up to 25k chars)"
              checked={shell.longform}
              onChange={(nextLongform) => {
                setLongformPreference(nextLongform)
                applyDraftPatch(threadId, { longform: nextLongform })
              }}
              className="text-[11px] text-[var(--color-text-tertiary)] gap-2"
            />
          ) : (
            <p className="text-[10px] text-[var(--color-text-quaternary)] leading-snug">
              {!connected
                ? 'Connect your X account to post. Verified accounts unlock long-form posts and verified-only reply settings.'
                : 'Long-form posts and verified-only reply settings require a verified X account.'}
            </p>
          )
        )}
        <CheckboxField
          label="Label as AI-generated (made_with_ai)"
          checked={shell.madeWithAi}
          onChange={(madeWithAi) => applyDraftPatch(threadId, { madeWithAi })}
          className="text-[11px] text-[var(--color-text-tertiary)] gap-2"
        />
        {!showArticle && (
          <label className="block text-[11px] text-[var(--color-text-tertiary)]">
            Who can reply
            <select
              value={shell.replySettings ?? 'everyone'}
              onChange={(e) => applyDraftPatch(threadId, { replySettings: e.target.value as ReplySettings })}
              className="w-full mt-1 bg-[var(--color-bg-input)] border border-[var(--color-border-faint)] rounded-md px-2 py-1.5 text-[11px] text-[var(--color-text-secondary)] outline-none"
            >
              {replyOptions.map((r) => (
                <option key={r.value} value={r.value}>{r.label}</option>
              ))}
            </select>
          </label>
        )}
        <RegisterControls threadId={threadId} />
      </div>
    </div>
  )
}
