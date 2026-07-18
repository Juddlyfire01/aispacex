import { memo, useEffect, useRef, useState, type ComponentPropsWithoutRef } from 'react'
import ReactMarkdown, { defaultUrlTransform } from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { remarkEtherscan } from '../../lib/x-intel/remark-etherscan'
import { remarkMention } from '../../lib/x-intel/remark-mention'
import { remarkPost } from '../../lib/x-intel/remark-post'
import { ETH_IDENTITY_SCHEME, identityFromHref } from '../../lib/x-intel/etherscan'
import { MENTION_SCHEME, usernameFromHref } from '../../lib/x-intel/mention'
import { POST_SCHEME, postIdFromHref, postIdFromStatusUrl, normalizePostId } from '../../lib/x-intel/evidence'
import { EthAddressLink } from '../x-intel/eth-address-link'
import { MentionLink } from '../x-intel/mention-link'
import { PostLink } from '../x-intel/post-link'
import { cn } from '../../lib/utils'

// Shared markdown rendering for assistant chat output — used by the main Chat
// view and the Intel → Post composer's assistant panel so both surfaces stay
// visually and behaviorally identical. User-authored text is intentionally
// NOT run through this (rendered as plain whitespace-pre-wrap instead) so
// literal asterisks/underscores in what someone types aren't reinterpreted as
// formatting, and so pasted example markdown displays as typed.

// Allow http/https/mailto links and image data: URIs only. Strips javascript:,
// vbscript:, file:, and any other smuggled protocols.
const SAFE_URL_PROTOCOLS = /^(https?:|mailto:|#|\/|\.)/i
function safeUrlTransform(url: string, key: string): string {
  if (!url) return ''
  // react-markdown's default already handles most protocol filtering; we layer
  // an explicit allow-list on top because we render untrusted model output.
  // Preserve our internal ETH-identity sentinel so the link renderer can swap
  // in the interactive explorer popover. It never becomes a real href.
  if (url.startsWith(ETH_IDENTITY_SCHEME)) return url
  if (url.startsWith(MENTION_SCHEME)) return url
  if (url.startsWith(POST_SCHEME)) return url
  const cleaned = defaultUrlTransform(url)
  if (!cleaned) return ''
  if (key === 'src' && cleaned.startsWith('data:image/')) return cleaned
  if (SAFE_URL_PROTOCOLS.test(cleaned)) return cleaned
  return ''
}

function CodeBlock({ children, className, ...props }: ComponentPropsWithoutRef<'code'>) {
  const match = /language-(\w+)/.exec(className || '')
  const lang = match ? match[1] : ''
  const codeStr = String(children).replace(/\n$/, '')
  const [codeCopied, setCodeCopied] = useState(false)

  if (!className && !String(children).includes('\n')) {
    // A model that monospaces a lone post id (`2075…`) or status URL would
    // otherwise defeat auto-linking, since remarkPost skips inlineCode. Detect
    // that single-token case and swap in the interactive PostLink instead.
    const inlineText = String(children).trim()
    const inlinePostId =
      normalizePostId(inlineText.replace(/^post:/, '')) ?? postIdFromStatusUrl(inlineText)
    if (inlinePostId) return <PostLink postId={inlinePostId} />
    return <code className={className} {...props}>{children}</code>
  }

  return (
    <div className="relative group/code">
      {lang && (
        <div className="absolute top-0 left-0 px-3 py-1.5 text-[13px] text-[var(--color-text-quaternary)] font-mono uppercase tracking-wider select-none">{lang}</div>
      )}
      <button
        onClick={() => { navigator.clipboard.writeText(codeStr); setCodeCopied(true); setTimeout(() => setCodeCopied(false), 1500) }}
        className="absolute top-1.5 right-1.5 px-2 py-1 text-[13px] font-medium text-[var(--color-text-quaternary)] hover:text-[var(--color-text-tertiary)] bg-[var(--color-border-faint)] hover:bg-[var(--color-border-faint)] rounded-md transition-all opacity-0 group-hover/code:opacity-100"
      >
        {codeCopied ? 'Copied' : 'Copy'}
      </button>
      <code className={className} {...props}>{children}</code>
    </div>
  )
}

interface MarkdownMessageProps {
  content: string
  /** Sizing variant — `full` matches the main chat view, `compact` matches dense
   * panels like the compose assistant chat. Controls the prose font-size. */
  size?: 'full' | 'compact'
  className?: string
  /** Whether inline @mentions offer "Add as intel target". Off for surfaces with
   *  no target concept (e.g. self report). Defaults to true. */
  canAddTarget?: boolean
  /**
   * When true, GFM reparse is throttled (~12fps) so streaming tokens stay
   * readable without re-running remark on every drip. Final content always
   * flushes when streaming ends.
   */
  streaming?: boolean
}

/** While streaming, reparse markdown ~12fps; flush immediately when streaming ends. */
function useStreamRenderContent(content: string, streaming: boolean): string {
  const [shown, setShown] = useState(content)
  const lastFlushRef = useRef(0)
  const timerRef = useRef<number | null>(null)
  const contentRef = useRef(content)
  contentRef.current = content

  useEffect(() => {
    if (!streaming) {
      if (timerRef.current != null) {
        window.clearTimeout(timerRef.current)
        timerRef.current = null
      }
      setShown(content)
      return
    }

    const flush = () => {
      timerRef.current = null
      lastFlushRef.current = performance.now()
      setShown(contentRef.current)
    }

    // First tokens: paint immediately.
    if (lastFlushRef.current === 0) {
      flush()
      return
    }

    const elapsed = performance.now() - lastFlushRef.current
    if (elapsed >= 80) {
      flush()
      return
    }
    if (timerRef.current != null) return
    timerRef.current = window.setTimeout(flush, 80 - elapsed)
  }, [content, streaming])

  useEffect(
    () => () => {
      if (timerRef.current != null) window.clearTimeout(timerRef.current)
    },
    [],
  )

  return streaming ? shown : content
}

/** Renders assistant markdown output with shared link-safety, code-block, and
 * prose styling. Wrap in `prose-venice` + a size modifier so both chat
 * surfaces share one visual language. */
export const MarkdownMessage = memo(function MarkdownMessage({
  content,
  size = 'full',
  className,
  canAddTarget = true,
  streaming = false,
}: MarkdownMessageProps) {
  const renderContent = useStreamRenderContent(content, streaming)

  return (
    <div className={cn('prose-venice', size === 'compact' && 'prose-venice-compact', className)}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkEtherscan, remarkMention, remarkPost]}
        urlTransform={safeUrlTransform}
        components={{
          code: CodeBlock,
          a: ({ href, children, ...props }) => {
            const identity = identityFromHref(href)
            if (identity) return <EthAddressLink identity={identity} />
            const username = usernameFromHref(href)
            if (username) return <MentionLink username={username} canAddTarget={canAddTarget} />
            // Bare snowflake ids (via remarkPost sentinel) and full status URLs
            // both become the interactive post popover (Open in X / Add to draft).
            const postId = postIdFromHref(href) ?? postIdFromStatusUrl(href)
            if (postId) return <PostLink postId={postId} label={children} />
            return (
              <a {...props} href={href} target="_blank" rel="noopener noreferrer ugc">
                {children}
              </a>
            )
          },
        }}
      >
        {renderContent}
      </ReactMarkdown>
    </div>
  )
})
