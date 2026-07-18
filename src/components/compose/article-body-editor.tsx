import { useCallback, useEffect, useRef } from 'react'
import { articleHtmlToMarkdown, markdownToArticleHtml } from '../../lib/compose/article-html'
import { ArticleFormatToolbar } from './article-format-toolbar'

interface ArticleBodyEditorProps {
  value: string
  onChange: (markdown: string) => void
  /** When true, body is read-only rich HTML that streams in; scroll follows until you scroll up. */
  streaming?: boolean
}

/** Only this close to the bottom counts as "following" the stream. */
const STICK_BOTTOM_PX = 40

function distanceFromBottom(el: HTMLElement): number {
  return el.scrollHeight - el.scrollTop - el.clientHeight
}

export function ArticleBodyEditor({ value, onChange, streaming = false }: ArticleBodyEditorProps) {
  const editorRef = useRef<HTMLDivElement>(null)
  const lastEmitted = useRef<string | null>(null)
  const seeded = useRef(false)
  const stickToBottomRef = useRef(true)
  const ignoreScrollRef = useRef(false)
  const touchYRef = useRef<number | null>(null)
  const wasStreamingRef = useRef(false)
  // Incremental streaming render: how many chars of markdown are already
  // committed as stable DOM, and the DOM node holding the not-yet-stable tail.
  const stableLenRef = useRef(0)
  const tailNodeRef = useRef<HTMLDivElement | null>(null)

  // New stream → re-attach follow so the first tokens stay in view.
  useEffect(() => {
    if (streaming && !wasStreamingRef.current) {
      stickToBottomRef.current = true
    }
    wasStreamingRef.current = streaming
  }, [streaming])

  const onScroll = useCallback(() => {
    if (ignoreScrollRef.current) return
    const el = editorRef.current
    if (!el) return
    stickToBottomRef.current = distanceFromBottom(el) <= STICK_BOTTOM_PX
  }, [])

  // Wheel / touch up unpins immediately so the user isn't fighting the stream.
  useEffect(() => {
    const el = editorRef.current
    if (!el) return

    const onWheel = (e: WheelEvent) => {
      if (e.deltaY < 0) {
        stickToBottomRef.current = false
        return
      }
      if (e.deltaY > 0 && distanceFromBottom(el) <= STICK_BOTTOM_PX) {
        stickToBottomRef.current = true
      }
    }

    const onTouchStart = (e: TouchEvent) => {
      touchYRef.current = e.touches[0]?.clientY ?? null
    }

    const onTouchMove = (e: TouchEvent) => {
      const y = e.touches[0]?.clientY
      const prev = touchYRef.current
      if (y == null || prev == null) return
      if (y > prev + 4) stickToBottomRef.current = false
      else if (y < prev - 4 && distanceFromBottom(el) <= STICK_BOTTOM_PX) {
        stickToBottomRef.current = true
      }
      touchYRef.current = y
    }

    el.addEventListener('wheel', onWheel, { passive: true })
    el.addEventListener('touchstart', onTouchStart, { passive: true })
    el.addEventListener('touchmove', onTouchMove, { passive: true })
    return () => {
      el.removeEventListener('wheel', onWheel)
      el.removeEventListener('touchstart', onTouchStart)
      el.removeEventListener('touchmove', onTouchMove)
    }
  }, [])

  // Sync rich HTML from store; preserve scroll unless we're following the stream.
  useEffect(() => {
    const el = editorRef.current
    if (!el) return

    const settleScroll = (follow: boolean, prevTop: number) => {
      ignoreScrollRef.current = true
      if (follow) el.scrollTop = el.scrollHeight
      else el.scrollTop = prevTop
      requestAnimationFrame(() => {
        ignoreScrollRef.current = false
      })
    }

    // Full (re)seed. Also used to (re)initialize incremental streaming state.
    const seed = () => {
      el.innerHTML = markdownToArticleHtml(value) || '<p><br></p>'
      lastEmitted.current = value
      seeded.current = true
      resetIncremental()
      if (streaming && stickToBottomRef.current) settleScroll(true, 0)
    }

    // Discard any incremental streaming scaffolding.
    function resetIncremental() {
      stableLenRef.current = 0
      tailNodeRef.current = null
    }

    if (!seeded.current) {
      seed()
      return
    }

    // Streaming just ended: canonicalize the DOM once (drop the tail wrapper)
    // so contentEditable + articleHtmlToMarkdown round-trips cleanly on edit.
    if (!streaming && tailNodeRef.current) {
      const prevTop = el.scrollTop
      el.innerHTML = markdownToArticleHtml(value) || '<p><br></p>'
      lastEmitted.current = value
      resetIncremental()
      settleScroll(false, prevTop)
      return
    }

    if (value === lastEmitted.current) return

    // While streaming the writer only ever APPENDS. Render just the newly
    // stabilized block(s) + the small in-progress tail instead of reparsing
    // and replacing the entire document every frame (O(tail) not O(n)).
    if (streaming && typeof value === 'string' && value.startsWith(lastEmitted.current ?? '')) {
      const prevTop = el.scrollTop
      const follow = stickToBottomRef.current

      // Blocks are delimited by blank lines; everything up to the last "\n\n"
      // is committed. The remainder is the still-growing tail.
      const boundary = value.lastIndexOf('\n\n')
      const commitEnd = boundary >= 0 ? boundary + 2 : 0

      // Lazily create the tail container the first incremental frame.
      if (!tailNodeRef.current) {
        el.innerHTML = ''
        const tail = document.createElement('div')
        tail.setAttribute('data-streaming-tail', '')
        el.appendChild(tail)
        tailNodeRef.current = tail
        stableLenRef.current = 0
      }
      const tailEl = tailNodeRef.current

      // Commit any blocks that became stable since last frame.
      if (commitEnd > stableLenRef.current) {
        const chunkMd = value.slice(stableLenRef.current, commitEnd)
        const chunkHtml = markdownToArticleHtml(chunkMd)
        if (chunkHtml) {
          const holder = document.createElement('div')
          holder.innerHTML = chunkHtml
          while (holder.firstChild) el.insertBefore(holder.firstChild, tailEl)
        }
        stableLenRef.current = commitEnd
      }

      // Re-render only the tail (one block worth of markdown).
      tailEl.innerHTML = markdownToArticleHtml(value.slice(stableLenRef.current))

      lastEmitted.current = value
      settleScroll(follow, prevTop)
      return
    }

    // Non-append change (user edit race, reset, or non-streaming): full render.
    if (!streaming) {
      const currentMd = articleHtmlToMarkdown(el.innerHTML)
      if (currentMd === value) {
        lastEmitted.current = value
        return
      }
    }

    const prevTop = el.scrollTop
    const follow = streaming && stickToBottomRef.current

    el.innerHTML = markdownToArticleHtml(value) || '<p><br></p>'
    lastEmitted.current = value
    resetIncremental()
    settleScroll(follow, prevTop)
  }, [value, streaming])

  const emitFromDom = () => {
    if (streaming) return
    const el = editorRef.current
    if (!el) return
    const md = articleHtmlToMarkdown(el.innerHTML)
    lastEmitted.current = md
    onChange(md)
  }

  return (
    <div className="border border-[var(--color-border-faint)] rounded-lg p-3 bg-[var(--color-bg-surface)] space-y-2">
      {!streaming && <ArticleFormatToolbar editorRef={editorRef} onEdited={emitFromDom} />}
      {streaming && (
        <div className="flex items-center gap-2 text-[10px] text-[var(--color-text-quaternary)]">
          <span className="inline-block size-1.5 rounded-full bg-emerald-400/80 animate-pulse" />
          Writing article…
          <span className="text-[var(--color-text-quaternary)]">scroll up to unpin</span>
        </div>
      )}
      <div
        ref={editorRef}
        contentEditable={!streaming}
        suppressContentEditableWarning
        role="textbox"
        aria-multiline
        aria-readonly={streaming || undefined}
        aria-label="Article body"
        data-placeholder="Article body…"
        onInput={emitFromDom}
        onBlur={emitFromDom}
        onScroll={onScroll}
        className="article-body-editor min-h-[200px] max-h-[min(60vh,520px)] overflow-y-auto outline-none text-[14px] text-[var(--color-text-primary)] leading-relaxed font-with-emoji empty:before:content-[attr(data-placeholder)] empty:before:text-[var(--color-text-quaternary)]"
      />
      <style>{`
        .article-body-editor h1 {
          font-size: 1.35rem;
          font-weight: 700;
          margin: 0.75em 0 0.35em;
          line-height: 1.25;
          color: rgba(255,255,255,0.92);
        }
        .article-body-editor h2 {
          font-size: 1.15rem;
          font-weight: 650;
          margin: 0.7em 0 0.3em;
          line-height: 1.3;
          color: rgba(255,255,255,0.9);
        }
        .article-body-editor h3 {
          font-size: 1.02rem;
          font-weight: 600;
          margin: 0.65em 0 0.25em;
          line-height: 1.35;
          color: rgba(255,255,255,0.88);
        }
        .article-body-editor p { margin: 0.45em 0; }
        .article-body-editor ul { list-style: disc; padding-left: 1.25rem; margin: 0.45em 0; }
        .article-body-editor ol { list-style: decimal; padding-left: 1.25rem; margin: 0.45em 0; }
        .article-body-editor li { margin: 0.15em 0; }
        .article-body-editor blockquote {
          border-left: 3px solid rgba(255,255,255,0.2);
          padding-left: 0.75rem;
          margin: 0.55em 0;
          color: rgba(255,255,255,0.65);
        }
        .article-body-editor a {
          color: var(--color-link);
          text-decoration: underline;
          text-decoration-color: var(--color-link-soft);
          text-underline-offset: 2px;
        }
        .article-body-editor a:hover { text-decoration-color: var(--color-link); }
        .article-body-editor strong { font-weight: 700; }
        .article-body-editor em { font-style: italic; }
        .article-body-editor s { text-decoration: line-through; opacity: 0.85; }
      `}</style>
    </div>
  )
}
