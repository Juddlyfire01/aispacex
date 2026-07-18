import { useState, useRef, useEffect, useMemo, useCallback, useDeferredValue, memo } from 'react'
import { useComposeStore } from '../../stores/compose-store'
import { useCompose } from '../../hooks/use-compose'
import { useModels } from '../../hooks/use-models'
import { MarkdownMessage } from '../chat/markdown-message'
import { AgentActivity } from './agent-activity'
import { ContextRing } from './context-ring'
import { ContextUsagePopup } from './context-usage-popup'
import { buildComposeSystem } from '../../lib/compose/compose-prompt'
import { COMPOSE_WRITE_DRAFT_TOOL } from '../../lib/compose/draft-writer-tool'
import { COMPOSE_INTEL_TOOLS } from '../../lib/compose/intel-tools'
import { COMPOSE_HISTORY_TOOLS } from '../../lib/compose/history-tools'
import { COMPOSE_STATS_TOOLS } from '../../lib/compose/stats-tools'
import { getComposeNewsTools } from '../../lib/compose/news-tools'
import { filterComposeToolModels, modelSupportsXSearch } from '../../lib/compose/model'
import {
  estimateComposeContextBreakdown,
  type ContextUsageBreakdown,
} from '../../lib/compose/token-estimate'
import {
  COMPOSE_TEMPLATES,
  PRIMARY_TEMPLATE,
  type ComposeTemplateStarter,
} from '../../lib/compose/compose-templates'
import { messageContentString } from '../../lib/compose/thread-meta'
import type { ComposeMessage } from '../../lib/compose/thread-types'
import { ThreadExportButton } from './thread-export-button'

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
  // Defer the thread used for RENDERING the message list. On switch, React keeps
  // the current (already-formatted) chat committed while it parses the new
  // thread's markdown off the main path, then swaps it in fully formatted — no
  // raw-markdown flash, no spinner, and typing/streaming stay responsive because
  // the input + store writes run on the real threadId. During streaming threadId
  // never changes, so this is a no-op on the hot token path.
  const renderThreadId = useDeferredValue(threadId)
  const thread = useComposeStore((s) => s.threads[renderThreadId])
  const isThreadPending = renderThreadId !== threadId
  const liveEvents = useComposeStore((s) => s.agentEvents)
  const agentPhase = useComposeStore((s) => s.agentPhase)
  const setDraftDrawerOpen = useComposeStore((s) => s.setDraftDrawerOpen)
  const setPreferredFormat = useComposeStore((s) => s.setPreferredFormat)
  const model = useComposeStore((s) => s.model)
  const xSearch = useComposeStore((s) => s.xSearch)
  const webSearch = useComposeStore((s) => s.webSearch)
  const xNewsOn = useComposeStore((s) => s.xNewsOn)
  const contextLimit = useComposeStore((s) => s.contextLimit)
  const { data: models } = useModels('text')
  const toolModels = useMemo(() => filterComposeToolModels(models ?? []), [models])
  const { send, stop, isStreaming } = useCompose()
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

  // Base context (no pending input) — stable while typing so the message list
  // does not re-render on every keystroke. ComposeChatInput owns pending text.
  const frozenMessagesRef = useRef(messages)
  if (!isStreaming) frozenMessagesRef.current = messages
  const meterMessages = isStreaming ? frozenMessagesRef.current : messages

  const toolsJson = useMemo(() => {
    // Drafting always goes through the write-draft tool (both Same-as-main and a
    // distinct Draft model), so it is always part of the tool payload.
    const tools = [
      ...COMPOSE_INTEL_TOOLS,
      ...COMPOSE_HISTORY_TOOLS,
      ...COMPOSE_STATS_TOOLS,
      ...getComposeNewsTools({ xNewsOn }),
      COMPOSE_WRITE_DRAFT_TOOL,
    ]
    return JSON.stringify(tools)
  }, [xNewsOn])

  const systemPromptForMeter = useMemo(
    () =>
      buildComposeSystem({
        modelId: model,
        xSearchOn: xSearch !== 'off' && modelSupportsXSearch(toolModels, model),
        webSearchOn: webSearch !== 'off',
        xNewsOn,
        toolsEnabled: true,
      }),
    [model, xSearch, webSearch, xNewsOn, toolModels],
  )

  const baseContextBreakdown = useMemo(() => {
    return estimateComposeContextBreakdown({
      system: systemPromptForMeter,
      messages: meterMessages,
      pendingUserText: '',
      hotText,
      hotTokens,
      toolsJson,
      contextLimit,
      coldArchiveCount: thread?.compressArchives?.length ?? 0,
      contentOf: messageContentString,
    })
  }, [
    systemPromptForMeter,
    meterMessages,
    hotText,
    hotTokens,
    toolsJson,
    contextLimit,
    thread?.compressArchives,
  ])

  const lastContent =
    typeof messages[messages.length - 1]?.content === 'string'
      ? (messages[messages.length - 1]!.content as string)
      : ''
  const scrollBucket = Math.floor(lastContent.length / SCROLL_CHARS_BUCKET)

  // New thread → re-attach follow (and jump to bottom once messages load).
  // Usage popup state lives in ComposeChatInput; it resets itself on threadId.
  useEffect(() => {
    stickToBottomRef.current = true
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

  const handleSend = useCallback(
    (text: string) => {
      // Sending re-pins the viewport so the new reply is followed.
      stickToBottomRef.current = true
      void send(text)
    },
    [send],
  )

  const launchTemplate = useCallback(
    (starter: ComposeTemplateStarter) => {
      if (isStreaming || sendBlocked) return
      // `auto` means leave the thread format alone — do not force a preference.
      if (starter.preferredFormat !== 'auto') {
        setPreferredFormat(threadId, starter.preferredFormat)
      }
      stickToBottomRef.current = true
      // Full stage brief goes to the model; chat shows the launch line only.
      void send(starter.buildPrompt(), {
        displayContent: starter.buildDisplayMessage(),
      })
    },
    [isStreaming, sendBlocked, setPreferredFormat, send, threadId],
  )

  return (
    <div className="flex flex-col h-full min-h-0">
      <div
        ref={scrollRef}
        onScroll={onScroll}
        aria-busy={isThreadPending}
        className={`flex-1 min-h-0 overflow-y-auto px-4 py-4 space-y-3 transition-opacity duration-150 ${
          isThreadPending ? 'opacity-60' : 'opacity-100'
        }`}
      >
        {messages.length === 0 ? (
          <div className="text-[12px] text-[var(--color-text-quaternary)] leading-relaxed space-y-3">
            <div className="space-y-2">
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
            <p className="text-[11px] text-[var(--color-text-quaternary)]">
              Or try{' '}
              <button
                type="button"
                onClick={() => launchTemplate(PRIMARY_TEMPLATE)}
                disabled={Boolean(sendBlocked) || isStreaming}
                title={PRIMARY_TEMPLATE.hint}
                className="text-[var(--color-text-tertiary)] underline decoration-[var(--color-border-soft)] underline-offset-2 hover:text-[var(--color-text-secondary)] hover:decoration-[var(--color-border-strong)] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                {PRIMARY_TEMPLATE.label}
              </button>
              <span className="text-[var(--color-text-quaternary)]">
                {' '}
                — {PRIMARY_TEMPLATE.blurb} Or open Templates for more.
              </span>
            </p>
          </div>
        ) : (
          messages.map((m, i) => {
            const isLast = i === messages.length - 1
            const content = typeof m.content === 'string' ? m.content : ''

            if (m.role === 'user' && content) {
              const shown =
                typeof m.displayContent === 'string' && m.displayContent.trim()
                  ? m.displayContent
                  : content
              return (
                <div
                  key={i}
                  className="ml-auto max-w-[85%] bg-[var(--color-bubble-user)] border border-[var(--color-border-soft)] rounded-lg px-3 py-2 text-[12.5px] text-[var(--color-text-primary)] whitespace-pre-wrap break-words"
                >
                  {shown}
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

              if (!content) {
                if (active) {
                  return (
                    <div key={i} className="relative">
                      {activity}
                    </div>
                  )
                }
                return null
              }

              return (
                <div key={i} className="relative space-y-2">
                  {activity}
                  <div className="max-w-[92%]">
                    <MarkdownMessage
                      content={content}
                      size="compact"
                      className="text-[12.5px] text-[var(--color-text-secondary)]"
                      streaming={active}
                    />
                    {active && (
                      <span
                        className="inline-block w-[1.5px] h-[0.95em] align-[-0.12em] ml-0.5 bg-[var(--color-border-soft)] animate-pulse"
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

      <ComposeChatInput
        threadId={threadId}
        baseBreakdown={baseContextBreakdown}
        isStreaming={isStreaming}
        sendBlocked={Boolean(sendBlocked)}
        agentPhase={agentPhase}
        liveEventCount={liveEvents.length}
        onSend={handleSend}
        onStop={stop}
        onOpenDraft={() => setDraftDrawerOpen(true)}
        onLaunchTemplate={launchTemplate}
      />
    </div>
  )
}

/**
 * Isolated composer footer: typing only re-renders this subtree (not the
 * message list / markdown). Context ring pending-user tokens update here.
 */
const ComposeChatInput = memo(function ComposeChatInput({
  threadId,
  baseBreakdown,
  isStreaming,
  sendBlocked,
  agentPhase,
  liveEventCount,
  onSend,
  onStop,
  onOpenDraft,
  onLaunchTemplate,
}: {
  threadId: string
  baseBreakdown: ContextUsageBreakdown
  isStreaming: boolean
  sendBlocked: boolean
  agentPhase: string | null
  liveEventCount: number
  onSend: (text: string) => void
  onStop: () => void
  onOpenDraft: () => void
  onLaunchTemplate: (starter: ComposeTemplateStarter) => void
}) {
  const [input, setInput] = useState('')
  const [usageOpen, setUsageOpen] = useState(false)
  const [templatesOpen, setTemplatesOpen] = useState(false)
  const ringRef = useRef<HTMLButtonElement>(null)
  const templatesRef = useRef<HTMLDivElement>(null)
  // Switching threads closes popovers (state lives here now).
  useEffect(() => {
    setUsageOpen(false)
    setTemplatesOpen(false)
  }, [threadId])

  useEffect(() => {
    if (!templatesOpen) return
    const close = (e: MouseEvent) => {
      if (templatesRef.current && !templatesRef.current.contains(e.target as Node)) {
        setTemplatesOpen(false)
      }
    }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [templatesOpen])
  // Debounce pending-user contribution so every key doesn't re-walk the meter.
  const [pendingForMeter, setPendingForMeter] = useState('')
  useEffect(() => {
    if (isStreaming) {
      setPendingForMeter('')
      return
    }
    const t = window.setTimeout(() => setPendingForMeter(input), 150)
    return () => window.clearTimeout(t)
  }, [input, isStreaming])

  // Cheap delta on base breakdown — avoid re-walking system/tools/hot on every key.
  const displayBreakdown = useMemo((): ContextUsageBreakdown => {
    if (!pendingForMeter.trim()) return baseBreakdown
    const pendingTokens = Math.ceil(pendingForMeter.length / 4) + 4
    const segments = baseBreakdown.segments.map((seg) =>
      seg.id === 'conversation' ? { ...seg, tokens: seg.tokens + pendingTokens } : seg,
    )
    const usedTokens = baseBreakdown.usedTokens + pendingTokens
    return {
      ...baseBreakdown,
      segments,
      usedTokens,
      pct: baseBreakdown.contextLimit > 0 ? usedTokens / baseBreakdown.contextLimit : 0,
    }
  }, [baseBreakdown, pendingForMeter])

  const canSend = Boolean(input.trim()) && !isStreaming && !sendBlocked

  const submit = () => {
    const text = input.trim()
    if (!text || isStreaming || sendBlocked) return
    setInput('')
    onSend(text)
  }

  return (
    <div className="px-4 py-3 border-t border-[var(--color-border-faint)] shrink-0">
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
        className="w-full bg-[var(--color-bg-input)] border border-[var(--color-border-faint)] rounded-md px-3 py-2 text-[12.5px] text-[var(--color-text-primary)] outline-none focus:border-[var(--color-border-strong)] resize-none placeholder:text-[var(--color-text-placeholder)]"
      />
      <div className="flex items-center gap-2 mt-2">
        {isStreaming ? (
          <button
            type="button"
            onClick={onStop}
            aria-busy="true"
            className="px-3 py-1.5 text-[11px] font-medium bg-[var(--color-border-faint)] text-[var(--color-text-primary)] rounded-md hover:bg-[var(--color-border-faint)] transition-colors"
          >
            {agentPhase === 'Thinking' && liveEventCount === 0 ? 'Sending…' : 'Stop'}
          </button>
        ) : (
          <button
            type="button"
            onClick={submit}
            disabled={!canSend}
            className="px-3 py-1.5 text-[11px] font-medium rounded-md bg-[var(--color-btn-primary-bg)] text-[var(--color-btn-primary-fg)] hover:opacity-90 transition-opacity disabled:opacity-30"
          >
            Send
          </button>
        )}
        <button
          type="button"
          onClick={onOpenDraft}
          className="px-3 py-1.5 text-[11px] font-medium border border-[var(--color-border-faint)] text-[var(--color-text-secondary)] rounded-md hover:text-[var(--color-text-primary)] hover:border-[var(--color-border-strong)] transition-colors"
        >
          Draft
        </button>
        <div className="relative" ref={templatesRef}>
          <button
            type="button"
            onClick={() => setTemplatesOpen((o) => !o)}
            disabled={isStreaming || sendBlocked}
            aria-haspopup="menu"
            aria-expanded={templatesOpen}
            title="Insert a research template"
            className="px-3 py-1.5 text-[11px] font-medium border border-[var(--color-border-faint)] text-[var(--color-text-secondary)] rounded-md hover:text-[var(--color-text-primary)] hover:border-[var(--color-border-strong)] transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
          >
            Templates
          </button>
          {templatesOpen && (
            <div
              role="menu"
              className="absolute left-0 bottom-full mb-1 z-20 min-w-[13rem] max-w-[18rem] rounded-md border border-[var(--color-border-soft)] bg-[var(--color-bg-overlay)] py-1 shadow-lg"
            >
              {COMPOSE_TEMPLATES.map((tpl) => (
                <button
                  key={tpl.id}
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setTemplatesOpen(false)
                    onLaunchTemplate(tpl)
                  }}
                  className="block w-full px-3 py-2 text-left hover:bg-[var(--color-border-faint)] transition-colors"
                >
                  <div className="text-[11px] font-medium text-[var(--color-text-primary)]">
                    {tpl.label}
                  </div>
                  <div className="text-[10px] text-[var(--color-text-quaternary)] mt-0.5 leading-snug">
                    {tpl.hint}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
        <ThreadExportButton
          threadId={threadId}
          variant="label"
          disabled={isStreaming}
        />
        {sendBlocked && (
          <span className="text-[10px] text-amber-400/60 truncate min-w-0">
            Hot window over budget — adjust hot-window settings
          </span>
        )}
        <span className="ml-auto relative">
          <ContextRing
            pct={displayBreakdown.pct}
            onClick={() => setUsageOpen((o) => !o)}
            buttonRef={ringRef}
            expanded={usageOpen}
          />
          <ContextUsagePopup
            open={usageOpen}
            onClose={() => setUsageOpen(false)}
            breakdown={displayBreakdown}
            anchorRef={ringRef}
          />
        </span>
      </div>
    </div>
  )
})
