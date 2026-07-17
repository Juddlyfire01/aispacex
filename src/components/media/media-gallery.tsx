import { useState, useEffect, useRef, type ReactNode } from 'react'
import { extensionForMime } from '../../lib/media-blob'
import type { MediaKind } from '../../lib/media-gallery'
import type { GalleryItemView } from '../../hooks/use-media-gallery'
import { confirmDialog } from '../../stores/confirm-store'
import { cn } from '../../lib/utils'

export type ImageToolAction = 'edit' | 'upscale' | 'remove-bg'

const TOOL_ACTIONS: { id: ImageToolAction; label: string }[] = [
  { id: 'edit', label: 'Edit' },
  { id: 'upscale', label: 'Upscale' },
  { id: 'remove-bg', label: 'Remove BG' },
]

function formatRelative(ms: number): string {
  const sec = Math.round((Date.now() - ms) / 1000)
  if (sec < 60) return 'just now'
  const min = Math.round(sec / 60)
  if (min < 60) return `${min}m ago`
  const hr = Math.round(min / 60)
  if (hr < 24) return `${hr}h ago`
  const day = Math.round(hr / 24)
  return `${day}d ago`
}

function downloadItem(item: GalleryItemView, index: number) {
  const ext = extensionForMime(item.mimeType)
  const a = document.createElement('a')
  a.href = item.objectUrl
  a.download = `venice-${item.kind}-${index + 1}.${ext}`
  a.click()
}

interface MediaGalleryProps {
  kind: MediaKind
  items: GalleryItemView[]
  pendingCount?: number
  empty: ReactNode
  onUsePrompt?: (prompt: string, negativePrompt?: string) => void
  /** Open Edit / Upscale / Remove BG with this image preloaded (any Image tab). */
  onOpenInTools?: (item: GalleryItemView, tool: ImageToolAction) => void
  onRemove: (id: string) => void
  onClearAll: () => void
}

export function MediaGallery({
  kind,
  items,
  pendingCount = 0,
  empty,
  onUsePrompt,
  onOpenInTools,
  onRemove,
  onClearAll,
}: MediaGalleryProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [toolsMenuId, setToolsMenuId] = useState<string | null>(null)
  const selected = items.find((i) => i.id === selectedId) ?? null

  const handleClearAll = async () => {
    if (items.length === 0) return
    const label = kindLabelSingular(kind)
    const ok = await confirmDialog({
      title: 'Clear gallery',
      description: `Clear all ${items.length} ${label}${items.length === 1 ? '' : 's'} from this gallery?`,
      confirmLabel: 'Clear',
      danger: true,
    })
    if (!ok) return
    setSelectedId(null)
    setToolsMenuId(null)
    onClearAll()
  }

  if (items.length === 0 && pendingCount === 0) {
    return <>{empty}</>
  }

  const label = kindLabelPlural(kind, items.length)
  const isSound = kind === 'music' || kind === 'tts'

  return (
    <>
      {selected && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/95 backdrop-blur-sm animate-fade-in"
          onClick={() => setSelectedId(null)}
        >
          <div className="relative max-w-[90vw] max-h-[90vh] flex flex-col gap-3" onClick={(e) => e.stopPropagation()}>
            {selected.kind === 'image' ? (
              <img src={selected.objectUrl} alt="Generated" className="max-w-[90vw] max-h-[75vh] rounded-xl shadow-2xl object-contain" />
            ) : selected.kind === 'video' ? (
              <video
                controls
                autoPlay
                src={selected.objectUrl}
                className="max-w-[90vw] max-h-[75vh] rounded-xl shadow-2xl bg-black"
              />
            ) : (
              <div className="w-[min(90vw,420px)] rounded-xl border border-white/[0.08] bg-white/[0.03] p-6">
                <audio controls autoPlay src={selected.objectUrl} className="w-full" />
              </div>
            )}
            <div className="rounded-xl border border-white/[0.08] bg-white/[0.03] px-4 py-3 max-w-[90vw]">
              <p className="text-[12px] text-white/40 mb-1">
                {selected.model} · {formatRelative(selected.createdAt)}
              </p>
              <p className="text-[13.5px] text-white/70 leading-relaxed whitespace-pre-wrap break-words max-h-28 overflow-y-auto">
                {selected.prompt}
              </p>
              <div className="mt-2 flex flex-wrap gap-3">
                {onOpenInTools && selected.kind === 'image' && TOOL_ACTIONS.map(({ id, label: toolLabel }) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => { onOpenInTools(selected, id); setSelectedId(null) }}
                    className="text-[12.5px] font-medium text-[var(--color-accent)] hover:underline underline-offset-2"
                  >
                    {toolLabel}
                  </button>
                ))}
                {onUsePrompt && (
                  <button
                    type="button"
                    onClick={() => onUsePrompt(selected.prompt, selected.negativePrompt)}
                    className="text-[12.5px] font-medium text-[var(--color-accent)] hover:underline underline-offset-2"
                  >
                    Use prompt
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => downloadItem(selected, items.indexOf(selected))}
                  className="text-[12.5px] text-white/45 hover:text-white/70 transition-colors"
                >
                  Download
                </button>
              </div>
            </div>
            <div className="absolute top-3 right-3 flex gap-1.5">
              <button
                type="button"
                onClick={() => downloadItem(selected, items.indexOf(selected))}
                aria-label="Download"
                className="p-2 bg-black/60 hover:bg-black/80 rounded-lg text-white/70 hover:text-white transition-colors backdrop-blur-sm"
              >
                <DownloadIcon />
              </button>
              <button
                type="button"
                onClick={() => setSelectedId(null)}
                aria-label="Close"
                className="p-2 bg-black/60 hover:bg-black/80 rounded-lg text-white/70 hover:text-white transition-colors backdrop-blur-sm"
              >
                <CloseIcon />
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="flex flex-col gap-4 h-full">
        <div className="flex items-center justify-between shrink-0">
          <p className="text-[13px] text-white/35">
            {items.length} {label}
            {pendingCount > 0 ? ` · ${pendingCount} generating…` : ''}
          </p>
          {items.length > 0 && (
            <button
              type="button"
              onClick={handleClearAll}
              className="text-[12.5px] text-white/30 hover:text-white/55 transition-colors"
            >
              Clear all
            </button>
          )}
        </div>

        <div className="grid grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-4">
          {pendingCount > 0 && Array.from({ length: pendingCount }).map((_, i) => (
            <div
              key={`skel-${i}`}
              className={
                kind === 'video' ? 'aspect-video rounded-xl skeleton'
                  : isSound ? 'aspect-[4/3] rounded-xl skeleton'
                    : 'aspect-square rounded-xl skeleton'
              }
            />
          ))}
          {items.map((item, i) => (
            <div key={item.id} className="relative group">
              {item.kind === 'image' ? (
                <img
                  src={item.objectUrl}
                  alt={`Generated ${i + 1}`}
                  className="w-full rounded-xl cursor-pointer border border-white/[0.05] hover:border-white/[0.18] transition-all duration-200"
                  onClick={() => setSelectedId(item.id)}
                />
              ) : item.kind === 'video' ? (
                <video
                  muted
                  preload="metadata"
                  src={item.objectUrl}
                  className="w-full aspect-video rounded-xl cursor-pointer border border-white/[0.05] hover:border-white/[0.18] transition-all duration-200 bg-black object-cover"
                  onClick={() => setSelectedId(item.id)}
                />
              ) : (
                <button
                  type="button"
                  onClick={() => setSelectedId(item.id)}
                  className="w-full aspect-[4/3] rounded-xl border border-white/[0.05] hover:border-white/[0.18] bg-white/[0.03] transition-all duration-200 flex flex-col items-center justify-center gap-2 px-3 text-left"
                >
                  <AudioIcon />
                  <span className="text-[12px] text-white/45 line-clamp-3 w-full text-center">{item.prompt}</span>
                </button>
              )}
              <div
                className={cn(
                  'absolute top-2 right-2 flex gap-1 transition-all',
                  toolsMenuId === item.id ? 'opacity-100' : 'opacity-0 group-hover:opacity-100',
                )}
              >
                {onOpenInTools && item.kind === 'image' && (
                  <ToolsActionMenu
                    open={toolsMenuId === item.id}
                    onOpenChange={(open) => setToolsMenuId(open ? item.id : null)}
                    onSelect={(tool) => {
                      onOpenInTools(item, tool)
                      setToolsMenuId(null)
                    }}
                  />
                )}
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); downloadItem(item, i) }}
                  aria-label="Download"
                  className="p-1.5 bg-black/60 hover:bg-black/85 rounded-lg text-white/70 hover:text-white backdrop-blur-sm"
                  title="Download"
                >
                  <DownloadIcon size={14} />
                </button>
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); if (selectedId === item.id) setSelectedId(null); onRemove(item.id) }}
                  aria-label="Delete"
                  className="p-1.5 bg-black/60 hover:bg-black/85 rounded-lg text-white/70 hover:text-white backdrop-blur-sm"
                  title="Delete"
                >
                  <TrashIcon size={14} />
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </>
  )
}

function ToolsActionMenu({
  open,
  onOpenChange,
  onSelect,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSelect: (tool: ImageToolAction) => void
}) {
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onPointer = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) onOpenChange(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onOpenChange(false)
    }
    document.addEventListener('mousedown', onPointer)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onPointer)
      document.removeEventListener('keydown', onKey)
    }
  }, [open, onOpenChange])

  return (
    <div ref={rootRef} className="relative" onClick={(e) => e.stopPropagation()}>
      <button
        type="button"
        onClick={() => onOpenChange(!open)}
        aria-label="Open in tools"
        aria-expanded={open}
        className="p-1.5 bg-black/60 hover:bg-black/85 rounded-lg text-white/70 hover:text-white backdrop-blur-sm"
        title="Edit / Upscale / Remove BG"
      >
        <PencilIcon size={14} />
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 z-20 min-w-[8.5rem] rounded-md border border-[var(--color-border-faint)] bg-[var(--color-bg-raised)] py-1 shadow-lg">
          {TOOL_ACTIONS.map(({ id, label }) => (
            <button
              key={id}
              type="button"
              onClick={() => onSelect(id)}
              className="w-full px-3 py-1.5 text-left text-[12.5px] text-white/70 hover:bg-white/[0.06] hover:text-white transition-colors"
            >
              {label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function PencilIcon({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.12 2.12 0 013 3L7 19l-4 1 1-4L16.5 3.5z" />
    </svg>
  )
}

function DownloadIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3" />
    </svg>
  )
}

function CloseIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 6L6 18M6 6l12 12" />
    </svg>
  )
}

function TrashIcon({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2m3 0v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6h14" />
      <line x1="10" y1="11" x2="10" y2="17" /><line x1="14" y1="11" x2="14" y2="17" />
    </svg>
  )
}

function AudioIcon() {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-white/35">
      <path d="M9 18V5l12-2v13" />
      <circle cx="6" cy="18" r="3" /><circle cx="18" cy="16" r="3" />
    </svg>
  )
}

function kindLabelSingular(kind: MediaKind): string {
  if (kind === 'music') return 'track'
  if (kind === 'tts') return 'clip'
  return kind
}

function kindLabelPlural(kind: MediaKind, count: number): string {
  if (kind === 'music') return count === 1 ? 'track' : 'tracks'
  if (kind === 'tts') return count === 1 ? 'clip' : 'clips'
  return `${kind}${count === 1 ? '' : 's'}`
}
