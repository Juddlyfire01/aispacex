import { useComposeStore } from '../../stores/compose-store'
import type { PostSegment } from '../../lib/compose/types'

// Attached media list + alt text. Add actions live on the segment / draft toolbar
// (+ Media), not inline here.

interface MediaAttachmentsProps {
  threadId: string
  segment: PostSegment
}

export function MediaAttachments({ threadId, segment }: MediaAttachmentsProps) {
  const patchSegment = useComposeStore((s) => s.patchSegment)

  if (segment.media.length === 0) return null

  const updateAlt = (id: string, altText: string) => {
    patchSegment(threadId, segment.id, {
      media: segment.media.map((m) => (m.id === id ? { ...m, altText } : m)),
    })
  }

  const remove = (id: string) => {
    patchSegment(threadId, segment.id, { media: segment.media.filter((m) => m.id !== id) })
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
    </div>
  )
}
