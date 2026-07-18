import { useEffect, useState } from 'react'
import { flushSync } from 'react-dom'
import { useComposeStore } from '../../stores/compose-store'
import { useXSelfStore } from '../../stores/x-self-store'
import { resolveDraftFormat } from '../../lib/compose/format'
import { classifyPostability } from '../../lib/compose/postability'
import { getActiveSelfIdentity, resolveReplySummoned } from '../../lib/compose/reply-eligibility'
import { copyDraftToClipboard } from '../../lib/compose/serialize'
import { tweetLength } from '../../lib/compose/tweet-length'
import { resolveLongform, prepareDraftForPost } from '../../lib/compose/verified-features'
import { TWEET_LIMIT, LONGFORM_LIMIT } from '../../lib/compose/types'
import { publishArticleDraft, XArticleError } from '../../lib/compose/x-article-client'
import { XMediaError } from '../../lib/compose/x-media-client'
import { postDraft, XPostError } from '../../lib/compose/x-post-client'
import { beginSelfLogin } from '../../lib/x-intel/self-client'
import { useComposeVerified } from '../../hooks/use-compose-verified'
import { yieldForPaint } from '../../lib/yield-for-paint'

// Native media posting is not wired yet, so drafts with media route to copy.
const CAPS = { mediaNativeSupported: false }

const REPLY_TIP_CHECKING = 'Checking if this post summons you…'
const REPLY_TIP_BLOCKED = 'Needs @mention or quote of you'
const REPLY_TIP_OK = 'Allowed — they mentioned or quoted you'

interface ComposeActionsProps {
  threadId: string
  copied: boolean
  setCopied: (v: boolean) => void
}

export function ComposeActions({ threadId, copied, setCopied }: ComposeActionsProps) {
  const thread = useComposeStore((s) => s.threads[threadId])
  const resetDraft = useComposeStore((s) => s.resetDraft)
  const preferredFormat = useComposeStore(
    (s) => s.threads[threadId]?.preferredFormat ?? 'auto',
  )
  const connected = useXSelfStore((s) => s.connected)
  const activeAccountId = useXSelfStore((s) => s.activeAccountId)
  const { isVerified } = useComposeVerified()
  const longformPreference = useComposeStore((s) => s.longformPreference)
  const [posting, setPosting] = useState(false)
  const [postedUrl, setPostedUrl] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [needsReconnect, setNeedsReconnect] = useState(false)
  /** null = checking; true = API-allowed; false = not summoned. */
  const [replySummoned, setReplySummoned] = useState<boolean | null>(null)

  const draft = thread?.draft
  const replyPostId = draft?.target.kind === 'reply' ? draft.target.toPostId : ''
  const replyUsername = draft?.target.kind === 'reply' ? draft.target.toUsername : ''

  useEffect(() => {
    if (!draft || draft.target.kind !== 'reply') {
      setReplySummoned(null)
      return
    }

    let cancelled = false
    setReplySummoned(null)

    const me = getActiveSelfIdentity()
    const postId = draft.target.toPostId

    void (async () => {
      const { summoned } = await resolveReplySummoned(postId, me)
      if (cancelled) return
      setReplySummoned(summoned === true)
    })()

    return () => {
      cancelled = true
    }
  }, [draft?.target.kind, replyPostId, replyUsername, connected, activeAccountId])

  if (!thread || !draft) return null

  const isReply = draft.target.kind === 'reply'
  const postability = classifyPostability(draft, CAPS, preferredFormat, isVerified, {
    replySummoned: isReply ? replySummoned : undefined,
  })
  const isArticle =
    preferredFormat === 'article' || resolveDraftFormat(draft) === 'article'
  const longform = resolveLongform(draft.longform, preferredFormat, isVerified)
  const limit = longform ? LONGFORM_LIMIT : TWEET_LIMIT
  const overLimit = isArticle ? false : draft.segments.some((s) => tweetLength(s.text) > limit)
  const empty = isArticle
    ? !(
        !!draft.article?.title.trim() &&
        (!!draft.article.bodyMarkdown.trim() || draft.article.inlineMedia.length > 0)
      )
    : draft.segments.every((s) => s.text.trim() === '' && s.media.length === 0)
  const blocked = empty || overLimit
  const replyAllowed = isReply && replySummoned === true
  // Replies always show the primary button; other kinds only when API-postable.
  const showPrimary = isReply || postability.mode === 'api'
  const primaryDisabled =
    !connected ||
    blocked ||
    posting ||
    (isReply && !replyAllowed)

  const primaryTitle = !connected
    ? 'Connect your X account (header → Connect X)'
    : isReply
      ? replySummoned == null
        ? REPLY_TIP_CHECKING
        : replyAllowed
          ? REPLY_TIP_OK
          : REPLY_TIP_BLOCKED
      : undefined

  const copy = async () => {
    await copyDraftToClipboard(draft)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  const post = async () => {
    if (isReply && !replyAllowed) return
    flushSync(() => {
      setPosting(true)
      setError(null)
      setPostedUrl(null)
      setNeedsReconnect(false)
    })
    await yieldForPaint()
    try {
      const result = isArticle
        ? await publishArticleDraft(draft)
        : await postDraft(prepareDraftForPost(draft, isVerified, longformPreference))
      setPostedUrl(result.url)
      resetDraft(threadId)
    } catch (e) {
      if (e instanceof XPostError || e instanceof XArticleError || e instanceof XMediaError) {
        setError(e.message)
        setNeedsReconnect(e.needsReconnect)
      } else {
        setError(e instanceof Error ? e.message : 'Post failed')
      }
    } finally {
      setPosting(false)
    }
  }

  const primaryLabel = isArticle
    ? posting
      ? 'Publishing…'
      : 'Publish article'
    : posting
      ? isReply
        ? 'Replying…'
        : 'Posting…'
      : isReply
        ? draft.segments.length > 1
          ? 'Reply thread'
          : 'Reply'
        : draft.segments.length > 1
          ? 'Post thread'
          : 'Post to X'

  return (
    <div className="px-5 py-3 border-t border-[var(--color-border-faint)] space-y-2">
      {postability.mode === 'copy' && !isReply && postability.reason && (
        <p className="text-[10px] text-[var(--color-text-tertiary)] leading-snug">{postability.reason}</p>
      )}
      {overLimit && <p className="text-[10px] text-red-400/70">A segment is over the {limit}-character limit.</p>}
      {error && (
        <p className="text-[10px] text-red-400/70">
          {error}
          {needsReconnect && (
            <button onClick={beginSelfLogin} className="ml-2 underline hover:text-red-300">
              Reconnect X
            </button>
          )}
        </p>
      )}
      {postedUrl && (
        <p className="text-[10px] text-emerald-400/80">
          Posted.{' '}
          <a href={postedUrl} target="_blank" rel="noreferrer" className="underline hover:text-emerald-300">
            View on X
          </a>
        </p>
      )}

      <div className="flex items-center gap-2">
        {showPrimary ? (
          <button
            onClick={post}
            disabled={primaryDisabled}
            aria-busy={posting}
            title={primaryTitle}
            className="px-3 py-1.5 text-[11px] font-medium rounded-md bg-[var(--color-btn-primary-bg)] text-[var(--color-btn-primary-fg)] hover:opacity-90 transition-opacity disabled:opacity-30 disabled:cursor-not-allowed"
          >
            {primaryLabel}
          </button>
        ) : null}
        <button
          onClick={copy}
          disabled={empty}
          className="px-3 py-1.5 text-[11px] font-medium bg-[var(--color-border-faint)] text-[var(--color-text-primary)] rounded-md hover:bg-[var(--color-border-faint)] transition-colors disabled:opacity-30"
        >
          {copied ? 'Copied ✓' : 'Copy to X'}
        </button>
      </div>
    </div>
  )
}
