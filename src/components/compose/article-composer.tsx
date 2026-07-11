import { useRef } from 'react'
import { useComposeStore } from '../../stores/compose-store'
import type { ArticleDraft, MediaItem } from '../../lib/compose/types'
import { emptyArticleDraft } from '../../lib/compose/types'

interface ArticleComposerProps {
  threadId: string
}

const INLINE_MEDIA_CAP = 4

function kindForFile(type: string): MediaItem['kind'] {
  if (type.startsWith('video/')) return 'video'
  if (type === 'image/gif') return 'gif'
  return 'image'
}

function readFilesAsMedia(files: FileList | null, max: number): Promise<MediaItem[]> {
  if (!files || files.length === 0 || max <= 0) return Promise.resolve([])
  const readers = Array.from(files)
    .slice(0, max)
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
  return Promise.all(readers)
}

function MediaPreview({
  item,
  onRemove,
}: {
  item: MediaItem
  onRemove: () => void
}) {
  return (
    <div className="flex gap-2 items-start">
      {item.dataUrl && item.kind !== 'video' ? (
        <img
          src={item.dataUrl}
          alt=""
          className="w-12 h-12 rounded object-cover border border-white/10"
        />
      ) : (
        <div className="w-12 h-12 rounded border border-white/10 flex items-center justify-center text-[9px] text-white/30 uppercase">
          {item.kind}
        </div>
      )}
      <button
        type="button"
        onClick={onRemove}
        className="text-[10px] text-white/25 hover:text-red-400/70 transition-colors mt-1"
      >
        Remove
      </button>
    </div>
  )
}

export function ArticleComposer({ threadId }: ArticleComposerProps) {
  const thread = useComposeStore((s) => s.threads[threadId])
  const applyDraftPatch = useComposeStore((s) => s.applyDraftPatch)
  const coverInputRef = useRef<HTMLInputElement>(null)
  const inlineInputRef = useRef<HTMLInputElement>(null)

  if (!thread) return null

  const article: ArticleDraft = thread.draft.article ?? emptyArticleDraft()

  const patchArticle = (next: ArticleDraft) => {
    applyDraftPatch(threadId, { article: next, longform: false })
  }

  const onCover = (files: FileList | null) => {
    void readFilesAsMedia(files, 1).then(([item]) => {
      if (!item) return
      const current =
        useComposeStore.getState().threads[threadId]?.draft.article ?? emptyArticleDraft()
      patchArticle({ ...current, cover: item })
      if (coverInputRef.current) coverInputRef.current.value = ''
    })
  }

  const onInline = (files: FileList | null) => {
    void readFilesAsMedia(files, INLINE_MEDIA_CAP).then((items) => {
      if (items.length === 0) return
      const current =
        useComposeStore.getState().threads[threadId]?.draft.article ?? emptyArticleDraft()
      const room = INLINE_MEDIA_CAP - current.inlineMedia.length
      if (room <= 0) return
      patchArticle({
        ...current,
        inlineMedia: [...current.inlineMedia, ...items.slice(0, room)],
      })
      if (inlineInputRef.current) inlineInputRef.current.value = ''
    })
  }

  return (
    <div className="space-y-3">
      <label className="block text-[11px] text-white/40">
        Title
        <input
          value={article.title}
          onChange={(e) => patchArticle({ ...article, title: e.target.value })}
          placeholder="Article title"
          className="w-full mt-1 bg-[var(--color-bg-input)] border border-[var(--color-border-faint)] rounded-md px-2.5 py-2 text-[13px] text-white/80 outline-none focus:border-[var(--color-border-strong)] placeholder:text-white/20"
        />
      </label>

      <label className="block text-[11px] text-white/40">
        Body
        <textarea
          value={article.bodyMarkdown}
          onChange={(e) => patchArticle({ ...article, bodyMarkdown: e.target.value })}
          placeholder="Markdown or plain text…"
          className="w-full mt-1 min-h-[200px] bg-[var(--color-bg-input)] border border-[var(--color-border-faint)] rounded-md px-2.5 py-2 text-[13px] text-white/80 outline-none focus:border-[var(--color-border-strong)] placeholder:text-white/20 resize-y leading-relaxed"
        />
      </label>

      <div className="space-y-2">
        <div className="text-[11px] text-white/40">Cover image</div>
        {article.cover ? (
          <MediaPreview
            item={article.cover}
            onRemove={() => patchArticle({ ...article, cover: undefined })}
          />
        ) : (
          <>
            <input
              ref={coverInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => onCover(e.target.files)}
            />
            <button
              type="button"
              onClick={() => coverInputRef.current?.click()}
              className="text-[10px] text-white/30 hover:text-white/60 transition-colors"
            >
              + Add cover
            </button>
          </>
        )}
      </div>

      <div className="space-y-2">
        <div className="text-[11px] text-white/40">Inline images</div>
        {article.inlineMedia.map((m) => (
          <MediaPreview
            key={m.id}
            item={m}
            onRemove={() =>
              patchArticle({
                ...article,
                inlineMedia: article.inlineMedia.filter((x) => x.id !== m.id),
              })
            }
          />
        ))}
        {article.inlineMedia.length < INLINE_MEDIA_CAP && (
          <>
            <input
              ref={inlineInputRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={(e) => onInline(e.target.files)}
            />
            <button
              type="button"
              onClick={() => inlineInputRef.current?.click()}
              className="text-[10px] text-white/30 hover:text-white/60 transition-colors"
            >
              + Add inline images
            </button>
          </>
        )}
      </div>
    </div>
  )
}
