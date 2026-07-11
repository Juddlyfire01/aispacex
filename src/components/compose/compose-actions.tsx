import { useState } from 'react'
import { useComposeStore } from '../../stores/compose-store'
import { useXSelfStore } from '../../stores/x-self-store'
import { resolveDraftFormat } from '../../lib/compose/format'
import { classifyPostability } from '../../lib/compose/postability'
import { serializeDraftForCopy } from '../../lib/compose/serialize'
import { tweetLength } from '../../lib/compose/tweet-length'
import { effectiveLongform, prepareDraftForPost } from '../../lib/compose/verified-features'
import { TWEET_LIMIT, LONGFORM_LIMIT } from '../../lib/compose/types'
import { postDraft, XPostError } from '../../lib/compose/x-post-client'
import { beginSelfLogin } from '../../lib/x-intel/self-client'
import { useComposeVerified } from '../../hooks/use-compose-verified'

// Native media posting is not wired yet, so drafts with media route to copy.
const CAPS = { mediaNativeSupported: false }

interface ComposeActionsProps {
  threadId: string
  copied: boolean
  setCopied: (v: boolean) => void
}

export function ComposeActions({ threadId, copied, setCopied }: ComposeActionsProps) {
  const thread = useComposeStore((s) => s.threads[threadId])
  const resetDraft = useComposeStore((s) => s.resetDraft)
  const connected = useXSelfStore((s) => s.connected)
  const { isVerified } = useComposeVerified()
  const longformPreference = useComposeStore((s) => s.longformPreference)
  const [posting, setPosting] = useState(false)
  const [postedUrl, setPostedUrl] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [needsReconnect, setNeedsReconnect] = useState(false)

  if (!thread) return null

  const { draft } = thread
  const postability = classifyPostability(draft, CAPS)
  const isArticle = resolveDraftFormat(draft) === 'article'
  const longform = effectiveLongform(draft.longform, isVerified)
  const limit = longform ? LONGFORM_LIMIT : TWEET_LIMIT
  const overLimit = isArticle ? false : draft.segments.some((s) => tweetLength(s.text) > limit)
  const empty = isArticle
    ? !(draft.article?.title.trim() || draft.article?.bodyMarkdown.trim())
    : draft.segments.every((s) => s.text.trim() === '' && s.media.length === 0)
  const blocked = empty || overLimit

  const copy = async () => {
    await navigator.clipboard.writeText(serializeDraftForCopy(draft))
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  const post = async () => {
    setPosting(true)
    setError(null)
    setPostedUrl(null)
    setNeedsReconnect(false)
    try {
      const result = await postDraft(prepareDraftForPost(draft, isVerified, longformPreference))
      setPostedUrl(result.url)
      resetDraft(threadId)
    } catch (e) {
      if (e instanceof XPostError) {
        setError(e.message)
        setNeedsReconnect(e.needsReconnect)
      } else {
        setError(e instanceof Error ? e.message : 'Post failed')
      }
    } finally {
      setPosting(false)
    }
  }

  return (
    <div className="px-5 py-3 border-t border-white/[0.05] space-y-2">
      {postability.mode === 'copy' && postability.reason && (
        <p className="text-[10px] text-white/40 leading-snug">{postability.reason}</p>
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
        {postability.mode === 'api' ? (
          <button
            onClick={post}
            disabled={!connected || blocked || posting}
            title={!connected ? 'Connect your X account (header → Connect X)' : undefined}
            className="px-3 py-1.5 text-[11px] font-medium rounded-md bg-[var(--color-btn-primary-bg)] text-[var(--color-btn-primary-fg)] hover:opacity-90 transition-opacity disabled:opacity-30 disabled:cursor-not-allowed"
          >
            {posting ? 'Posting…' : draft.segments.length > 1 ? 'Post thread' : 'Post to X'}
          </button>
        ) : null}
        <button
          onClick={copy}
          disabled={empty}
          className="px-3 py-1.5 text-[11px] font-medium bg-white/10 text-white/80 rounded-md hover:bg-white/15 transition-colors disabled:opacity-30"
        >
          {copied ? 'Copied ✓' : 'Copy to X'}
        </button>
      </div>
    </div>
  )
}
