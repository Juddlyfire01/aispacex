import { useState, useRef, useEffect } from 'react'
import { useAuthStore } from '../../stores/auth-store'
import { useImageEdit, useImageUpscale, useBackgroundRemove } from '../../hooks/use-image-tools'
import { useMediaGallery } from '../../hooks/use-media-gallery'
import { Select } from '../ui/select'
import { Label, TextArea, PrimaryButton, ErrorText, EmptyState } from '../ui/shared'
import { SegmentedControl } from '../ui/sub-tabs'
import { GenerationView } from '../ui/generation-view'
import { LoadingState } from '../ui/spinner'
import { MediaGallery, type ImageToolAction } from '../media/media-gallery'
import { rawBase64, blobToDataUrl } from '../../lib/media-blob'
import { toast } from '../../stores/toast-store'
import type { GalleryItemView } from '../../hooks/use-media-gallery'

export type ImageToolsSeed = {
  tool: ImageToolAction
  dataUrl: string
  name: string
}

const EDIT_MODELS = [
  { value: 'qwen-edit', label: 'Qwen Edit' },
  { value: 'qwen-image-2-edit', label: 'Qwen Image 2 Edit' },
  { value: 'qwen-image-2-pro-edit', label: 'Qwen Image 2 Pro Edit' },
  { value: 'flux-2-max-edit', label: 'Flux 2 Max Edit' },
  { value: 'gpt-image-1-5-edit', label: 'GPT Image 1.5 Edit' },
  { value: 'grok-imagine-edit', label: 'Grok Imagine Edit' },
  { value: 'nano-banana-2-edit', label: 'Nano Banana 2 Edit' },
  { value: 'nano-banana-pro-edit', label: 'Nano Banana Pro Edit' },
  { value: 'seedream-v4-edit', label: 'Seedream V4 Edit' },
  { value: 'seedream-v5-lite-edit', label: 'Seedream V5 Lite Edit' },
]

export function ImageTools({
  seed,
  onSeedConsumed,
}: {
  seed?: ImageToolsSeed | null
  onSeedConsumed?: () => void
} = {}) {
  const apiKey = useAuthStore((s) => s.apiKey)
  const gallery = useMediaGallery('image')
  const [tool, setTool] = useState<ImageToolAction>('edit')
  const [imageData, setImageData] = useState<string | null>(null)
  const [imageName, setImageName] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  // Edit state
  const [editPrompt, setEditPrompt] = useState('')
  const [editModel, setEditModel] = useState('qwen-edit')

  // Upscale state — UI creativity is 0–100; API expects 0–0.02
  const [scale, setScale] = useState<2 | 4>(2)
  const [creativity, setCreativity] = useState(50)

  const editMutation = useImageEdit()
  const upscaleMutation = useImageUpscale()
  const bgRemoveMutation = useBackgroundRemove()

  useEffect(() => {
    if (!seed) return
    setTool(seed.tool)
    setImageData(seed.dataUrl)
    setImageName(seed.name)
    onSeedConsumed?.()
    // Only apply when a new seed arrives; ignore callback identity churn.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seed])

  const handleFileSelect = (file: File) => {
    const reader = new FileReader()
    reader.onload = () => {
      setImageData(reader.result as string)
      setImageName(file.name)
    }
    reader.readAsDataURL(file)
  }

  /** Already on Tools: load source; only switch tool mode when the pick differs. */
  const handleOpenInTools = (item: GalleryItemView, nextTool: ImageToolAction) => {
    void (async () => {
      try {
        const dataUrl = await blobToDataUrl(item.blob)
        setImageData(dataUrl)
        setImageName(item.prompt.trim().slice(0, 48) || 'gallery')
        if (nextTool !== tool) setTool(nextTool)
      } catch (err) {
        toast.fromError(err, 'Could not load gallery image')
      }
    })()
  }

  const persistResult = (blob: Blob, meta: {
    prompt: string
    model: string
    extras: Record<string, string | number | boolean>
  }) => {
    void gallery.add({
      kind: 'image',
      blob,
      mimeType: blob.type || 'image/png',
      prompt: meta.prompt,
      model: meta.model,
      extras: meta.extras,
    })
  }

  const handleProcess = () => {
    if (!imageData) return
    // FileReader produces a data URL for preview; Venice image endpoints want
    // plain base64 (esp. /image/upscale — data: prefix → "incomplete or corrupted").
    const image = rawBase64(imageData)
    const opts = {
      onError: (err: unknown) => toast.fromError(err, 'Image tool failed'),
    }
    if (tool === 'edit') {
      const prompt = editPrompt.trim()
      editMutation.mutate(
        { image, prompt, modelId: editModel },
        {
          ...opts,
          onSuccess: (blob) => persistResult(blob, {
            prompt,
            model: editModel,
            extras: { tool: 'edit', sourceName: imageName || 'upload' },
          }),
        },
      )
    } else if (tool === 'upscale') {
      upscaleMutation.mutate(
        { image, scale, creativity: creativity * 0.0002 },
        {
          ...opts,
          onSuccess: (blob) => persistResult(blob, {
            prompt: `Upscale ${scale}×`,
            model: 'upscale',
            extras: { tool: 'upscale', scale, creativity, sourceName: imageName || 'upload' },
          }),
        },
      )
    } else {
      bgRemoveMutation.mutate(image, {
        ...opts,
        onSuccess: (blob) => persistResult(blob, {
          prompt: 'Remove background',
          model: 'background-remove',
          extras: { tool: 'remove-bg', sourceName: imageName || 'upload' },
        }),
      })
    }
  }

  const isLoading = editMutation.isPending || upscaleMutation.isPending || bgRemoveMutation.isPending
  const error = editMutation.error || upscaleMutation.error || bgRemoveMutation.error

  const controls = (
    <>
      <SegmentedControl
        options={[['edit', 'Edit'], ['upscale', 'Upscale'], ['remove-bg', 'Remove BG']] as const}
        value={tool}
        onChange={setTool}
      />

      <div>
        <Label>Source image</Label>
        {imageData ? (
          <div className="relative group">
            <img src={imageData} alt="Source" className="w-full rounded-lg border border-[var(--color-border-faint)]" />
            <button
              onClick={() => { setImageData(null); setImageName('') }}
              aria-label="Remove image"
              className="absolute top-1.5 right-1.5 p-1 bg-black/60 rounded-md text-white/70 hover:text-white opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-all focus-visible:outline focus-visible:outline-1 focus-visible:outline-white/40"
            >
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
            </button>
            <span className="text-[13px] text-[var(--color-text-quaternary)] mt-1 block truncate">{imageName}</span>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="w-full border border-dashed border-[var(--color-border-soft)] hover:border-[var(--color-border-strong)] rounded-lg py-8 text-center transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--color-accent)] focus-visible:outline-offset-2"
          >
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => { if (e.target.files?.[0]) handleFileSelect(e.target.files[0]) }} />
            <p className="text-[14px] text-[var(--color-text-tertiary)]">Click to upload image</p>
          </button>
        )}
      </div>

      {tool === 'edit' && (
        <>
          <div><Label>Model</Label><Select value={editModel} onChange={setEditModel} options={EDIT_MODELS} searchable /></div>
          <div><Label>Edit prompt</Label><TextArea value={editPrompt} onChange={setEditPrompt} placeholder="Change the background to a sunset beach..." rows={3} /></div>
        </>
      )}

      {tool === 'upscale' && (
        <>
          <div>
            <Label>Scale</Label>
            <SegmentedControl
              options={[[2, '2×'], [4, '4×']] as const}
              value={scale}
              onChange={setScale}
            />
          </div>
          <div>
            <div className="flex items-center justify-between mb-1">
              <Label>Creativity</Label>
              <span className="text-[13px] text-[var(--color-text-quaternary)] font-mono">{creativity}</span>
            </div>
            <input
              type="range"
              min={0}
              max={100}
              step={1}
              value={creativity}
              onChange={(e) => setCreativity(Number(e.target.value))}
              className="w-full"
            />
            <p className="text-[12px] text-[var(--color-text-quaternary)] mt-1">Higher adds more detail and texture.</p>
          </div>
        </>
      )}

      <PrimaryButton
        onClick={handleProcess}
        disabled={!imageData || !apiKey || isLoading || (tool === 'edit' && !editPrompt.trim())}
        loading={isLoading}
      >
        {tool === 'edit' ? 'Edit Image' : tool === 'upscale' ? 'Upscale Image' : 'Remove Background'}
      </PrimaryButton>
      {error && <ErrorText>{error.message}</ErrorText>}
    </>
  )

  const output = (
    <MediaGallery
      kind="image"
      items={gallery.items}
      pendingCount={isLoading ? 1 : 0}
      onRemove={gallery.remove}
      onClearAll={gallery.clearAll}
      onOpenInTools={handleOpenInTools}
      onUsePrompt={(p) => {
        setTool('edit')
        setEditPrompt(p)
      }}
      empty={
        <div className="flex items-center justify-center h-full">
          {isLoading ? (
            <LoadingState label="Processing…" size="lg" />
          ) : (
            <EmptyState>
              {tool === 'edit' ? 'Edited images appear here' : tool === 'upscale' ? 'Upscaled images appear here' : 'Results appear here'}
            </EmptyState>
          )}
        </div>
      }
    />
  )

  return <GenerationView controls={controls} output={output} />
}
