import { useState, useRef, useEffect, useMemo, useCallback } from 'react'
import { useComposeStore } from '../../stores/compose-store'
import { useCompose } from '../../hooks/use-compose'
import { MarkdownMessage } from '../chat/markdown-message'

/** Distance from bottom (px) still counts as "following" the stream. */
const STICK_BOTTOM_PX = 80

function distanceFromBottom(el: HTMLElement): number {
  return el.scrollHeight - el.scrollTop - el.clientHeight
}

interface ComposeChatProps {
  threadId: string
  sendBlocked?: boolean
}

export function ComposeChat({ threadId, sendBlocked }: ComposeChatProps) {
  const thread = useComposeStore((s) => s.threads[threadId])
  const toolActivity = useComposeStore((s) => s.toolActivity)
  const setDraftDrawerOpen = useComposeStore((s) => s.setDraftDrawerOpen)
  const { send, stop, isStreaming } = useCompose()
  const [input, setInput] = useState('')
  const scrollRef = useRef<HTMLDivElement>(null)
  const scrollRafRef = useRef<number | null>(null)
  /** Follow new content until the user scrolls away from the bottom. */
  const stickToBottomRef = useRef(true)

  const messages = useMemo(() => thread?.messages ?? [], [thread?.messages])
  const lastContent =
    typeof messages[messages.length - 1]?.content === 'string'
      ? (messages[messages.length - 1]!.content as string)
      : ''

  // New thread → re-attach follow (and jump to bottom once messages load).
  useEffect(() => {
    stickToBottomRef.current = true
  }, [threadId])

  const onScroll = useCallback(() => {
    const el = scrollRef.current
    if (!el) return
    stickToBottomRef.current = distanceFromBottom(el) <= STICK_BOTTOM_PX
  }, [])

  // Auto-scroll only while stick-to-bottom; at most once per frame.
  useEffect(() => {
    if (!stickToBottomRef.current) return
    if (scrollRafRef.current != null) return
    scrollRafRef.current = requestAnimationFrame(() => {
      scrollRafRef.current = null
      const el = scrollRef.current
      if (!el || !stickToBottomRef.current) return
      el.scrollTop = el.scrollHeight
    })
    return () => {
      if (scrollRafRef.current != null) {
        cancelAnimationFrame(scrollRafRef.current)
        scrollRafRef.current = null
      }
    }
  }, [lastContent, toolActivity, messages.length])

  const canSend = Boolean(input.trim()) && !isStreaming && !sendBlocked

  const submit = () => {
    const text = input.trim()
    if (!text || isStreaming || sendBlocked) return
    setInput('')
    // Sending re-pins the viewport so the new reply is followed.
    stickToBottomRef.current = true
    void send(text)
  }

  return (
    <div className="flex flex-col h-full min-h-0">
      <div
        ref={scrollRef}
        onScroll={onScroll}
        className="flex-1 min-h-0 overflow-y-auto px-4 py-4 space-y-3"
      >
        {messages.length === 0 ? (
          <div className="text-[12px] text-white/20 leading-relaxed space-y-2">
            <p>
              Describe the post you want. Your local intel library (Me, All, or a target) is packed
              into a hot window for this chat&apos;s sticky context.
            </p>
            <p>
              Use the history rail to switch threads or start + New chat. Library tools dig into
              stored intel; <code className="text-white/30">compose_history_*</code> tools can
              search past Post chats. Live X search is available when enabled — drafts open in the
              Draft panel.
            </p>
          </div>
        ) : (
          messages.map((m, i) => {
            const isLast = i === messages.length - 1
            const content = typeof m.content === 'string' ? m.content : ''

            if (m.role === 'user' && content) {
              return (
                <div
                  key={i}
                  className="ml-auto max-w-[85%] bg-white/[0.06] rounded-lg px-3 py-2 text-[12.5px] text-white/85 whitespace-pre-wrap break-words"
                >
                  {content}
                </div>
              )
            }

            if (m.role === 'assistant') {
              // Empty placeholder while tools run / before first token.
              if (!content) {
                if (isStreaming && isLast) {
                  return (
                    <div key={i} className="text-[12px] text-white/30">
                      {toolActivity ? `${toolActivity}…` : 'Thinking…'}
                    </div>
                  )
                }
                return null
              }
              // Same markdown renderer as main chat (incl. mid-stream). Token
              // batching + lightweight store append keep re-parse cost in check.
              return (
                <MarkdownMessage
                  key={i}
                  content={content}
                  size="compact"
                  className="max-w-[92%] text-[12.5px] text-white/70"
                />
              )
            }

            return null
          })
        )}
      </div>

      <div className="px-4 py-3 border-t border-white/[0.05]">
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              submit()
            }
          }}
          rows={2}
          placeholder="Message… (Enter to send, Shift+Enter for newline)"
          className="w-full bg-[var(--color-bg-input)] border border-[var(--color-border-faint)] rounded-md px-3 py-2 text-[12.5px] text-white/85 outline-none focus:border-[var(--color-border-strong)] resize-none placeholder:text-[var(--color-text-placeholder)]"
        />
        <div className="flex items-center gap-2 mt-2">
          {isStreaming ? (
            <button
              type="button"
              onClick={stop}
              className="px-3 py-1 text-[11px] font-medium bg-white/10 text-white/80 rounded-md hover:bg-white/15 transition-colors"
            >
              Stop
            </button>
          ) : (
            <button
              type="button"
              onClick={submit}
              disabled={!canSend}
              className="px-3 py-1 text-[11px] font-medium rounded-md bg-[var(--color-btn-primary-bg)] text-[var(--color-btn-primary-fg)] hover:opacity-90 transition-opacity disabled:opacity-30"
            >
              Send
            </button>
          )}
          <button
            type="button"
            onClick={() => setDraftDrawerOpen(true)}
            className="px-3 py-1 text-[11px] font-medium border border-[var(--color-border-faint)] text-white/70 rounded-md hover:text-white/90 hover:border-[var(--color-border-strong)] transition-colors"
          >
            Draft
          </button>
          {toolActivity && (
            <span className="text-[10px] text-white/30 truncate">{toolActivity}</span>
          )}
          {sendBlocked && (
            <span className="text-[10px] text-amber-400/60 truncate">
              Hot window over budget — adjust library settings
            </span>
          )}
        </div>
      </div>
    </div>
  )
}
