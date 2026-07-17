import { useState, useRef } from 'react'
import { useAuthStore } from '../../stores/auth-store'
import { useImageEdit, useImageUpscale, useBackgroundRemove } from '../../hooks/use-image-tools'
import { useBlobUrl } from '../../hooks/use-blob-url'
import { Select } from '../ui/select'
import { Label, TextArea, PrimaryButton, ErrorText, EmptyState } from '../ui/shared'
import { SegmentedControl } from '../ui/sub-tabs'
import { cn } from '../../lib/utils'
import { rawBase64 } from '../../lib/media-blob'
import { toast } from '../../stores/toast-store'

type Tool = 'edit' | 'upscale' | 'remove-bg'

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

export function ImageTools() {
  const apiKey = useAuthStore((s) => s.apiKey)
  const [tool, setTool] = useState<Tool>('edit')
  const [imageData, setImageData] = useState<string | null>(null)
  const [imageName, setImageName] = useState('')
  const [resultUrl, setResultBlob, resetResult] = useBlobUrl()
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

  const handleFileSelect = (file: File) => {
    const reader = new FileReader()
    reader.onload = () => {
      setImageData(reader.result as string)
      setImageName(file.name)
      resetResult()
    }
    reader.readAsDataURL(file)
  }

  const handleProcess = () => {
    if (!imageData) return
    resetResult()
    // FileReader produces a data URL for preview; Venice image endpoints want
    // plain base64 (esp. /image/upscale — data: prefix → "incomplete or corrupted").
    const image = rawBase64(imageData)
    const opts = {
      onSuccess: (blob: Blob) => setResultBlob(blob),
      onError: (err: unknown) => toast.fromError(err, 'Image tool failed'),
    }
    if (tool === 'edit') {
      editMutation.mutate({ image, prompt: editPrompt.trim(), modelId: editModel }, opts)
    } else if (tool === 'upscale') {
      upscaleMutation.mutate({ image, scale, creativity: creativity * 0.0002 }, opts)
    } else {
      bgRemoveMutation.mutate(image, opts)
    }
  }

  const isLoading = editMutation.isPending || upscaleMutation.isPending || bgRemoveMutation.isPending
  const error = editMutation.error || upscaleMutation.error || bgRemoveMutation.error

  const downloadResult = () => {
    if (!resultUrl) return
    const a = document.createElement('a')
    a.href = resultUrl
    a.download = `venice-${tool}-result.png`
    a.click()
  }

  return (
    <div className="flex h-full">
      <div className="w-96 border-r border-[var(--color-border-faint)] bg-[var(--color-bg-base)] p-6 flex flex-col gap-4 overflow-y-auto shrink-0">
        <SegmentedControl
          options={[['edit', 'Edit'], ['upscale', 'Upscale'], ['remove-bg', 'Remove BG']] as const}
          value={tool}
          onChange={(id) => { setTool(id); resetResult() }}
        />

        {/* Image upload */}
        <div>
          <Label>Source image</Label>
          {imageData ? (
            <div className="relative group">
              <img src={imageData} alt="Source" className="w-full rounded-lg border border-white/[0.06]" />
              <button
                onClick={() => { setImageData(null); setImageName(''); resetResult() }}
                aria-label="Remove image"
                className="absolute top-1.5 right-1.5 p-1 bg-black/60 rounded-md text-white/60 hover:text-white opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-all focus-visible:outline focus-visible:outline-1 focus-visible:outline-white/40"
              >
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
              </button>
              <span className="text-[13px] text-white/15 mt-1 block truncate">{imageName}</span>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="w-full border border-dashed border-white/[0.08] hover:border-white/[0.15] rounded-lg py-8 text-center transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-white/30 focus-visible:outline-offset-2"
            >
              <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => { if (e.target.files?.[0]) handleFileSelect(e.target.files[0]) }} />
              <p className="text-[14px] text-white/40">Click to upload image</p>
            </button>
          )}
        </div>

        {/* Tool-specific controls */}
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
                <span className="text-[13px] text-white/30 font-mono">{creativity}</span>
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
              <p className="text-[12px] text-white/20 mt-1">Higher adds more detail and texture.</p>
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
      </div>

      <div className="flex-1 p-6 overflow-y-auto flex flex-col min-w-0">
        {resultUrl ? (
          <div className="animate-fade-in flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <Label>Result</Label>
              <button onClick={downloadResult} className="text-[14px] text-white/20 hover:text-white/40 transition-colors flex items-center gap-1.5">
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3" /></svg>
                Download
              </button>
            </div>
            <img src={resultUrl} alt="Result" className={cn('w-full rounded-lg border border-white/[0.04]', tool === 'remove-bg' && 'bg-[repeating-conic-gradient(#1a1a1a_0%_25%,#111_0%_50%)_0_0/20px_20px]')} />
          </div>
        ) : (
          <EmptyState>{tool === 'edit' ? 'Edited image appears here' : tool === 'upscale' ? 'Upscaled image appears here' : 'Result appears here'}</EmptyState>
        )}
      </div>
    </div>
  )
}
