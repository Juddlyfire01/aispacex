import { useRef } from 'react'
import { useComposeStore } from '../../stores/compose-store'
import type { ArticleDraft, MediaItem } from '../../lib/compose/types'
import { emptyArticleDraft } from '../../lib/compose/types'
import { ArticleBodyEditor } from './article-body-editor'

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
          className="w-12 h-12 rounded object-cover border border-[var(--color-border-soft)]"
        />
      ) : (
        <div className="w-12 h-12 rounded border border-[var(--color-border-soft)] flex items-center justify-center text-[9px] text-[var(--color-text-quaternary)] uppercase">
          {item.kind}
        </div>
      )}
      <button
        type="button"
        onClick={onRemove}
        className="text-[10px] text-[var(--color-text-quaternary)] hover:text-red-400/70 transition-colors mt-1"
      >
        Remove
      </button>
    </div>
  )
}

export function ArticleComposer({ threadId }: ArticleComposerProps) {
  // Narrow selectors: do not re-render this tree on every chat token / segment edit.
  const article = useComposeStore(
    (s) => s.threads[threadId]?.draft.article ?? null,
  )
  const applyDraftPatch = useComposeStore((s) => s.applyDraftPatch)
  const patchArticleStream = useComposeStore((s) => s.patchArticleStream)
  const streaming = useComposeStore((s) => s.draftWriterStreaming)
  const coverInputRef = useRef<HTMLInputElement>(null)
  const inlineInputRef = useRef<HTMLInputElement>(null)

  const threadExists = useComposeStore((s) => Boolean(s.threads[threadId]))
  if (!threadExists) return null

  const resolved: ArticleDraft = article ?? emptyArticleDraft()

  /** Structural article edits (media, seed) — full meta refresh. */
  const patchArticle = (next: ArticleDraft) => {
    applyDraftPatch(threadId, { article: next, longform: false })
  }

  /** Title/body typing — hot path (no meta / order / timestamp). */
  const patchArticleText = (title: string, bodyMarkdown: string) => {
    patchArticleStream(threadId, { title, bodyMarkdown })
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
      <div className="border border-[var(--color-border-faint)] rounded-lg p-3 bg-[var(--color-bg-surface)]">
        <input
          value={resolved.title}
          onChange={(e) => patchArticleText(e.target.value, resolved.bodyMarkdown)}
          placeholder="Article title"
          readOnly={streaming}
          className="w-full bg-transparent text-[17px] font-semibold text-[var(--color-text-primary)] outline-none placeholder:text-[var(--color-text-quaternary)] placeholder:font-normal read-only:cursor-default"
        />
      </div>

      <ArticleBodyEditor
        value={resolved.bodyMarkdown}
        streaming={streaming}
        onChange={(bodyMarkdown) => {
          const current =
            useComposeStore.getState().threads[threadId]?.draft.article ?? emptyArticleDraft()
          patchArticleText(current.title, bodyMarkdown)
        }}
      />

      <div className="space-y-2">
        <div className="text-[11px] text-[var(--color-text-tertiary)]">Cover image</div>
        {resolved.cover ? (
          <MediaPreview
            item={resolved.cover}
            onRemove={() => patchArticle({ ...resolved, cover: undefined })}
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
              className="text-[10px] text-[var(--color-text-quaternary)] hover:text-[var(--color-text-secondary)] transition-colors"
            >
              + Add cover
            </button>
          </>
        )}
      </div>

      <div className="space-y-2">
        <div className="text-[11px] text-[var(--color-text-tertiary)]">Inline images</div>
        {resolved.inlineMedia.map((m) => (
          <MediaPreview
            key={m.id}
            item={m}
            onRemove={() =>
              patchArticle({
                ...resolved,
                inlineMedia: resolved.inlineMedia.filter((x) => x.id !== m.id),
              })
            }
          />
        ))}
        {resolved.inlineMedia.length < INLINE_MEDIA_CAP && (
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
              className="text-[10px] text-[var(--color-text-quaternary)] hover:text-[var(--color-text-secondary)] transition-colors"
            >
              + Add inline images
            </button>
          </>
        )}
      </div>
    </div>
  )
}
