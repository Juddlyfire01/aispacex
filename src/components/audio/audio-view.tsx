import { useState, useRef, useMemo, useEffect } from 'react'
import { useSettingsStore } from '../../stores/settings-store'
import { useModels } from '../../hooks/use-models'
import { useAuthStore } from '../../stores/auth-store'
import { useTTS, useTranscription } from '../../hooks/use-audio'
import { useMediaGallery } from '../../hooks/use-media-gallery'
import { Select } from '../ui/select'
import { Label, TextArea, PrimaryButton, ErrorText, EmptyState } from '../ui/shared'
import { GenerationView } from '../ui/generation-view'
import { LoadingState } from '../ui/spinner'
import { SegmentedControl } from '../ui/sub-tabs'
import { MediaGallery } from '../media/media-gallery'
import { MAX_CONCURRENT_MEDIA_JOBS } from '../../lib/media-concurrency'
import { toast } from '../../stores/toast-store'

const AUDIO_EXAMPLES = [
  'Welcome to AiSpaceX. The future of voice is here, and it speaks every language.',
  'In a quiet town nestled between two mountains, a small library held a very old book.',
  'Did you know? A single octopus has nine brains — one central, plus one in each arm.',
]

const KOKORO_LANG_MAP: Record<string, { flag: string; gender: string; lang: string }> = {
  af: { flag: '🇺🇸', gender: 'F', lang: 'American English (Female)' },
  am: { flag: '🇺🇸', gender: 'M', lang: 'American English (Male)' },
  bf: { flag: '🇬🇧', gender: 'F', lang: 'British English (Female)' },
  bm: { flag: '🇬🇧', gender: 'M', lang: 'British English (Male)' },
  zf: { flag: '🇨🇳', gender: 'F', lang: 'Mandarin (Female)' },
  zm: { flag: '🇨🇳', gender: 'M', lang: 'Mandarin (Male)' },
  jf: { flag: '🇯🇵', gender: 'F', lang: 'Japanese (Female)' },
  jm: { flag: '🇯🇵', gender: 'M', lang: 'Japanese (Male)' },
  ff: { flag: '🇫🇷', gender: 'F', lang: 'French (Female)' },
  hf: { flag: '🇮🇳', gender: 'F', lang: 'Hindi (Female)' },
  hm: { flag: '🇮🇳', gender: 'M', lang: 'Hindi (Male)' },
  if: { flag: '🇮🇹', gender: 'F', lang: 'Italian (Female)' },
  im: { flag: '🇮🇹', gender: 'M', lang: 'Italian (Male)' },
  pf: { flag: '🇧🇷', gender: 'F', lang: 'Portuguese (Female)' },
  pm: { flag: '🇧🇷', gender: 'M', lang: 'Portuguese (Male)' },
  ef: { flag: '🇪🇸', gender: 'F', lang: 'Spanish (Female)' },
  em: { flag: '🇪🇸', gender: 'M', lang: 'Spanish (Male)' },
}

const KOKORO_VOICE_RE = /^[a-z]{2}_/
const isKokoroVoice = (v: string) => KOKORO_VOICE_RE.test(v)

function formatVoiceLabel(v: string): string {
  if (isKokoroVoice(v)) {
    const prefix = v.slice(0, 2)
    const name = v.slice(3)
    const meta = KOKORO_LANG_MAP[prefix]
    return meta ? `${meta.flag} ${meta.gender} · ${name} (${meta.lang})` : v
  }
  return v
}

const FORMATS = ['mp3', 'opus', 'aac', 'flac', 'wav'] as const

export function AudioView() {
  const apiKey = useAuthStore((s) => s.apiKey)
  const selectedModel = useSettingsStore((s) => s.selectedModels.audio)
  const setSelectedModel = useSettingsStore((s) => s.setSelectedModel)
  const { data: models, defaultModelId, isLoading: modelsLoading } = useModels('tts')
  const model = selectedModel || defaultModelId

  const [tab, setTab] = useState<'tts' | 'transcribe'>('tts')
  const [text, setText] = useState('')
  const [voice, setVoice] = useState('')
  const [speed, setSpeed] = useState(1)
  const [format, setFormat] = useState<string>('mp3')
  const [file, setFile] = useState<File | null>(null)
  const [transcript, setTranscript] = useState('')
  const [pendingTts, setPendingTts] = useState(0)
  const fileRef = useRef<HTMLInputElement>(null)

  const gallery = useMediaGallery('audio')
  const tts = useTTS()
  const transcription = useTranscription()
  const atCapacity = pendingTts >= MAX_CONCURRENT_MEDIA_JOBS

  const modelVoices = useMemo(() => {
    const m = models?.find((x) => x.id === model)
    return m?.model_spec?.voices ?? []
  }, [models, model])

  const voiceOptions = useMemo(
    () => modelVoices.map((v) => ({ value: v, label: formatVoiceLabel(v) })),
    [modelVoices],
  )

  useEffect(() => {
    if (modelVoices.length === 0) return
    if (!voice || !modelVoices.includes(voice)) {
      setVoice(modelVoices[0])
    }
  }, [modelVoices, voice])

  const formatOptions = FORMATS.map((f) => ({ value: f, label: f.toUpperCase() }))

  const modelOptions = useMemo(
    () => models?.map((m) => ({ value: m.id, label: m.model_spec?.name || m.id })) ?? [],
    [models],
  )

  const handleTTS = () => {
    if (!text.trim()) return
    if (atCapacity) {
      toast.error('Limit reached', `You can run up to ${MAX_CONCURRENT_MEDIA_JOBS} speech jobs at once.`)
      return
    }
    const trimmed = text.trim()
    const responseFormat = format as typeof FORMATS[number]
    setPendingTts((n) => n + 1)
    tts.mutate(
      { model, input: trimmed, voice, speed, response_format: responseFormat },
      {
        onSuccess: (blob) => {
          void gallery.add({
            kind: 'audio',
            blob,
            mimeType: blob.type || `audio/${responseFormat === 'mp3' ? 'mpeg' : responseFormat}`,
            prompt: trimmed,
            model,
            extras: { voice, speed, format: responseFormat },
          })
        },
        onError: (err) => toast.fromError(err, 'TTS failed'),
        onSettled: () => setPendingTts((n) => Math.max(0, n - 1)),
      },
    )
  }

  const controls = (
    <>
      <SegmentedControl
        options={[['tts', 'Text to Speech'], ['transcribe', 'Transcribe']] as const}
        value={tab}
        onChange={setTab}
      />

      {tab === 'tts' ? (
        <>
          <div>
            <Label>Model</Label>
            <Select
              value={model}
              onChange={(v) => setSelectedModel('audio', v)}
              options={modelOptions}
              searchable
              placeholder={modelsLoading ? 'Loading...' : 'Select model...'}
            />
          </div>
          <div>
            <Label hint={`${text.length}/4096`}>Text</Label>
            <TextArea value={text} onChange={setText} placeholder="Enter text to convert to speech…" rows={5} />
          </div>
          <div><Label>Voice</Label><Select value={voice} onChange={setVoice} options={voiceOptions} searchable /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Format</Label><Select value={format} onChange={setFormat} options={formatOptions} /></div>
            <div>
              <Label hint={`${speed}×`}>Speed</Label>
              <input type="range" min={0.25} max={4} step={0.25} value={speed} onChange={(e) => setSpeed(Number(e.target.value))} className="w-full" />
            </div>
          </div>
          <PrimaryButton
            onClick={handleTTS}
            disabled={!text.trim() || !voice || !apiKey || atCapacity}
            loading={pendingTts > 0}
            size="lg"
          >
            {pendingTts > 0 ? `Generate another (${pendingTts}/${MAX_CONCURRENT_MEDIA_JOBS})` : 'Generate Speech'}
          </PrimaryButton>
          {tts.error && <ErrorText>{tts.error.message}</ErrorText>}
        </>
      ) : (
        <>
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="w-full border border-dashed border-white/[0.1] hover:border-white/[0.22] hover:bg-white/[0.02] rounded-xl p-8 text-center transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--color-accent)]"
          >
            <input ref={fileRef} type="file" accept="audio/*" className="hidden" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" className="mx-auto mb-2 text-white/40"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M17 8l-5-5-5 5M12 3v12" /></svg>
            <p className="text-[14px] text-white/65">{file ? file.name : 'Click to select audio file'}</p>
          </button>
          <PrimaryButton onClick={() => { if (file) transcription.mutate(file, { onSuccess: (d) => setTranscript(d.text), onError: (err) => toast.fromError(err, 'Transcription failed') }) }} disabled={!file || !apiKey} loading={transcription.isPending} size="lg">
            Transcribe
          </PrimaryButton>
          {transcription.error && <ErrorText>{transcription.error.message}</ErrorText>}
        </>
      )}
    </>
  )

  const output = tab === 'tts' ? (
    <MediaGallery
      kind="audio"
      items={gallery.items}
      pendingCount={pendingTts}
      onRemove={gallery.remove}
      onClearAll={gallery.clearAll}
      onUsePrompt={(p) => setText(p)}
      empty={
        <div className="flex items-center justify-center h-full">
          {pendingTts > 0 ? (
            <LoadingState label="Generating…" size="lg" />
          ) : !text ? (
            <div className="max-w-md w-full flex flex-col gap-2">
              <div className="text-[12px] uppercase tracking-[0.08em] text-white/35 font-medium text-left">Try one of these</div>
              {AUDIO_EXAMPLES.map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setText(p)}
                  className="text-left px-3 py-2.5 rounded-lg border border-white/[0.06] bg-white/[0.02] hover:border-white/[0.14] hover:bg-white/[0.04] transition-all text-[14px] text-white/65 focus-visible:outline focus-visible:outline-1 focus-visible:outline-white/40"
                >
                  {p}
                </button>
              ))}
            </div>
          ) : (
            <EmptyState>Press Generate to synthesize speech</EmptyState>
          )}
        </div>
      }
    />
  ) : (
    <div className="flex flex-col min-h-full">
      {transcript ? (
        <div className="flex flex-col gap-3 animate-fade-in">
          <Label>Transcript</Label>
          <div className="bg-[var(--color-bg-raised)] border border-[var(--color-border-faint)] rounded-xl p-6 text-[15px] text-[var(--color-text-primary)] whitespace-pre-wrap leading-relaxed">
            {transcript}
          </div>
        </div>
      ) : (
        <EmptyState>Transcript appears here</EmptyState>
      )}
    </div>
  )

  return <GenerationView controls={controls} output={output} />
}
