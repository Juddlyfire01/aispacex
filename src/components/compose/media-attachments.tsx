import { useRef } from 'react'
import { useComposeStore } from '../../stores/compose-store'
import type { MediaItem, PostSegment } from '../../lib/compose/types'

// Attach images/video/gif to a segment (local preview via data URL) with an
// alt-text field for accessibility parity with X. Native upload happens later;
// for now media routes a draft to copy-out.

interface MediaAttachmentsProps {
  context: string
  segment: PostSegment
}

function kindForFile(type: string): MediaItem['kind'] {
  if (type.startsWith('video/')) return 'video'
  if (type === 'image/gif') return 'gif'
  return 'image'
}

export function MediaAttachments({ context, segment }: MediaAttachmentsProps) {
  const patchSegment = useComposeStore((s) => s.patchSegment)
  const inputRef = useRef<HTMLInputElement>(null)

  const onFiles = (files: FileList | null) => {
    if (!files || files.length === 0) return
    const readers = Array.from(files)
      .slice(0, 4 - segment.media.length)
      .map(
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
      patchSegment(context, segment.id, { media: [...segment.media, ...items] })
    })
  }

  const updateAlt = (id: string, altText: string) => {
    patchSegment(context, segment.id, {
      media: segment.media.map((m) => (m.id === id ? { ...m, altText } : m)),
    })
  }

  const remove = (id: string) => {
    patchSegment(context, segment.id, { media: segment.media.filter((m) => m.id !== id) })
  }

  return (
    <div className="space-y-2">
      {segment.media.map((m) => (
        <div key={m.id} className="flex gap-2 items-start">
          {m.dataUrl && m.kind !== 'video' ? (
            <img src={m.dataUrl} alt="" className="w-12 h-12 rounded object-cover border border-white/10" />
          ) : (
            <div className="w-12 h-12 rounded border border-white/10 flex items-center justify-center text-[9px] text-white/30 uppercase">
              {m.kind}
            </div>
          )}
          <input
            value={m.altText ?? ''}
            onChange={(e) => updateAlt(m.id, e.target.value)}
            placeholder="Alt text (accessibility)"
            className="flex-1 bg-[var(--color-bg-input)] border border-[var(--color-border-faint)] rounded px-2 py-1 text-[11px] text-white/70 outline-none focus:border-[var(--color-border-strong)]"
          />
          <button onClick={() => remove(m.id)} className="text-[10px] text-white/25 hover:text-red-400/70 transition-colors mt-1">
            Remove
          </button>
        </div>
      ))}
      {segment.media.length < 4 && (
        <>
          <input
            ref={inputRef}
            type="file"
            accept="image/*,video/*"
            multiple
            className="hidden"
            onChange={(e) => onFiles(e.target.files)}
          />
          <button
            onClick={() => inputRef.current?.click()}
            className="text-[10px] text-white/30 hover:text-white/60 transition-colors"
          >
            + Add media
          </button>
        </>
      )}
    </div>
  )
}
