import { useState, useRef, useEffect, useMemo } from 'react'
import { useComposeStore } from '../../stores/compose-store'
import { useCompose } from '../../hooks/use-compose'
import { MarkdownMessage } from '../chat/markdown-message'

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

  const messages = useMemo(() => thread?.messages ?? [], [thread?.messages])

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight })
  }, [messages, toolActivity])

  const canSend = Boolean(input.trim()) && !isStreaming && !sendBlocked

  const submit = () => {
    const text = input.trim()
    if (!text || isStreaming || sendBlocked) return
    setInput('')
    void send(text)
  }

  return (
    <div className="flex flex-col h-full min-h-0">
      <div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto px-4 py-4 space-y-3">
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
          messages.map((m, i) =>
            typeof m.content === 'string' && m.content !== '' ? (
              m.role === 'user' ? (
                <div
                  key={i}
                  className="ml-auto max-w-[85%] bg-white/[0.06] rounded-lg px-3 py-2 text-[12.5px] text-white/85 whitespace-pre-wrap break-words"
                >
                  {m.content}
                </div>
              ) : (
                <MarkdownMessage
                  key={i}
                  content={m.content}
                  size="compact"
                  className="max-w-[92%] text-[12.5px] text-white/70"
                />
              )
            ) : m.role === 'assistant' && isStreaming && i === messages.length - 1 ? (
              <div key={i} className="text-[12px] text-white/30">
                {toolActivity ? `${toolActivity}…` : 'Thinking…'}
              </div>
            ) : null,
          )
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
              className="px-3 py-1 text-[11px] font-medium bg-white text-black rounded-md hover:bg-white/90 transition-colors disabled:opacity-30"
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
