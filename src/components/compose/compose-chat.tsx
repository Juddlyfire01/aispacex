import { useState, useRef, useEffect, useMemo } from 'react'
import { useComposeStore } from '../../stores/compose-store'
import { useCompose } from '../../hooks/use-compose'
import type { TargetContext } from '../../lib/compose/compose-prompt'
import { MarkdownMessage } from '../chat/markdown-message'

interface ComposeChatProps {
  context: string
  targetContext?: TargetContext
  corpus?: string
}

export function ComposeChat({ context, targetContext, corpus }: ComposeChatProps) {
  const session = useComposeStore((s) => s.sessions[context])
  const { send, stop, isStreaming } = useCompose()
  const [input, setInput] = useState('')
  const scrollRef = useRef<HTMLDivElement>(null)

  const messages = useMemo(() => session?.messages ?? [], [session?.messages])

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight })
  }, [messages])

  const submit = () => {
    const text = input.trim()
    if (!text || isStreaming) return
    setInput('')
    void send(text, targetContext, corpus)
  }

  return (
    <div className="flex flex-col h-full min-h-0">
      <div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto px-4 py-4 space-y-3">
        {messages.length === 0 ? (
          <div className="text-[12px] text-white/20 leading-relaxed">
            {corpus
              ? 'Ask anything about your entire gathered data set — compare accounts, surface patterns, or draft from the whole corpus. The draft builds on the right.'
              : "Describe the post you want. I can research live X context and we'll shape it together — the draft builds on the right."}
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
              <div key={i} className="text-[12px] text-white/30">Thinking…</div>
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
          className="w-full bg-[var(--color-bg-input)] border border-[var(--color-border-faint)] rounded-lg px-3 py-2 text-[12.5px] text-white/85 outline-none focus:border-[var(--color-border-strong)] resize-none placeholder:text-[var(--color-text-placeholder)]"
        />
        <div className="flex items-center gap-2 mt-2">
          {isStreaming ? (
            <button onClick={stop} className="px-3 py-1 text-[11px] font-medium bg-white/10 text-white/80 rounded-md hover:bg-white/15 transition-colors">
              Stop
            </button>
          ) : (
            <button
              onClick={submit}
              disabled={!input.trim()}
              className="px-3 py-1 text-[11px] font-medium bg-white text-black rounded-md hover:bg-white/90 transition-colors disabled:opacity-30"
            >
              Send
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
