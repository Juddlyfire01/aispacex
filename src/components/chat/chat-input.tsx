import { useState, useRef, useEffect } from 'react'
import { cn } from '../../lib/utils'

interface ChatInputProps {
  onSend: (message: string, images?: string[]) => void
  onStop: () => void
  isStreaming: boolean
  disabled?: boolean
}

export function ChatInput({ onSend, onStop, isStreaming, disabled }: ChatInputProps) {
  const [value, setValue] = useState('')
  const [images, setImages] = useState<string[]>([])
  const [dragOver, setDragOver] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => { textareaRef.current?.focus() }, [])

  const handleSubmit = () => {
    const trimmed = value.trim()
    if (!trimmed || disabled) return
    onSend(trimmed, images.length > 0 ? images : undefined)
    setValue('')
    setImages([])
    if (textareaRef.current) textareaRef.current.style.height = 'auto'
  }

  const handleImageUpload = (files: FileList | null) => {
    if (!files) return
    Array.from(files).forEach((file) => {
      const reader = new FileReader()
      reader.onload = () => setImages((prev) => [...prev, reader.result as string])
      reader.readAsDataURL(file)
    })
  }

  return (
    <div className="px-4 sm:px-6 pb-5 pt-2">
      <div className="w-full max-w-[860px] mx-auto">
        {images.length > 0 && (
          <div className="flex gap-2 mb-2 overflow-x-auto pb-1">
            {images.map((img, i) => (
              <div key={i} className="relative group shrink-0">
                <img src={img} alt={`Attachment ${i + 1}`} className="h-16 w-16 object-cover rounded-lg border border-[var(--color-border-soft)]" />
                <button
                  onClick={() => setImages((prev) => prev.filter((_, j) => j !== i))}
                  aria-label={`Remove attachment ${i + 1}`}
                  className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-[var(--color-bg-overlay)] hover:bg-[var(--color-bg-raised)] border border-[var(--color-border-strong)] rounded-full flex items-center justify-center text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] transition-colors focus-visible:outline focus-visible:outline-1 focus-visible:outline-[var(--color-accent)]"
                >
                  <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                </button>
              </div>
            ))}
          </div>
        )}

        <div
          className={cn(
            'relative bg-[var(--color-bg-base)] border rounded-2xl overflow-hidden transition-all shadow-[var(--color-surface-shadow)]',
            'focus-within:border-[var(--color-border-strong)]',
            dragOver ? 'border-[var(--color-accent)] bg-[var(--color-accent-soft)]' : 'border-[var(--color-border-input)]',
          )}
          onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); setDragOver(true) }}
          onDragLeave={(e) => { e.preventDefault(); e.stopPropagation(); setDragOver(false) }}
          onDrop={(e) => { e.preventDefault(); e.stopPropagation(); setDragOver(false); handleImageUpload(e.dataTransfer.files) }}
        >
          <textarea
            ref={textareaRef}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSubmit() }
            }}
            onPaste={(e) => {
              const items = e.clipboardData?.items
              if (!items) return
              for (const item of items) {
                if (item.type.startsWith('image/')) {
                  const file = item.getAsFile()
                  if (file) {
                    const reader = new FileReader()
                    reader.onload = () => setImages((prev) => [...prev, reader.result as string])
                    reader.readAsDataURL(file)
                  }
                }
              }
            }}
            placeholder={disabled ? 'Connect an API key to start…' : dragOver ? 'Drop image to attach' : 'Ask anything — Enter to send, Shift+Enter for newline'}
            rows={1}
            aria-label="Message input"
            className="w-full bg-transparent px-5 pt-4 pb-1 text-[16px] text-[var(--color-text-primary)] outline-none resize-none max-h-48 placeholder:text-[var(--color-text-placeholder)] leading-relaxed"
            disabled={disabled}
          />
          <div className="flex items-center justify-between px-3 pb-2.5">
            <div className="flex items-center gap-1">
              <input ref={fileRef} type="file" accept="image/*" multiple className="hidden" onChange={(e) => handleImageUpload(e.target.files)} />
              <button
                onClick={() => fileRef.current?.click()}
                disabled={disabled}
                aria-label="Attach image"
                className="flex items-center gap-1.5 px-2 py-1.5 text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] text-[13px] transition-colors rounded-lg hover:bg-[var(--color-border-faint)] disabled:opacity-40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--color-accent)]"
                title="Attach image (or drag/paste)"
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48" />
                </svg>
              </button>
            </div>
            {isStreaming ? (
              <button
                onClick={onStop}
                aria-label="Stop generating"
                className="flex items-center gap-1.5 px-3 py-1.5 text-[13px] font-medium text-[var(--color-text-primary)] bg-[var(--color-border-faint)] hover:bg-[var(--color-border-soft)] border border-[var(--color-border-soft)] rounded-lg transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--color-accent)]"
              >
                <svg width="9" height="9" viewBox="0 0 8 8" fill="currentColor"><rect width="8" height="8" rx="1" /></svg>
                Stop
              </button>
            ) : (
              <button
                onClick={handleSubmit}
                disabled={!value.trim() || disabled}
                aria-label="Send message"
                className={cn(
                  'w-10 h-10 flex items-center justify-center rounded-xl transition-all duration-150 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--color-accent)] focus-visible:outline-offset-2',
                  value.trim() && !disabled
                    ? 'bg-[var(--color-btn-primary-bg)] text-[var(--color-btn-primary-fg)] hover:opacity-90 active:scale-95 shadow-sm'
                    : 'bg-[var(--color-border-soft)] text-[var(--color-text-tertiary)]',
                )}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M5 12h14M12 5l7 7-7 7" />
                </svg>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
