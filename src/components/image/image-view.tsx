import { useState, useMemo, useEffect } from 'react'
import { useSettingsStore } from '../../stores/settings-store'
import { useModels } from '../../hooks/use-models'
import { useStyles } from '../../hooks/use-styles'
import { useImageGenerate } from '../../hooks/use-image'
import { useMediaGallery } from '../../hooks/use-media-gallery'
import { useAuthStore } from '../../stores/auth-store'
import { Select } from '../ui/select'
import { Label, TextArea, PrimaryButton, PillGroup, ExamplePrompts } from '../ui/shared'
import { GenerationView } from '../ui/generation-view'
import { LoadingState } from '../ui/spinner'
import { MediaGallery, type ImageToolAction } from '../media/media-gallery'
import { cn } from '../../lib/utils'
import { blobFromBase64, mimeFromBase64 } from '../../lib/media-blob'
import { MAX_CONCURRENT_MEDIA_JOBS } from '../../lib/media-concurrency'
import { toast } from '../../stores/toast-store'
import type { ImageConstraints } from '../../types/venice'
import type { GalleryItemView } from '../../hooks/use-media-gallery'

const MIN_PROMPT_LENGTH = 10

const IMAGE_EXAMPLES = [
  'A serene mountain lake at golden hour, low fog over the water, painterly',
  'Macro photo of a dewdrop on a spider web, sunrise lighting',
  'Cyberpunk street market at night, neon signs reflecting in puddles',
  'Children\'s book illustration of a fox reading a book under a mushroom',
]

const DEFAULT_SIZES = [
  { value: '0', label: '512' },
  { value: '1', label: '768' },
  { value: '2', label: '1024' },
  { value: '3', label: '1280' },
]
const DEFAULT_SIZE_MAP = [
  { w: 512, h: 512 }, { w: 768, h: 768 }, { w: 1024, h: 1024 }, { w: 1280, h: 1280 },
]

export function ImageView({
  onOpenInTools,
}: {
  onOpenInTools?: (item: GalleryItemView, tool: ImageToolAction) => void
} = {}) {
  const apiKey = useAuthStore((s) => s.apiKey)
  const selectedModel = useSettingsStore((s) => s.selectedModels.image)
  const setSelectedModel = useSettingsStore((s) => s.setSelectedModel)
  const { data: models, defaultModelId, isLoading: modelsLoading } = useModels('image')
  const { data: styles } = useStyles()
  const model = selectedModel || defaultModelId
  const gallery = useMediaGallery('image')

  // Get constraints for the selected model
  const modelData = models?.find((m) => m.id === model)
  const constraints = modelData?.model_spec?.constraints as ImageConstraints | undefined
  const hasAspectRatios = constraints?.aspectRatios && constraints.aspectRatios.length > 0
  const hasResolutions = constraints?.resolutions && constraints.resolutions.length > 0
  const maxSteps = constraints?.steps?.max || 50
  const defaultSteps = constraints?.steps?.default || 20
  const promptLimit = constraints?.promptCharacterLimit || 4096

  const [prompt, setPrompt] = useState('')
  const [negativePrompt, setNegativePrompt] = useState('')
  const [sizeIdx, setSizeIdx] = useState('2')
  const [aspectRatio, setAspectRatio] = useState('')
  const [resolution, setResolution] = useState('')
  const [style, setStyle] = useState('')
  const [steps, setSteps] = useState(defaultSteps)
  const [variants, setVariants] = useState(1)
  const [hideWatermark] = useState(true)
  const [safeMode, setSafeMode] = useState(false)
  const [pendingJobs, setPendingJobs] = useState(0)
  const [pendingSlots, setPendingSlots] = useState(0)

  const promptTooShort = prompt.trim().length > 0 && prompt.trim().length < MIN_PROMPT_LENGTH

  useEffect(() => {
    setAspectRatio('')
    setResolution('')
    setSizeIdx('2')
    setSteps(constraints?.steps?.default || 20)
  }, [model, constraints?.steps?.default])

  const modelOptions = useMemo(
    () => models?.map((m) => ({ value: m.id, label: m.model_spec?.name || m.id })) ?? [],
    [models],
  )

  // Build aspect ratio options from model constraints
  const aspectOptions = useMemo(() => {
    if (!hasAspectRatios) return []
    return [
      { value: '', label: 'Auto' },
      ...constraints!.aspectRatios!.map((a) => ({ value: a, label: a })),
    ]
  }, [constraints, hasAspectRatios])

  // Build resolution options from model constraints (some models support 1K/2K/4K)
  const resolutionOptions = useMemo(() => {
    if (!hasResolutions) return []
    return constraints!.resolutions!.map((r) => ({ value: r, label: r }))
  }, [constraints, hasResolutions])

  const mutation = useImageGenerate()
  const styleOptions = [{ value: '', label: 'None' }, ...(styles?.map((s) => ({ value: s, label: s })) ?? [])]
  const atCapacity = pendingJobs >= MAX_CONCURRENT_MEDIA_JOBS

  const handleGenerate = () => {
    if (!prompt.trim()) return
    if (prompt.trim().length < MIN_PROMPT_LENGTH) {
      toast.error('Prompt too short', `Must be at least ${MIN_PROMPT_LENGTH} characters.`)
      return
    }
    if (atCapacity) {
      toast.error('Limit reached', `You can run up to ${MAX_CONCURRENT_MEDIA_JOBS} image jobs at once.`)
      return
    }
    const size = DEFAULT_SIZE_MAP[Number(sizeIdx)]

    const req: Record<string, unknown> = {
      prompt: prompt.trim(),
      negative_prompt: negativePrompt.trim() || undefined,
      model,
      style_preset: style || undefined,
      variants,
      hide_watermark: hideWatermark,
      safe_mode: safeMode,
      steps,
    }

    if (hasAspectRatios && aspectRatio) {
      req.aspect_ratio = aspectRatio
    } else if (!hasAspectRatios) {
      req.width = size.w
      req.height = size.h
    }

    if (hasResolutions && resolution) {
      req.resolution = resolution
    }

    const trimmedPrompt = prompt.trim()
    const trimmedNegative = negativePrompt.trim() || undefined
    const extras: Record<string, string | number | boolean> = { steps, variants, safeMode }
    if (style) extras.style = style
    if (hasAspectRatios && aspectRatio) extras.aspectRatio = aspectRatio
    if (hasResolutions && resolution) extras.resolution = resolution

    setPendingJobs((n) => n + 1)
    const jobVariants = variants
    setPendingSlots((n) => n + jobVariants)
    mutation.mutate(
      req as unknown as Parameters<typeof mutation.mutate>[0],
      {
        onSuccess: (data) => {
          const payloads = data.images.map((img) => typeof img === 'string' ? img : img.b64_json)
          void (async () => {
            for (const b64 of payloads) {
              const blob = blobFromBase64(b64)
              await gallery.add({
                kind: 'image',
                blob,
                mimeType: blob.type || mimeFromBase64(b64),
                prompt: trimmedPrompt,
                negativePrompt: trimmedNegative,
                model,
                extras,
              })
            }
          })()
        },
        onError: (err) => {
          toast.fromError(err, 'Image failed')
        },
        onSettled: () => {
          setPendingJobs((n) => Math.max(0, n - 1))
          setPendingSlots((n) => Math.max(0, n - jobVariants))
        },
      },
    )
  }

  const controls = (
    <>
      <div>
        <Label>Model</Label>
        <Select
          value={model}
          onChange={(v) => setSelectedModel('image', v)}
          options={modelOptions}
          searchable
          placeholder={modelsLoading ? 'Loading...' : 'Select model...'}
        />
      </div>

      <div>
        <Label hint={`${prompt.trim().length}/${MIN_PROMPT_LENGTH}+ chars`}>Prompt</Label>
        <TextArea value={prompt} onChange={setPrompt} placeholder="A serene mountain landscape at golden hour…" />
        {promptTooShort && (
          <p className="text-[12px] text-amber-300/70 mt-1.5">Prompt must be at least {MIN_PROMPT_LENGTH} characters.</p>
        )}
      </div>
      <div><Label>Negative prompt</Label><TextArea value={negativePrompt} onChange={setNegativePrompt} placeholder="blurry, low quality…" rows={2} /></div>

      {hasAspectRatios ? (
        <div><Label>Aspect Ratio</Label><PillGroup options={aspectOptions} value={aspectRatio} onChange={setAspectRatio} /></div>
      ) : (
        <div><Label>Size</Label><PillGroup options={DEFAULT_SIZES} value={sizeIdx} onChange={setSizeIdx} /></div>
      )}

      {hasResolutions && (
        <div><Label>Resolution</Label><PillGroup options={resolutionOptions} value={resolution || resolutionOptions[0]?.value || ''} onChange={setResolution} /></div>
      )}

      <div><Label>Style</Label><Select value={style} onChange={setStyle} options={styleOptions} searchable placeholder="None" /></div>

      <div>
        <Label hint={String(steps)}>Steps</Label>
        <input type="range" min={1} max={maxSteps} value={steps} onChange={(e) => setSteps(Number(e.target.value))} className="w-full" />
      </div>
      <div>
        <Label hint={String(variants)}>Variants</Label>
        <input type="range" min={1} max={4} value={variants} onChange={(e) => setVariants(Number(e.target.value))} className="w-full" />
      </div>

      <div className="flex items-center justify-between">
        <Label>Safe mode</Label>
        <button
          type="button"
          role="switch"
          aria-checked={safeMode}
          onClick={() => setSafeMode(!safeMode)}
          aria-label="Toggle safe mode"
          className={cn(
            'w-8 h-[18px] rounded-full transition-colors relative',
            safeMode ? 'bg-[var(--color-btn-primary-bg)]' : 'bg-[var(--color-border-faint)]',
          )}
        >
          <div className={cn(
            'absolute top-[2px] w-[14px] h-[14px] rounded-full transition-all',
            safeMode ? 'left-[16px] bg-[var(--color-btn-primary-fg)]' : 'left-[2px] bg-[var(--color-text-quaternary)]',
          )} />
        </button>
      </div>

      <PrimaryButton
        onClick={handleGenerate}
        disabled={!prompt.trim() || promptTooShort || !apiKey || atCapacity}
        loading={pendingJobs > 0}
        size="lg"
      >
        {pendingJobs > 0 ? `Generate another (${pendingJobs}/${MAX_CONCURRENT_MEDIA_JOBS})` : 'Generate'}
      </PrimaryButton>
    </>
  )

  const output = (
    <MediaGallery
      kind="image"
      items={gallery.items}
      pendingCount={pendingSlots}
      onRemove={gallery.remove}
      onClearAll={gallery.clearAll}
      onOpenInTools={onOpenInTools}
      onUsePrompt={(p, neg) => {
        setPrompt(p)
        if (neg !== undefined) setNegativePrompt(neg)
      }}
      empty={
        <div className="flex items-center justify-center h-full">
          {pendingJobs > 0 ? (
            <LoadingState label="Generating…" size="lg" />
          ) : (
            <ExamplePrompts items={IMAGE_EXAMPLES} onPick={setPrompt} />
          )}
        </div>
      }
    />
  )

  return <GenerationView controls={controls} output={output} />
}
