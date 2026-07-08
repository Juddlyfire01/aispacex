import { useEffect, useMemo, useState } from 'react'
import { useSettingsStore } from '../../stores/settings-store'
import { useModels } from '../../hooks/use-models'
import { useAuthStore } from '../../stores/auth-store'
import { useMusic } from '../../hooks/use-music'
import { Select } from '../ui/select'
import { Label, TextArea, PrimaryButton, ErrorText, PillGroup } from '../ui/shared'
import { GenerationView } from '../ui/generation-view'
import { Spinner } from '../ui/spinner'
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

  // Reset model-dependent controls whenever the selected model changes so the
  // values stay within the new model's supported ranges.
  useEffect(() => {
    setDuration(caps.defaultDuration)
    setInstrumental(false)
    setLyricsOptimizer(false)
    setVoice(caps.defaultVoice ?? caps.voices[0] ?? '')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [model])

  const { queue, isQueueing, status, audioUrl, error, suggestedPrompt, issues, reset, cancel, elapsedMs } = useMusic()
  const isProcessing = status === 'queued' || status === 'processing'

  const minPromptLength = caps.minPromptLength
  const promptLen = prompt.trim().length
  const promptTooShort = promptLen > 0 && promptLen < minPromptLength

  // When the optimizer auto-generates lyrics, the API rejects a manual
  // `lyrics_prompt`, so we hide/disable the lyrics field while it's on.
  const optimizerActive = caps.supportsLyricsOptimizer && lyricsOptimizer
  const lyricsMissing = caps.lyricsRequired && !optimizerActive && !lyrics.trim()

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

    const req: MusicQueueRequest = { model, prompt: prompt.trim() }

    if (optimizerActive) {
      req.lyrics_optimizer = true
    } else if (caps.supportsLyrics && lyrics.trim()) {
      req.lyrics_prompt = lyrics.trim()
    }
    if (caps.supportsDuration) req.duration_seconds = clamp(duration, caps.minDuration, caps.maxDuration)
    if (caps.supportsForceInstrumental && instrumental) req.force_instrumental = true
    if (caps.supportsVoice && voice) req.voice = voice

    queue(req)
  }

  const useSuggestedPrompt = () => {
    if (!suggestedPrompt) return
    setPrompt(suggestedPrompt)
    reset()
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
            <div className="flex justify-between text-[11px] text-white/30 mt-1">
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
        disabled={!prompt.trim() || promptTooShort || lyricsMissing || !apiKey || isQueueing || isProcessing}
        loading={isQueueing || isProcessing}
        size="lg"
      >
        {isProcessing ? (status === 'queued' ? 'Queued…' : 'Generating…') : 'Generate Music'}
      </PrimaryButton>
      {error && (
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between gap-2">
            <ErrorText>{error}</ErrorText>
            <button onClick={reset} className="text-[13px] text-white/55 hover:text-white underline underline-offset-2 shrink-0 transition-colors">Reset</button>
          </div>
          {issues && issues.length > 0 && (
            <ul className="text-[12.5px] text-amber-300/70 leading-relaxed list-disc pl-4">
              {issues.map((issue, i) => <li key={i}>{issue}</li>)}
            </ul>
          )}
          {suggestedPrompt && (
            <div className="rounded-lg border border-white/[0.08] bg-white/[0.02] p-3">
              <p className="text-[11px] uppercase tracking-[0.08em] text-white/40 font-semibold mb-1">Suggested prompt</p>
              <p className="text-[13.5px] text-white/70 leading-relaxed">{suggestedPrompt}</p>
              <button
                onClick={useSuggestedPrompt}
                className="mt-2 text-[12.5px] font-medium text-[var(--color-accent)] hover:underline underline-offset-2"
              >
                Use this prompt
              </button>
            </div>
          )}
        </div>
      )}
    </>
  )

  const output = (
    <div className="flex flex-col h-full">
        {audioUrl ? (
          <div className="animate-fade-in flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <Label>Output</Label>
              <a href={audioUrl} download="venice-music.mp3" target="_blank" rel="noopener noreferrer" className="text-[14px] text-white/20 hover:text-white/40 transition-colors flex items-center gap-1.5">
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3" /></svg>
                Download
              </a>
            </div>
            <audio controls src={audioUrl} className="w-full" />
            <div className="bg-white/[0.02] border border-white/[0.04] rounded-lg p-4">
              <p className="text-[15px] text-white/30 leading-relaxed">{prompt}</p>
              {lyrics && <p className="text-[14px] text-white/15 mt-2 italic">{lyrics}</p>}
            </div>
            <button onClick={reset} className="self-start text-[14px] text-white/15 hover:text-white/35 transition-colors">Generate another</button>
          </div>
        ) : (
          <div className="flex items-center justify-center flex-1 text-white/30 text-[15px]">
            {isProcessing ? (
              <div className="flex flex-col items-center gap-3" role="status" aria-live="polite">
                <Spinner size="lg" />
                <span className="text-white/55 text-center">
                  {status === 'queued' ? 'Queued — waiting for a slot' : 'Composing your track'}
                  {elapsedMs > 0 && (
                    <span className="block text-[12px] text-white/30 font-mono mt-1">
                      {formatElapsedMusic(elapsedMs)} · typically 20s–90s
                    </span>
                  )}
                </span>
                <button
                  onClick={cancel}
                  className="text-[13px] text-white/35 hover:text-white/65 underline underline-offset-2 transition-colors"
                >
                  Cancel
                </button>
              </div>
            ) : !prompt ? (
              <div className="max-w-md w-full flex flex-col gap-2">
                <div className="text-[12px] uppercase tracking-[0.08em] text-white/35 font-medium text-left">Try one of these</div>
                {MUSIC_EXAMPLES.map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setPrompt(p)}
                    className="text-left px-3 py-2.5 rounded-lg border border-white/[0.06] bg-white/[0.02] hover:border-white/[0.14] hover:bg-white/[0.04] transition-all text-[14px] text-white/65 focus-visible:outline focus-visible:outline-1 focus-visible:outline-white/40"
                  >
                    {p}
                  </button>
                ))}
              </div>
            ) : (
              <span>Press Generate to create your track</span>
            )}
          </div>
        )}
    </div>
  )

  return <GenerationView controls={controls} output={output} />
}

const MUSIC_EXAMPLES = [
  'Lo-fi hip-hop beat with vinyl crackle and rain — 80 bpm, mellow',
  'Cinematic orchestral build — slow strings rising into triumphant brass',
  'Synthwave with retro arpeggios, warm pads, gated reverb drums — 105 bpm',
  'Acoustic folk fingerpicking, soft female vocals, intimate room sound',
]

function formatElapsedMusic(ms: number): string {
  const s = Math.floor(ms / 1000)
  const m = Math.floor(s / 60)
  return m > 0 ? `${m}m ${s % 60}s` : `${s}s`
}

function Toggle({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center justify-between">
      <Label>{label}</Label>
      <button
        onClick={() => onChange(!value)}
        aria-pressed={value}
        aria-label={label}
        className={cn('w-9 h-5 rounded-full transition-colors relative', value ? 'bg-[var(--color-accent)]' : 'bg-white/[0.1]')}
      >
        <div className={cn('absolute top-[2px] w-[16px] h-[16px] rounded-full bg-white transition-all', value ? 'left-[20px]' : 'left-[2px]')} />
      </button>
    </div>
  )
}
