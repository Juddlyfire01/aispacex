import { useState, useRef, useMemo, useEffect } from 'react'
import { useAuthStore } from '../../stores/auth-store'
import { useVideoModels, type VideoModelGroup } from '../../hooks/use-models'
import { useVideo } from '../../hooks/use-video'
import { useMediaGallery } from '../../hooks/use-media-gallery'
import { Select } from '../ui/select'
import { Label, TextArea, PrimaryButton, PillGroup } from '../ui/shared'
import { GenerationView } from '../ui/generation-view'
import { Spinner } from '../ui/spinner'
import { SegmentedControl } from '../ui/sub-tabs'
import { MediaGallery } from '../media/media-gallery'
import { cn } from '../../lib/utils'
import { attachVideoReferenceImage } from '../../lib/video-request'
import { useMediaInflightStore } from '../../stores/media-inflight-store'
import { toast } from '../../stores/toast-store'
import type { VideoQueueRequest, VideoConstraints } from '../../types/venice'

const MIN_PROMPT_LENGTH = 10

export function VideoView() {
  const apiKey = useAuthStore((s) => s.apiKey)
  const { groups, isLoading: modelsLoading } = useVideoModels()
  const [selectedGroup, setSelectedGroup] = useState<string>('')
  const [mode, setMode] = useState<'text' | 'image'>('text')

  const [prompt, setPrompt] = useState('')
  const [negativePrompt, setNegativePrompt] = useState('')
  const [duration, setDuration] = useState('')
  const [resolution, setResolution] = useState('')
  const [aspect, setAspect] = useState('')
  const [imageUrl, setImageUrl] = useState<string | null>(null)
  const [imageName, setImageName] = useState('')
  const [audioEnabled, setAudioEnabled] = useState(true)
  const fileRef = useRef<HTMLInputElement>(null)

  const gallery = useMediaGallery('video')
  const {
    queue, jobs, activeCount, atCapacity, maxConcurrent,
    cancelAll, takeCompleted,
  } = useVideo()
  const inflightPending = useMediaInflightStore((s) => s.pendingSlots('video'))
  const pendingCount = Math.max(activeCount, inflightPending)

  const promptTooShort = prompt.trim().length > 0 && prompt.trim().length < MIN_PROMPT_LENGTH

  // Resolve current group and constraints
  const group: VideoModelGroup | undefined = useMemo(() => {
    if (!selectedGroup && groups.length > 0) return groups[0]
    return groups.find((g) => g.name === selectedGroup)
  }, [groups, selectedGroup])

  const activeModel = mode === 'image' ? group?.imageModel : group?.textModel
  const constraints = activeModel?.model_spec?.constraints as VideoConstraints | undefined

  // Auto-select first group when models load
  const currentGroupName = group?.name || ''

  // Can this group do image-to-video?
  const hasImageMode = !!group?.imageModel
  const hasTextMode = !!group?.textModel

  // R2V-only groups have no text model — keep mode aligned so activeModel resolves
  useEffect(() => {
    if (hasImageMode && !hasTextMode && mode !== 'image') setMode('image')
    else if (hasTextMode && !hasImageMode && mode !== 'text') setMode('text')
  }, [hasImageMode, hasTextMode, mode])

  // Dismiss completed jobs from the in-page queue (gallery already persisted in the hook).
  useEffect(() => {
    const ids = jobs.filter((j) => j.status === 'completed' && j.blob).map((j) => j.id)
    for (const id of ids) {
      takeCompleted(id)
    }
  }, [jobs, takeCompleted])

  // Build option lists from constraints
  const durationOpts = useMemo(() =>
    (constraints?.durations || []).map((d) => ({ value: d, label: d })),
    [constraints],
  )
  const resolutionOpts = useMemo(() =>
    (constraints?.resolutions || []).map((r) => ({ value: r, label: r })),
    [constraints],
  )
  const aspectOpts = useMemo(() =>
    (constraints?.aspect_ratios || []).map((a) => ({ value: a, label: a })),
    [constraints],
  )

  // Ensure selected values are valid for current model
  const effectiveDuration = durationOpts.some((o) => o.value === duration) ? duration : durationOpts[0]?.value || ''
  const effectiveResolution = resolutionOpts.some((o) => o.value === resolution) ? resolution : resolutionOpts[0]?.value || ''
  const effectiveAspect = aspectOpts.some((o) => o.value === aspect) ? aspect : aspectOpts[0]?.value || ''

  const groupOptions = useMemo(() =>
    groups.map((g) => ({
      value: g.name,
      label: g.name,
    })),
    [groups],
  )

  const handleImageUpload = (file: File) => {
    const reader = new FileReader()
    reader.onload = () => {
      setImageUrl(reader.result as string)
      setImageName(file.name)
    }
    reader.readAsDataURL(file)
  }

  const handleGenerate = () => {
    if (!prompt.trim() || !activeModel) return
    if (prompt.trim().length < MIN_PROMPT_LENGTH) {
      toast.error('Prompt too short', `Must be at least ${MIN_PROMPT_LENGTH} characters.`)
      return
    }
    if (atCapacity) {
      toast.error('Limit reached', `You can run up to ${maxConcurrent} videos at once.`)
      return
    }
    const trimmedPrompt = prompt.trim()
    const trimmedNegative = negativePrompt.trim() || undefined
    const req: VideoQueueRequest = {
      model: activeModel.id,
      prompt: trimmedPrompt,
      negative_prompt: trimmedNegative,
      duration: effectiveDuration || undefined,
      resolution: effectiveResolution || undefined,
      aspect_ratio: effectiveAspect || undefined,
    }
    if (mode === 'image' && imageUrl) {
      attachVideoReferenceImage(req, activeModel.id, imageUrl)
    }
    if (constraints?.audio && constraints.audio_configurable) {
      req.audio = audioEnabled
    }
    const extras: Record<string, string | number | boolean> = {}
    if (effectiveDuration) extras.duration = effectiveDuration
    if (effectiveResolution) extras.resolution = effectiveResolution
    if (effectiveAspect) extras.aspectRatio = effectiveAspect
    void queue(req, {
      prompt: trimmedPrompt,
      negativePrompt: trimmedNegative,
      model: activeModel.id,
      extras: Object.keys(extras).length ? extras : undefined,
    }).catch(() => { /* failure toasted in useVideo */ })
  }

  // Tags for model capabilities
  const tags: string[] = []
  if (group) {
    if (group.sets.includes('uncensored')) tags.push('Uncensored')
    if (group.sets.includes('open_source')) tags.push('Open Source')
    if (group.sets.includes('photorealistic')) tags.push('Photorealistic')
    if (group.sets.includes('cinematic')) tags.push('Cinematic')
    if (group.sets.includes('fast')) tags.push('Fast')
    if (constraints?.audio) tags.push('Audio')
    if (constraints?.audio_input) tags.push('Audio Input')
  }

  const controls = (
    <>
        {/* Model selector */}
        <div>
          <Label>Model</Label>
          <Select
            value={currentGroupName}
            onChange={(v) => { setSelectedGroup(v); setDuration(''); setResolution(''); setAspect('') }}
            options={groupOptions}
            searchable
            placeholder={modelsLoading ? 'Loading...' : 'Select model...'}
          />
        </div>

        {/* Text / Image mode toggle */}
        {(hasTextMode || hasImageMode) && (
          <SegmentedControl
            options={[
              ...(hasTextMode ? [['text', 'Text to Video'] as const] : []),
              ...(hasImageMode ? [['image', 'Image to Video'] as const] : []),
            ]}
            value={mode}
            onChange={setMode}
          />
        )}

        <div>
          <Label hint={`${prompt.trim().length}/${MIN_PROMPT_LENGTH}+ chars`}>Prompt</Label>
          <TextArea value={prompt} onChange={setPrompt} placeholder="A cinematic drone shot over misty mountains at sunrise..." rows={4} />
          {promptTooShort && (
            <p className="text-[12px] text-amber-300/70 mt-1.5">Prompt must be at least {MIN_PROMPT_LENGTH} characters.</p>
          )}
        </div>

        <div>
          <Label>Negative prompt</Label>
          <TextArea value={negativePrompt} onChange={setNegativePrompt} placeholder="low quality, blurry..." rows={2} />
        </div>

        {/* Image upload for image-to-video */}
        {mode === 'image' && (
          <div>
            <Label>Reference image</Label>
            {imageUrl ? (
              <div className="relative group">
                <img src={imageUrl} alt="Reference" className="w-full rounded-lg border border-[var(--color-border-faint)]" />
                <button
                  onClick={() => { setImageUrl(null); setImageName('') }}
                  className="absolute top-1.5 right-1.5 p-1 bg-black/60 rounded-md text-[var(--color-text-tertiary)] hover:text-[var(--color-text-primary)] opacity-0 group-hover:opacity-100 transition-all"
                >
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                </button>
                <span className="text-[16px] text-[var(--color-text-quaternary)] mt-1 block truncate">{imageName}</span>
              </div>
            ) : (
              <div
                onClick={() => fileRef.current?.click()}
                className="border border-dashed border-[var(--color-border-soft)] hover:border-[var(--color-border-strong)] rounded-lg py-5 text-center cursor-pointer transition-colors"
              >
                <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => { if (e.target.files?.[0]) handleImageUpload(e.target.files[0]) }} />
                <p className="text-[14px] text-[var(--color-text-quaternary)]">Click to add image</p>
              </div>
            )}
          </div>
        )}

        {/* Duration */}
        {durationOpts.length > 0 && (
          <div>
            <Label>Duration</Label>
            {durationOpts.length <= 5 ? (
              <PillGroup options={durationOpts} value={effectiveDuration} onChange={setDuration} />
            ) : (
              <DurationSlider
                options={durationOpts.map((o) => o.value)}
                value={effectiveDuration}
                onChange={setDuration}
              />
            )}
          </div>
        )}

        {/* Resolution & Aspect */}
        <div className="grid grid-cols-2 gap-3">
          {resolutionOpts.length > 0 && (
            <div>
              <Label>Resolution</Label>
              <Select value={effectiveResolution} onChange={setResolution} options={resolutionOpts} />
            </div>
          )}
          {aspectOpts.length > 0 && (
            <div>
              <Label>Aspect</Label>
              <Select value={effectiveAspect} onChange={setAspect} options={aspectOpts} />
            </div>
          )}
        </div>

        {/* Audio toggle */}
        {constraints?.audio && constraints.audio_configurable && (
          <div className="flex items-center justify-between">
            <Label>Generate audio</Label>
            <button
              onClick={() => setAudioEnabled(!audioEnabled)}
              className={cn(
                'w-8 h-[18px] rounded-full transition-colors relative',
                audioEnabled ? 'bg-[var(--color-btn-primary-bg)]' : 'bg-[var(--color-border-faint)]',
              )}
            >
              <div className={cn(
                'absolute top-[2px] w-[14px] h-[14px] rounded-full transition-all',
                audioEnabled ? 'left-[16px] bg-[var(--color-btn-primary-fg)]' : 'left-[2px] bg-[var(--color-text-quaternary)]',
              )} />
            </button>
          </div>
        )}

        {/* Capability tags */}
        {tags.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {tags.map((t) => (
              <span key={t} className="text-[16px] text-[var(--color-text-quaternary)] bg-[var(--color-border-faint)] border border-[var(--color-border-faint)] rounded px-1.5 py-0.5">{t}</span>
            ))}
          </div>
        )}

        <PrimaryButton
          onClick={handleGenerate}
          disabled={!prompt.trim() || promptTooShort || !apiKey || !activeModel || atCapacity || (mode === 'image' && !imageUrl)}
          loading={pendingCount > 0}
        >
          {pendingCount > 0 ? `Generate another (${pendingCount}/${maxConcurrent})` : 'Generate Video'}
        </PrimaryButton>
      {activeCount > 0 && (
        <button
          type="button"
          onClick={cancelAll}
          className="text-[13px] text-[var(--color-text-quaternary)] hover:text-[var(--color-text-secondary)] underline underline-offset-2 transition-colors self-start"
        >
          Cancel all ({activeCount})
        </button>
      )}
    </>
  )

  const output = (
    <MediaGallery
      kind="video"
      items={gallery.items}
      pendingCount={pendingCount}
      onRemove={gallery.remove}
      onClearAll={gallery.clearAll}
      onUsePrompt={(p, neg) => {
        setPrompt(p)
        if (neg !== undefined) setNegativePrompt(neg)
      }}
      empty={
        <div className="flex items-center justify-center flex-1 h-full text-[var(--color-text-quaternary)] text-[15px]">
          {pendingCount > 0 ? (
            <div className="flex flex-col items-center gap-3" role="status" aria-live="polite">
              <Spinner size="lg" />
              <span className="text-[var(--color-text-secondary)] text-center">
                Generating {pendingCount} video{pendingCount === 1 ? '' : 's'}…
                <span className="block text-[12px] text-[var(--color-text-quaternary)] mt-1">typically 30s–2min each</span>
              </span>
              {activeCount > 0 && (
              <button
                onClick={cancelAll}
                className="text-[13px] text-[var(--color-text-quaternary)] hover:text-[var(--color-text-secondary)] underline underline-offset-2 transition-colors"
              >
                Cancel all
              </button>
              )}
            </div>
          ) : (
            <div className="flex flex-col items-center gap-2">
              <span>Generated videos appear here</span>
              <span className="text-[12px] text-[var(--color-text-quaternary)]">Run up to {maxConcurrent} in parallel</span>
            </div>
          )}
        </div>
      }
    />
  )

  return <GenerationView controls={controls} output={output} />
}

function DurationSlider({ options, value, onChange }: { options: string[]; value: string; onChange: (v: string) => void }) {
  const idx = options.indexOf(value)
  const currentIdx = idx >= 0 ? idx : 0
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <span className="text-[16px] text-[var(--color-text-quaternary)] font-mono">{options[currentIdx]}</span>
        <span className="text-[16px] text-[var(--color-text-quaternary)]">{options[0]} — {options[options.length - 1]}</span>
      </div>
      <input
        type="range"
        min={0}
        max={options.length - 1}
        value={currentIdx}
        onChange={(e) => onChange(options[Number(e.target.value)])}
        className="w-full"
      />
    </div>
  )
}
