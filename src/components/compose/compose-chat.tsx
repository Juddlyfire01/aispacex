import { useState, useRef, useEffect, useMemo, useCallback } from 'react'
import { useComposeStore } from '../../stores/compose-store'
import { useCompose } from '../../hooks/use-compose'
import { useModels } from '../../hooks/use-models'
import { MarkdownMessage } from '../chat/markdown-message'
import { AgentActivity } from './agent-activity'
import { ContextRing } from './context-ring'
import { ContextUsagePopup } from './context-usage-popup'
import { buildComposeSystem } from '../../lib/compose/compose-prompt'
import { isDraftHandoffEnabled } from '../../lib/compose/draft-writer-tool'
import { COMPOSE_INTEL_TOOLS } from '../../lib/compose/intel-tools'
import { COMPOSE_HISTORY_TOOLS } from '../../lib/compose/history-tools'
import { COMPOSE_STATS_TOOLS } from '../../lib/compose/stats-tools'
import { COMPOSE_WRITE_DRAFT_TOOL } from '../../lib/compose/draft-writer-tool'
import { filterComposeToolModels, modelSupportsXSearch } from '../../lib/compose/model'
import { estimateComposeContextBreakdown } from '../../lib/compose/token-estimate'
import { messageContentString } from '../../lib/compose/thread-meta'
import type { ComposeMessage } from '../../lib/compose/thread-types'

/** Only this close to the bottom counts as "following" the stream. */
const STICK_BOTTOM_PX = 36
/** Scroll at most every N new characters while sticking — less yanky. */
const SCROLL_CHARS_BUCKET = 28

function distanceFromBottom(el: HTMLElement): number {
  return el.scrollHeight - el.scrollTop - el.clientHeight
}

interface ComposeChatProps {
  threadId: string
  sendBlocked?: boolean
  /** Hot-window text for the next send (for context % estimate). */
  hotText?: string
  /** Same pack.estimatedTokens shown in the Hot window meter — keep displays aligned. */
  hotTokens?: number
}

export function ComposeChat({
  threadId,
  sendBlocked,
  hotText = '',
  hotTokens,
}: ComposeChatProps) {
  const thread = useComposeStore((s) => s.threads[threadId])
  const liveEvents = useComposeStore((s) => s.agentEvents)
  const agentPhase = useComposeStore((s) => s.agentPhase)
  const setDraftDrawerOpen = useComposeStore((s) => s.setDraftDrawerOpen)
  const model = useComposeStore((s) => s.model)
  const draftModel = useComposeStore((s) => s.draftModel)
  const xSearch = useComposeStore((s) => s.xSearch)
  const webSearch = useComposeStore((s) => s.webSearch)
  const contextLimit = useComposeStore((s) => s.contextLimit)
  const { data: models } = useModels('text')
  const toolModels = useMemo(() => filterComposeToolModels(models ?? []), [models])
  const { send, stop, isStreaming } = useCompose()
  const [input, setInput] = useState('')
  const [usageOpen, setUsageOpen] = useState(false)
  const ringRef = useRef<HTMLButtonElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const scrollRafRef = useRef<number | null>(null)
  /** Skip onScroll while we programmatically pin to bottom. */
  const ignoreScrollRef = useRef(false)
  /** Follow new content until the user scrolls away. */
  const stickToBottomRef = useRef(true)
  const touchYRef = useRef<number | null>(null)

  const messages = useMemo(
    () => (thread?.messages ?? []) as ComposeMessage[],
    [thread?.messages],
  )

  const contextBreakdown = useMemo(() => {
    const handoff = isDraftHandoffEnabled(draftModel)
    const system = buildComposeSystem({
      modelId: model,
      xSearchOn: xSearch !== 'off' && modelSupportsXSearch(toolModels, model),
      webSearchOn: webSearch !== 'off',
      toolsEnabled: true,
      draftHandoff: handoff,
    })
    const tools = [
      ...COMPOSE_INTEL_TOOLS,
      ...COMPOSE_HISTORY_TOOLS,
      ...COMPOSE_STATS_TOOLS,
      ...(handoff ? [COMPOSE_WRITE_DRAFT_TOOL] : []),
    ]
    return estimateComposeContextBreakdown({
      system,
      messages,
      pendingUserText: input,
      hotText,
      hotTokens,
      toolsJson: JSON.stringify(tools),
      contextLimit,
      coldArchiveCount: thread?.compressArchives?.length ?? 0,
      contentOf: messageContentString,
    })
  }, [
    model,
    draftModel,
    xSearch,
    webSearch,
    toolModels,
    messages,
    input,
    hotText,
    hotTokens,
    contextLimit,
    thread?.compressArchives,
  ])

  const lastContent =
    typeof messages[messages.length - 1]?.content === 'string'
      ? (messages[messages.length - 1]!.content as string)
      : ''
  const scrollBucket = Math.floor(lastContent.length / SCROLL_CHARS_BUCKET)

  // New thread → re-attach follow (and jump to bottom once messages load).
  useEffect(() => {
    stickToBottomRef.current = true
    setUsageOpen(false)
  }, [threadId])

  const onScroll = useCallback(() => {
    if (ignoreScrollRef.current) return
    const el = scrollRef.current
    if (!el) return
    stickToBottomRef.current = distanceFromBottom(el) <= STICK_BOTTOM_PX
  }, [])

  // Wheel / touch up unpins immediately so the user isn't fighting the stream.
  useEffect(() => {
    const el = scrollRef.current
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

  // Auto-scroll only while stick-to-bottom; throttled by char bucket while typing.
  useEffect(() => {
    if (!stickToBottomRef.current) return
    if (scrollRafRef.current != null) return
    scrollRafRef.current = requestAnimationFrame(() => {
      scrollRafRef.current = null
      const el = scrollRef.current
      if (!el || !stickToBottomRef.current) return
      ignoreScrollRef.current = true
      el.scrollTop = el.scrollHeight
      requestAnimationFrame(() => {
        ignoreScrollRef.current = false
      })
    })
    return () => {
      if (scrollRafRef.current != null) {
        cancelAnimationFrame(scrollRafRef.current)
        scrollRafRef.current = null
      }
    }
  }, [scrollBucket, liveEvents.length, agentPhase, messages.length])

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
              Use the history rail to switch threads or start + New chat. The agent can dig into
              your stored intel and search past Post chats on its own — you&apos;ll see each step
              as it works. Live X search is available when enabled — drafts open in the Draft
              panel.
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
              const active = isStreaming && isLast
              // Live strip while streaming; persisted steps on the message after.
              const events = active ? liveEvents : (m.agentEvents ?? [])
              const showActivity = active || events.length > 0

              const activity = showActivity ? (
                <AgentActivity
                  events={events}
                  active={active}
                  phase={active ? agentPhase : null}
                />
              ) : null

              // Stick live activity to the top of the scrollport so Writing
              // auto-scroll doesn't push steps off-screen.
              const activityNode =
                active && activity ? (
                  <div className="sticky top-0 z-10 -mx-4 px-4 py-1.5 mb-1 bg-[var(--color-bg-base)]/95 backdrop-blur-sm">
                    {activity}
                  </div>
                ) : (
                  activity
                )

              if (!content) {
                if (active) {
                  return (
                    <div key={i} className="relative">
                      {activityNode}
                    </div>
                  )
                }
                return null
              }

              return (
                <div key={i} className="relative space-y-2">
                  {activityNode}
                  <div className="max-w-[92%]">
                    <MarkdownMessage
                      content={content}
                      size="compact"
                      className="text-[12.5px] text-white/70"
                    />
                    {active && (
                      <span
                        className="inline-block w-[1.5px] h-[0.95em] align-[-0.12em] ml-0.5 bg-white/45 animate-pulse"
                        aria-hidden
                      />
                    )}
                  </div>
                </div>
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
          {sendBlocked && (
            <span className="text-[10px] text-amber-400/60 truncate min-w-0">
              Hot window over budget — adjust hot-window settings
            </span>
          )}
          <span className="ml-auto relative">
            <ContextRing
              pct={contextBreakdown.pct}
              onClick={() => setUsageOpen((o) => !o)}
              buttonRef={ringRef}
              expanded={usageOpen}
            />
            <ContextUsagePopup
              open={usageOpen}
              onClose={() => setUsageOpen(false)}
              breakdown={contextBreakdown}
              anchorRef={ringRef}
            />
          </span>
        </div>
      </div>
    </div>
  )
}
