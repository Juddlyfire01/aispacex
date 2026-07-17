import { useEffect, useRef, useState } from 'react'
import { useComposeStore } from '../../stores/compose-store'
import { useSettingsStore } from '../../stores/settings-store'
import { useImageGenerate } from '../../hooks/use-image'
import { mediaGallery } from '../../lib/media-gallery'
import { blobToDataUrl } from '../../lib/media-blob'
import { blobFromBase64, mimeFromBase64 } from '../../lib/media-blob'
import { venice } from '../../lib/venice-client'
import { toast } from '../../stores/toast-store'
import type { MediaItem, PostSegment } from '../../lib/compose/types'
import type { ChatCompletionResponse } from '../../types/venice'
import { cn } from '../../lib/utils'

function kindForFile(type: string): MediaItem['kind'] {
  if (type.startsWith('video/')) return 'video'
  if (type === 'image/gif') return 'gif'
  return 'image'
}

export function appendFilesToSegment(
  threadId: string,
  segment: PostSegment,
  files: FileList | File[],
) {
  const patchSegment = useComposeStore.getState().patchSegment
  const list = Array.from(files).slice(0, 4 - segment.media.length)
  if (list.length === 0) {
    toast.error('Media full', 'Each post can have up to 4 media items.')
    return
  }
  const readers = list.map(
    (file) =>
      new Promise<MediaItem>((resolve) => {
        const reader = new FileReader()
        reader.onload = () =>
          resolve({
            id: crypto.randomUUID(),
            kind: kindForFile(file.type),
            dataUrl: String(reader.result),
            altText: '',
          })
        reader.readAsDataURL(file)
      }),
  )
  void Promise.all(readers).then((items) => {
    const latest = useComposeStore.getState().threads[threadId]?.draft.segments.find((s) => s.id === segment.id)
    if (!latest) return
    patchSegment(threadId, segment.id, {
      media: [...latest.media, ...items].slice(0, 4),
      poll: undefined,
    })
  })
}

export function appendMediaItem(threadId: string, segmentId: string, item: MediaItem) {
  const patchSegment = useComposeStore.getState().patchSegment
  const latest = useComposeStore.getState().threads[threadId]?.draft.segments.find((s) => s.id === segmentId)
  if (!latest) return
  if (latest.media.length >= 4) {
    toast.error('Media full', 'Each post can have up to 4 media items.')
    return
  }
  patchSegment(threadId, segmentId, {
    media: [...latest.media, item],
    poll: undefined,
  })
}

export function enablePoll(threadId: string, segmentId: string) {
  const patchSegment = useComposeStore.getState().patchSegment
  const latest = useComposeStore.getState().threads[threadId]?.draft.segments.find((s) => s.id === segmentId)
  if (!latest) return
  if (latest.media.length > 0) {
    toast.error('Remove media first', 'X does not allow media and a poll on the same post.')
    return
  }
  if (latest.poll) return
  patchSegment(threadId, segmentId, {
    poll: { options: ['', ''], durationMinutes: 1440 },
  })
}

const DRAFT_IMAGE_PROMPT_INSTRUCTION =
  'Write a single concise image-generation prompt that would illustrate the following social media draft. Output ONLY the prompt text — no quotes, labels, or preamble.'

const TOOLBAR_BTN =
  'inline-flex items-center h-5 text-[11px] leading-none text-white/30 hover:text-white/60 transition-colors disabled:opacity-20'

const TOOLBAR_ROW = 'flex items-center gap-3 h-5 px-0.5'

type Panel = 'menu' | 'gallery' | 'generate' | null

interface DraftMediaButtonProps {
  threadId: string
  segment: PostSegment
  className?: string
}

export function DraftMediaButton({ threadId, segment, className }: DraftMediaButtonProps) {
  const [panel, setPanel] = useState<Panel>(null)
  const [genPrompt, setGenPrompt] = useState('')
  const [proposing, setProposing] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const generate = useImageGenerate()
  const imageModel = useSettingsStore((s) => s.selectedModels.image)
  const textModel = useSettingsStore((s) => s.selectedModels.chat || s.selectedModels.text)

  const full = segment.media.length >= 4
  const blockedByPoll = Boolean(segment.poll)

  useEffect(() => {
    if (!panel) return
    const onPointer = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setPanel(null)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setPanel(null)
    }
    document.addEventListener('mousedown', onPointer)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onPointer)
      document.removeEventListener('keydown', onKey)
    }
  }, [panel])

  const openMenu = () => {
    if (blockedByPoll) {
      toast.error('Remove poll first', 'X does not allow media and a poll on the same post.')
      return
    }
    if (full) {
      toast.error('Media full', 'Each post can have up to 4 media items.')
      return
    }
    setPanel((p) => (p ? null : 'menu'))
  }

  const onUpload = (files: FileList | null) => {
    if (!files?.length) return
    appendFilesToSegment(threadId, segment, files)
    setPanel(null)
  }

  const proposeFromDraft = async () => {
    const draftText = segment.text.trim()
    if (!draftText) {
      toast.error('Empty draft', 'Write some text first so a prompt can be proposed.')
      return
    }
    setProposing(true)
    try {
      const model = textModel || 'venice-uncensored'
      const res = await venice<ChatCompletionResponse>('/chat/completions', {
        method: 'POST',
        body: JSON.stringify({
          model,
          messages: [
            { role: 'system', content: DRAFT_IMAGE_PROMPT_INSTRUCTION },
            { role: 'user', content: draftText },
          ],
          temperature: 0.7,
        }),
      })
      const proposed = res.choices?.[0]?.message?.content?.trim() ?? ''
      if (!proposed) throw new Error('No prompt returned')
      setGenPrompt(proposed)
    } catch (err) {
      toast.fromError(err, 'Could not propose image prompt')
    } finally {
      setProposing(false)
    }
  }

  const runGenerate = async () => {
    const prompt = genPrompt.trim()
    if (prompt.length < 10) {
      toast.error('Prompt too short', 'Need at least 10 characters.')
      return
    }
    try {
      const model = imageModel || 'venice-sd35'
      const data = await generate.mutateAsync({
        model,
        prompt,
      })
      const payloads = data.images.map((img) => (typeof img === 'string' ? img : img.b64_json))
      const b64 = payloads[0]
      if (!b64) throw new Error('No image returned')
      const blob = blobFromBase64(b64)
      const dataUrl = await blobToDataUrl(blob)
      appendMediaItem(threadId, segment.id, {
        id: crypto.randomUUID(),
        kind: 'image',
        dataUrl,
        altText: '',
      })
      // Also keep in the image gallery
      void mediaGallery.add({
        kind: 'image',
        blob,
        mimeType: blob.type || mimeFromBase64(b64),
        prompt,
        model,
      })
      setPanel(null)
      setGenPrompt('')
    } catch (err) {
      toast.fromError(err, 'Image generation failed')
    }
  }

  return (
    <div ref={rootRef} className={cn('relative inline-flex items-center', className)}>
      <button
        type="button"
        onClick={openMenu}
        disabled={full && !panel}
        className={TOOLBAR_BTN}
      >
        + Add media
      </button>
      <input
        ref={fileRef}
        type="file"
        accept="image/*,video/*"
        multiple
        className="sr-only"
        tabIndex={-1}
        onChange={(e) => {
          onUpload(e.target.files)
          e.target.value = ''
        }}
      />

      {panel === 'menu' && (
        <div className="absolute left-0 bottom-full mb-1 z-30 min-w-[11rem] rounded-md border border-[var(--color-border-faint)] bg-[var(--color-bg-raised)] py-1 shadow-lg">
          <MenuItem
            label="Upload"
            onClick={() => fileRef.current?.click()}
          />
          <MenuItem label="From gallery" onClick={() => setPanel('gallery')} />
          <MenuItem label="Generate image" onClick={() => { setPanel('generate'); setGenPrompt('') }} />
        </div>
      )}

      {panel === 'gallery' && (
        <GalleryPicker
          onBack={() => setPanel('menu')}
          onPick={async (rec) => {
            try {
              const dataUrl = await blobToDataUrl(rec.blob)
              appendMediaItem(threadId, segment.id, {
                id: crypto.randomUUID(),
                kind: rec.kind === 'video' ? 'video' : 'image',
                dataUrl,
                altText: '',
              })
              setPanel(null)
            } catch (err) {
              toast.fromError(err, 'Could not attach gallery item')
            }
          }}
        />
      )}

      {panel === 'generate' && (
        <div className="absolute left-0 bottom-full mb-1 z-30 w-[min(100vw-2rem,20rem)] rounded-md border border-[var(--color-border-faint)] bg-[var(--color-bg-raised)] p-2.5 shadow-lg space-y-2">
          <div className="flex items-center justify-between">
            <button type="button" onClick={() => setPanel('menu')} className="text-[10px] text-white/35 hover:text-white/60">
              ← Back
            </button>
            <span className="text-[10px] text-white/25 uppercase tracking-wide">Generate</span>
          </div>
          <textarea
            value={genPrompt}
            onChange={(e) => setGenPrompt(e.target.value)}
            rows={3}
            placeholder="Image prompt…"
            className="w-full bg-[var(--color-bg-input)] border border-[var(--color-border-faint)] rounded px-2 py-1.5 text-[11px] text-white/75 outline-none resize-none focus:border-[var(--color-border-strong)]"
          />
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void proposeFromDraft()}
              disabled={proposing}
              className="text-[11px] text-white/40 hover:text-white/70 transition-colors disabled:opacity-40"
            >
              {proposing ? 'Proposing…' : 'From draft'}
            </button>
            <div className="flex-1" />
            <button
              type="button"
              onClick={() => void runGenerate()}
              disabled={generate.isPending || genPrompt.trim().length < 10}
              className="text-[11px] text-[var(--color-accent)] hover:underline disabled:opacity-40"
            >
              {generate.isPending ? 'Generating…' : 'Generate'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function MenuItem({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full px-3 py-1.5 text-left text-[12px] text-white/70 hover:bg-white/[0.06] hover:text-white transition-colors"
    >
      {label}
    </button>
  )
}

function GalleryPicker({
  onBack,
  onPick,
}: {
  onBack: () => void
  onPick: (rec: Awaited<ReturnType<typeof mediaGallery.list>>[number]) => void
}) {
  const [items, setItems] = useState<Awaited<ReturnType<typeof mediaGallery.list>>>([])
  const [urls, setUrls] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    const created: string[] = []
    ;(async () => {
      try {
        const [images, videos] = await Promise.all([
          mediaGallery.list('image'),
          mediaGallery.list('video'),
        ])
        if (cancelled) return
        const merged = [...images, ...videos].sort((a, b) => b.createdAt - a.createdAt)
        const map: Record<string, string> = {}
        for (const r of merged) {
          const url = URL.createObjectURL(r.blob)
          created.push(url)
          map[r.id] = url
        }
        setItems(merged)
        setUrls(map)
      } catch (err) {
        toast.fromError(err, 'Gallery unavailable')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
      for (const u of created) URL.revokeObjectURL(u)
    }
  }, [])

  return (
    <div className="absolute left-0 bottom-full mb-1 z-30 w-[min(100vw-2rem,18rem)] rounded-md border border-[var(--color-border-faint)] bg-[var(--color-bg-raised)] p-2.5 shadow-lg space-y-2">
      <div className="flex items-center justify-between">
        <button type="button" onClick={onBack} className="text-[10px] text-white/35 hover:text-white/60">
          ← Back
        </button>
        <span className="text-[10px] text-white/25 uppercase tracking-wide">Gallery</span>
      </div>
      {loading ? (
        <p className="text-[11px] text-white/30 py-4 text-center">Loading…</p>
      ) : items.length === 0 ? (
        <p className="text-[11px] text-white/30 py-4 text-center">No images or videos saved yet</p>
      ) : (
        <div className="grid grid-cols-3 gap-1.5 max-h-48 overflow-y-auto">
          {items.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => onPick(item)}
              className="aspect-square rounded border border-white/[0.06] hover:border-white/25 overflow-hidden bg-black/40"
              title={item.prompt}
            >
              {item.kind === 'video' ? (
                <video src={urls[item.id]} muted className="w-full h-full object-cover" />
              ) : (
                <img src={urls[item.id]} alt="" className="w-full h-full object-cover" />
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

interface DraftPollButtonProps {
  threadId: string
  segment: PostSegment
  className?: string
}

export function DraftPollButton({ threadId, segment, className }: DraftPollButtonProps) {
  if (segment.poll) return null
  return (
    <button
      type="button"
      onClick={() => enablePoll(threadId, segment.id)}
      disabled={segment.media.length > 0}
      className={cn(TOOLBAR_BTN, className)}
      title={segment.media.length > 0 ? 'Remove media to add a poll' : undefined}
    >
      + Add poll
    </button>
  )
}

/** Shared under-bubble action row — all three adds inline. */
export function DraftSegmentToolbar({
  threadId,
  segment,
}: {
  threadId: string
  segment: PostSegment
}) {
  return (
    <div className={TOOLBAR_ROW}>
      <DraftMediaButton threadId={threadId} segment={segment} />
      <DraftPollButton threadId={threadId} segment={segment} />
      <button
        type="button"
        onClick={() => useComposeStore.getState().addSegment(threadId, segment.id)}
        className={TOOLBAR_BTN}
      >
        + Add thread
      </button>
    </div>
  )
}
