import type { VeniceModel } from '../types/venice'

// Capabilities derived at runtime from a music model's `model_spec`, so the
// controls the UI shows always match what the selected model actually accepts.
// This replaces the previous hardcoded per-model config map, which drifted out
// of sync with the live model IDs (e.g. `minimax-music-v2` vs `minimax-music-2.0`)
// and caused unsupported fields to be sent / required fields to be omitted.
export interface MusicCapabilities {
  supportsLyrics: boolean
  lyricsRequired: boolean
  supportsForceInstrumental: boolean
  supportsLyricsOptimizer: boolean
  supportsDuration: boolean
  supportsVoice: boolean
  supportsLanguageCode: boolean
  supportsSpeed: boolean
  minDuration: number
  maxDuration: number
  defaultDuration: number
  durationOptions?: number[]
  minSpeed: number
  maxSpeed: number
  defaultSpeed: number
  voices: string[]
  defaultVoice?: string
  minPromptLength: number
  promptCharacterLimit?: number
  lyricsCharacterLimit?: number
}

export function getMusicCapabilities(model: VeniceModel | undefined): MusicCapabilities {
  const s = model?.model_spec ?? {}
  const supportsDuration =
    s.max_duration != null || (s.duration_options?.length ?? 0) > 0
  const defaultDuration = s.default_duration ?? s.min_duration ?? 30

  return {
    supportsLyrics: s.supports_lyrics ?? false,
    lyricsRequired: s.lyrics_required ?? false,
    supportsForceInstrumental: s.supports_force_instrumental ?? false,
    supportsLyricsOptimizer: s.supports_lyrics_optimizer ?? false,
    supportsDuration,
    supportsVoice: (s.voices?.length ?? 0) > 0,
    supportsLanguageCode: s.supports_language_code ?? false,
    supportsSpeed: s.supports_speed ?? false,
    minDuration: s.min_duration ?? 5,
    maxDuration: s.max_duration ?? 120,
    defaultDuration,
    durationOptions: s.duration_options,
    minSpeed: s.min_speed ?? 0.7,
    maxSpeed: s.max_speed ?? 1.2,
    defaultSpeed: s.default_speed ?? 1,
    voices: s.voices ?? [],
    defaultVoice: s.default_voice,
    minPromptLength: s.min_prompt_length ?? 1,
    promptCharacterLimit: s.prompt_character_limit,
    lyricsCharacterLimit: s.lyrics_character_limit,
  }
}
