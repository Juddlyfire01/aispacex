import { useEffect, useMemo, useState } from 'react'
import { useSettingsStore } from '../../stores/settings-store'
import { useModels } from '../../hooks/use-models'
import { useAuthStore } from '../../stores/auth-store'
import { useMusic } from '../../hooks/use-music'
import { useMediaGallery } from '../../hooks/use-media-gallery'
import { Select } from '../ui/select'
import { Label, TextArea, PrimaryButton, PillGroup } from '../ui/shared'
import { GenerationView } from '../ui/generation-view'
import { Spinner } from '../ui/spinner'
import { MediaGallery } from '../media/media-gallery'
import { getMusicCapabilities } from '../../lib/music-capabilities'
import { cn } from '../../lib/utils'
import { toast } from '../../stores/toast-store'
import type { MusicQueueRequest } from '../../types/venice'

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

export function MusicView() {
  const apiKey = useAuthStore((s) => s.apiKey)
  const selectedModel = useSettingsStore((s) => s.selectedModels.music)
  const setSelectedModel = useSettingsStore((s) => s.setSelectedModel)
  const { data: models, defaultModelId, isLoading: modelsLoading } = useModels('music')
  const model = selectedModel || defaultModelId
  const modelObj = models?.find((m) => m.id === model)
  const caps = getMusicCapabilities(modelObj)

  const [prompt, setPrompt] = useState('')
  const [lyrics, setLyrics] = useState('')
  const [duration, setDuration] = useState(caps.defaultDuration)
  const [instrumental, setInstrumental] = useState(false)
  const [lyricsOptimizer, setLyricsOptimizer] = useState(false)
  const [voice, setVoice] = useState('')

  useEffect(() => {
    setDuration(caps.defaultDuration)
    setInstrumental(false)
    setLyricsOptimizer(false)
    setVoice(caps.defaultVoice ?? caps.voices[0] ?? '')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [model])

  const gallery = useMediaGallery('music')
  const {
    queue, jobs, activeCount, atCapacity, maxConcurrent,
    cancelAll, takeCompleted,
  } = useMusic()

  const minPromptLength = caps.minPromptLength
  const promptLen = prompt.trim().length
  const promptTooShort = promptLen > 0 && promptLen < minPromptLength

  const optimizerActive = caps.supportsLyricsOptimizer && lyricsOptimizer
  const lyricsMissing = caps.lyricsRequired && !optimizerActive && !lyrics.trim()

  useEffect(() => {
    const ids = jobs.filter((j) => j.status === 'completed' && j.blob).map((j) => j.id)
    for (const id of ids) {
      const taken = takeCompleted(id)
      if (!taken?.blob) continue
      void gallery.add({
        kind: 'music',
        blob: taken.blob,
        mimeType: taken.blob.type || 'audio/mpeg',
        prompt: taken.meta.prompt,
        model: taken.meta.model,
        extras: {
          ...taken.meta.extras,
          ...(taken.meta.lyrics ? { lyrics: taken.meta.lyrics } : {}),
        },
      })
    }
  }, [jobs, takeCompleted, gallery.add])

  const handleGenerate = () => {
    if (!prompt.trim()) return
    if (promptLen < minPromptLength) {
      toast.error('Prompt too short', `Must be at least ${minPromptLength} characters.`)
      return
    }
    if (lyricsMissing) {
      const name = modelObj?.model_spec?.name ?? 'This model'
      toast.error('Lyrics required', `${name} requires lyrics. Add lyrics${caps.supportsLyricsOptimizer ? ' or enable the lyrics optimizer' : ''}.`)
      return
    }
    if (atCapacity) {
      toast.error('Limit reached', `You can run up to ${maxConcurrent} tracks at once.`)
      return
    }

    const trimmedPrompt = prompt.trim()
    const trimmedLyrics = lyrics.trim() || undefined
    const req: MusicQueueRequest = { model, prompt: trimmedPrompt }

    if (optimizerActive) {
      req.lyrics_optimizer = true
    } else if (caps.supportsLyrics && trimmedLyrics) {
      req.lyrics_prompt = trimmedLyrics
    }
    if (caps.supportsDuration) req.duration_seconds = clamp(duration, caps.minDuration, caps.maxDuration)
    if (caps.supportsForceInstrumental && instrumental) req.force_instrumental = true
    if (caps.supportsVoice && voice) req.voice = voice

    const extras: Record<string, string | number | boolean> = {}
    if (caps.supportsDuration) extras.duration = clamp(duration, caps.minDuration, caps.maxDuration)
    if (instrumental) extras.instrumental = true
    if (voice) extras.voice = voice

    void queue(req, {
      prompt: trimmedPrompt,
      lyrics: trimmedLyrics,
      model,
      extras: Object.keys(extras).length ? extras : undefined,
    }).catch(() => { /* failure toasted in useMusic */ })
  }

  const durationStep = caps.maxDuration > 60 ? 5 : 1

  const modelOptions = useMemo(
    () => models?.map((m) => ({ value: m.id, label: m.model_spec?.name || m.id })) ?? [],
    [models],
  )

  const controls = (
    <>
      <div>
        <Label>Model</Label>
        <Select
          value={model}
          onChange={(v) => setSelectedModel('music', v)}
          options={modelOptions}
          searchable
          placeholder={modelsLoading ? 'Loading...' : 'Select model...'}
        />
      </div>

      <div>
        <Label hint={caps.promptCharacterLimit ? `${promptLen}/${caps.promptCharacterLimit}` : `${promptLen}/${minPromptLength}+ chars`}>Prompt</Label>
        <TextArea value={prompt} onChange={setPrompt} placeholder="An upbeat electronic track with a driving bassline and ethereal synths…" rows={4} maxLength={caps.promptCharacterLimit} />
        {promptTooShort && (
          <p className="text-[12px] text-amber-300/70 mt-1.5">Prompt must be at least {minPromptLength} characters.</p>
        )}
      </div>

      {caps.supportsLyrics && (
        <div>
          <Label hint={caps.lyricsRequired ? (optimizerActive ? 'auto-generated' : 'required') : 'optional'}>Lyrics</Label>
          <TextArea
            value={lyrics}
            onChange={setLyrics}
            placeholder={optimizerActive ? 'Lyrics will be generated from your prompt…' : 'Lyrics or vocal direction — use verse/chorus structure…'}
            rows={3}
            maxLength={caps.lyricsCharacterLimit}
          />
          {lyricsMissing && (
            <p className="text-[12px] text-amber-300/70 mt-1.5">This model needs lyrics to sing.</p>
          )}
        </div>
      )}

      {caps.supportsLyricsOptimizer && (
        <Toggle label="Auto-generate lyrics" value={lyricsOptimizer} onChange={setLyricsOptimizer} />
      )}

      {caps.supportsVoice && (
        <div>
          <Label>Voice</Label>
          <PillGroup
            ariaLabel="Voice"
            value={voice}
            onChange={setVoice}
            options={caps.voices.map((v) => ({ value: v, label: v }))}
          />
        </div>
      )}

      {caps.supportsDuration && (
        caps.durationOptions && caps.durationOptions.length > 0 ? (
          <div>
            <Label hint={`${duration}s`}>Duration</Label>
            <PillGroup
              ariaLabel="Duration"
              value={String(duration)}
              onChange={(v) => setDuration(Number(v))}
              options={caps.durationOptions.map((d) => ({ value: String(d), label: `${d}s` }))}
            />
          </div>
        ) : (
          <div>
            <Label hint={`${duration}s`}>Duration</Label>
            <input
              type="range"
              min={caps.minDuration}
              max={caps.maxDuration}
              step={durationStep}
              value={duration}
              onChange={(e) => setDuration(Number(e.target.value))}
              className="w-full"
            />
            <div className="flex justify-between text-[11px] text-[var(--color-text-quaternary)] mt-1">
              <span>{caps.minDuration}s</span>
              <span>{caps.maxDuration}s</span>
            </div>
          </div>
        )
      )}

      {caps.supportsForceInstrumental && (
        <Toggle label="Instrumental only" value={instrumental} onChange={setInstrumental} />
      )}

      <PrimaryButton
        onClick={handleGenerate}
        disabled={!prompt.trim() || promptTooShort || lyricsMissing || !apiKey || atCapacity}
        loading={activeCount > 0}
        size="lg"
      >
        {activeCount > 0 ? `Generate another (${activeCount}/${maxConcurrent})` : 'Generate Music'}
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
      kind="music"
      items={gallery.items}
      pendingCount={activeCount}
      onRemove={gallery.remove}
      onClearAll={gallery.clearAll}
      onUsePrompt={(p) => setPrompt(p)}
      empty={
        <div className="flex items-center justify-center flex-1 h-full text-[var(--color-text-quaternary)] text-[15px]">
          {activeCount > 0 ? (
            <div className="flex flex-col items-center gap-3" role="status" aria-live="polite">
              <Spinner size="lg" />
              <span className="text-[var(--color-text-secondary)] text-center">
                Composing {activeCount} track{activeCount === 1 ? '' : 's'}…
                <span className="block text-[12px] text-[var(--color-text-quaternary)] mt-1">typically 20s–90s each</span>
              </span>
              <button
                onClick={cancelAll}
                className="text-[13px] text-[var(--color-text-quaternary)] hover:text-[var(--color-text-secondary)] underline underline-offset-2 transition-colors"
              >
                Cancel all
              </button>
            </div>
          ) : !prompt ? (
            <div className="max-w-md w-full flex flex-col gap-2">
              <div className="text-[12px] uppercase tracking-[0.08em] text-[var(--color-text-quaternary)] font-medium text-left">Try one of these</div>
              {MUSIC_EXAMPLES.map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setPrompt(p)}
                  className="text-left px-3 py-2.5 rounded-lg border border-[var(--color-border-faint)] bg-[var(--color-border-faint)] hover:border-[var(--color-border-strong)] hover:bg-[var(--color-border-faint)] transition-all text-[14px] text-[var(--color-text-secondary)] focus-visible:outline focus-visible:outline-1 focus-visible:outline-[var(--color-accent)]"
                >
                  {p}
                </button>
              ))}
            </div>
          ) : (
            <span>Press Generate to create your track</span>
          )}
        </div>
      }
    />
  )

  return <GenerationView controls={controls} output={output} />
}

const MUSIC_EXAMPLES = [
  'Lo-fi hip-hop beat with vinyl crackle and rain — 80 bpm, mellow',
  'Cinematic orchestral build — slow strings rising into triumphant brass',
  'Synthwave with retro arpeggios, warm pads, gated reverb drums — 105 bpm',
  'Acoustic folk fingerpicking, soft female vocals, intimate room sound',
]

function Toggle({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center justify-between">
      <Label>{label}</Label>
      <button
        onClick={() => onChange(!value)}
        aria-pressed={value}
        aria-label={label}
        className={cn('w-9 h-5 rounded-full transition-colors relative', value ? 'bg-[var(--color-accent)]' : 'bg-[var(--color-border-faint)]')}
      >
        <div className={cn('absolute top-[2px] w-[16px] h-[16px] rounded-full transition-all', value ? 'left-[20px] bg-[var(--color-accent-contrast)]' : 'left-[2px] bg-[var(--color-text-secondary)]')} />
      </button>
    </div>
  )
}
