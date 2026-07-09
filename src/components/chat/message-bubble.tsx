import { useState } from 'react'
import type { ChatMessage, ContentPart } from '../../types/venice'
import { MarkdownMessage } from './markdown-message'
import { cn } from '../../lib/utils'

// Extract text and images from multimodal content
function extractContent(content: string | ContentPart[] | null): { text: string; images: string[] } {
  if (content == null) return { text: '', images: [] }
  if (typeof content === 'string') return { text: content, images: [] }
  let text = ''
  const images: string[] = []
  for (const part of content) {
    if (part.type === 'text' && part.text) text += part.text
    if (part.type === 'image_url' && part.image_url?.url) images.push(part.image_url.url)
  }
  return { text, images }
}

interface MessageBubbleProps {
  message: ChatMessage
  index: number
  onCopy: () => void
  onDelete: () => void
  onRegenerate?: () => void
}

export function MessageBubble({ message, onCopy, onDelete, onRegenerate }: MessageBubbleProps) {
  const [hovering, setHovering] = useState(false)
  const [copied, setCopied] = useState(false)
  const [reasoningOpen, setReasoningOpen] = useState(false)
  const isUser = message.role === 'user'
  const { text: content, images } = extractContent(message.content)

  const handleCopy = () => {
    navigator.clipboard.writeText(content)
    setCopied(true)
    onCopy()
    setTimeout(() => setCopied(false), 1500)
  }

  const actions = (
    <div className={`flex items-center gap-0.5 h-6 transition-opacity duration-150 ${hovering ? 'opacity-100' : 'opacity-0'}`}>
      <ActionBtn label={copied ? 'Copied' : 'Copy'} onClick={handleCopy}>
        {copied ? (
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5" /></svg>
        ) : (
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" /></svg>
        )}
      </ActionBtn>
      {!isUser && onRegenerate && (
        <ActionBtn label="Regenerate" onClick={onRegenerate}>
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 4v6h6" /><path d="M3.51 15a9 9 0 102.13-9.36L1 10" /></svg>
        </ActionBtn>
      )}
      <ActionBtn label="Delete" onClick={onDelete}>
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" /></svg>
      </ActionBtn>
    </div>
  )

  if (isUser) {
    return (
      <div className="flex justify-end" onMouseEnter={() => setHovering(true)} onMouseLeave={() => setHovering(false)}>
        <div className="flex items-end gap-1.5 max-w-[78%]">
          {actions}
          <div className="bg-white/[0.07] border border-white/[0.05] rounded-2xl rounded-br-md px-4 py-2.5 shadow-sm">
            {images.length > 0 && (
              <div className="flex gap-1.5 mb-2">
                {images.map((img, i) => (
                  <img key={i} src={img} alt={`Attachment ${i + 1}`} className="h-24 rounded-lg border border-white/[0.06]" />
                ))}
              </div>
            )}
            <div className="text-white/95 text-[15.5px] leading-relaxed whitespace-pre-wrap break-words">
              {content}
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex gap-3" onMouseEnter={() => setHovering(true)} onMouseLeave={() => setHovering(false)}>
      <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-white/95 to-white/75 flex items-center justify-center shrink-0 mt-0.5 shadow-sm">
        <img src="/aispace-logo-light.svg" alt="" width="16" height="16" className="opacity-90" aria-hidden />
      </div>
      <div className="min-w-0 flex-1">
        {/* Reasoning content (thinking) */}
        {message.reasoning_content && (
          <div className="mb-2">
            <button
              onClick={() => setReasoningOpen(!reasoningOpen)}
              className="flex items-center gap-1.5 text-[14px] text-white/20 hover:text-white/35 transition-colors mb-1"
            >
              <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"
                className={cn('transition-transform duration-150', reasoningOpen && 'rotate-90')}>
                <path d="M3.5 2L6.5 5L3.5 8" />
              </svg>
              Thinking
            </button>
            {reasoningOpen && (
              <div className="bg-white/[0.02] border border-white/[0.04] rounded-lg px-3 py-2 text-[15px] text-white/30 leading-relaxed whitespace-pre-wrap animate-fade-in max-h-60 overflow-y-auto">
                {message.reasoning_content}
              </div>
            )}
          </div>
        )}

        {content ? (
          <MarkdownMessage content={content} className="text-[15.5px] leading-relaxed text-white/85" />
        ) : (
          <span className="inline-flex gap-1.5 py-1.5">
            <span className="w-1 h-1 rounded-full bg-white/25 animate-pulse-dot" />
            <span className="w-1 h-1 rounded-full bg-white/25 animate-pulse-dot" style={{ animationDelay: '0.2s' }} />
            <span className="w-1 h-1 rounded-full bg-white/25 animate-pulse-dot" style={{ animationDelay: '0.4s' }} />
          </span>
        )}
        <div className="mt-0.5">{actions}</div>
      </div>
    </div>
  )
}

function ActionBtn({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      title={label}
      className="p-1 text-white/15 hover:text-white/40 transition-colors rounded-md hover:bg-white/[0.04]"
    >
      {children}
    </button>
  )
}
