// Shared register pack for intel reports + compose draft style transfer.
// See docs/superpowers/specs/2026-07-10-compose-register-design.md

export type RegisterMode = 'none' | 'you' | 'other' | 'custom' | 'upload'

export interface RegisterFewShot {
  label: string
  postId?: string
  text: string
}

export interface RegisterPack {
  description: string
  devices: string[]
  fewShotExamples: RegisterFewShot[]
}

/** Persisted on PostDraft — selection + optional local override. */
export interface DraftRegister {
  mode: RegisterMode
  otherUsername?: string
  /** Edits / custom / upload. null|undefined = use live report pack for you/other. */
  localPack?: RegisterPack | null
  /** Freeform instructions when mode is custom. */
  customPrompt?: string
}

/** App-wide default inherited by new drafts. */
export interface RegisterDefault {
  mode: RegisterMode
  otherUsername?: string
}

export const DEFAULT_REGISTER_DEFAULT: RegisterDefault = { mode: 'you' }

export function emptyRegisterPack(): RegisterPack {
  return { description: '', devices: [], fewShotExamples: [] }
}

export function normalizeRegisterPack(raw: unknown): RegisterPack | null {
  if (!raw || typeof raw !== 'object') return null
  const o = raw as Record<string, unknown>
  const description = typeof o.description === 'string' ? o.description : ''
  const devices = Array.isArray(o.devices)
    ? o.devices.filter((d): d is string => typeof d === 'string' && d.trim().length > 0)
    : []
  const fewShotExamples: RegisterFewShot[] = []
  if (Array.isArray(o.fewShotExamples)) {
    for (const item of o.fewShotExamples) {
      if (!item || typeof item !== 'object') continue
      const f = item as Record<string, unknown>
      const text = typeof f.text === 'string' ? f.text.trim() : ''
      if (!text) continue
      const label = typeof f.label === 'string' && f.label.trim() ? f.label.trim() : 'example'
      const postId = typeof f.postId === 'string' && f.postId.trim() ? f.postId.trim() : undefined
      fewShotExamples.push({ label, postId, text })
    }
  }
  if (!description && devices.length === 0 && fewShotExamples.length === 0) return null
  return { description, devices, fewShotExamples }
}

/** Parse uploaded JSON: either a bare RegisterPack or `{ register: RegisterPack }`. */
export function parseRegisterUpload(text: string): RegisterPack {
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    throw new Error('Upload is not valid JSON')
  }
  if (parsed && typeof parsed === 'object' && 'register' in (parsed as object)) {
    const pack = normalizeRegisterPack((parsed as { register: unknown }).register)
    if (!pack) throw new Error('Upload register pack is empty or invalid')
    return pack
  }
  const pack = normalizeRegisterPack(parsed)
  if (!pack) throw new Error('Upload must be a register pack with description, devices, and/or fewShotExamples')
  return pack
}

export function packFromReportRegister(register: {
  description: string
  devices: string[]
  fewShotExamples?: RegisterFewShot[]
}): RegisterPack {
  return {
    description: register.description ?? '',
    devices: Array.isArray(register.devices) ? register.devices : [],
    fewShotExamples: Array.isArray(register.fewShotExamples) ? register.fewShotExamples : [],
  }
}

export function isRegisterPackEmpty(pack: RegisterPack | null | undefined): boolean {
  if (!pack) return true
  return !pack.description.trim() && pack.devices.length === 0 && pack.fewShotExamples.length === 0
}

/** Cap anchor excerpts in the inject: enough for cadence, too short to lift wholesale. */
export const REGISTER_ANCHOR_MAX_CHARS = 220

/** Trim an anchor to a cadence sample without dangling a full reusable post. */
export function clampAnchorText(text: string, max = REGISTER_ANCHOR_MAX_CHARS): string {
  const t = text.trim()
  if (t.length <= max) return t
  return `${t.slice(0, max).trimEnd()}…`
}

export function formatRegisterInject(pack: RegisterPack, opts?: { customPrompt?: string }): string {
  const lines: string[] = [
    'REGISTER — VOICE CONSTRAINT (applies to cadence and diction, NOT content):',
    'Match this voice: sentence length, rhythm, punctuation habits, diction, and rhetorical moves from the description, devices, and anchors below. If the anchors are terse, stay terse; if they favor a signature pivot ("but here is the tension", rankings, NFA distance), that move is available to you.',
    'HARD LIMITS on the anchors (this is style transfer, not content reuse):',
    '- The anchors are RHYTHM SAMPLES ONLY. Never reuse their facts, exhibits, examples, post ids, permalinks, phrasings, or sentence structure. Lifting anchor wording or re-listing anchor exhibits is a FAILED draft.',
    '- Content, facts, and receipts come ONLY from the current research/brief — never from the anchors. If the anchor and the task share a topic, treat the anchor as if the words were redacted and only the beat pattern remained.',
    '- Metric density is a style trait, not a mandate: reflect the anchors\' quantitative texture only when the current material actually supports it. Do not manufacture or copy metrics to "sound like" the register.',
    'PRECEDENCE: a live instruction in this turn (e.g. "be totally casual", "make it novel", "no metrics tables") OVERRIDES the register\'s default posture. Honor the current ask first, then apply the register within that ask. Following a live loosening instruction is correct, not a register failure.',
  ]
  if (pack.description.trim()) {
    lines.push(`Description (voice, not content): ${pack.description.trim()}`)
  }
  if (pack.devices.length > 0) {
    lines.push(`Devices (rhetorical moves available): ${pack.devices.join('; ')}`)
  }
  if (pack.fewShotExamples.length > 0) {
    lines.push(
      'Cadence anchors (rhythm/texture samples — do NOT copy wording, facts, or exhibits):',
    )
    for (const ex of pack.fewShotExamples.slice(0, 12)) {
      lines.push(`--- ${ex.label} ---`)
      lines.push(clampAnchorText(ex.text))
    }
  }
  const custom = opts?.customPrompt?.trim()
  if (custom) {
    lines.push('Additional register instructions:')
    lines.push(custom)
  }
  lines.push(
    [
      'Adherence checklist before finalizing copy:',
      '- Cadence matches the anchors (sentence length / line breaks), but wording and facts are wholly your own from the current brief.',
      '- No anchor phrasing, exhibits, or post ids reused verbatim; no re-listing the last edition\'s spine.',
      '- Unit style ($, %, K/M, ~approx) matches the anchors ONLY where the current material is quantitative.',
      '- A live "casual / novel / lighter" instruction was honored — that is success, not drift.',
      '- No fluff openers, no "As an AI", no hashtag spam, no corporate enthusiasm unless the register itself does that.',
    ].join('\n'),
  )
  return lines.join('\n')
}

export interface ResolveRegisterInput {
  draft: DraftRegister | undefined
  /** Live pack for mode you — null if no self report. */
  youPack: RegisterPack | null
  /** Live pack for mode other — null if no report for otherUsername. */
  otherPack: RegisterPack | null
}

export interface ResolveRegisterResult {
  inject: string | null
  pack: RegisterPack | null
  unavailableReason?: string
}

export function resolveRegisterPack(input: ResolveRegisterInput): ResolveRegisterResult {
  const draft = input.draft
  if (!draft || draft.mode === 'none') {
    return { inject: null, pack: null }
  }

  if (draft.mode === 'custom') {
    const pack = draft.localPack ?? emptyRegisterPack()
    const custom = draft.customPrompt?.trim() ?? ''
    if (isRegisterPackEmpty(pack) && !custom) {
      return { inject: null, pack: null, unavailableReason: 'Custom register is empty' }
    }
    const inject = formatRegisterInject(pack, { customPrompt: custom || undefined })
    return { inject, pack }
  }

  if (draft.mode === 'upload') {
    const pack = draft.localPack
    if (!pack || isRegisterPackEmpty(pack)) {
      return { inject: null, pack: null, unavailableReason: 'No uploaded register pack' }
    }
    return { inject: formatRegisterInject(pack), pack }
  }

  if (draft.mode === 'you') {
    const pack = draft.localPack ?? input.youPack
    if (!pack || isRegisterPackEmpty(pack)) {
      return {
        inject: null,
        pack: null,
        unavailableReason: 'Generate a report for your account first',
      }
    }
    return { inject: formatRegisterInject(pack), pack }
  }

  if (draft.mode === 'other') {
    const pack = draft.localPack ?? input.otherPack
    if (!pack || isRegisterPackEmpty(pack)) {
      return {
        inject: null,
        pack: null,
        unavailableReason: draft.otherUsername
          ? `Generate a report for @${draft.otherUsername.replace(/^@/, '')} first`
          : 'Pick a target with a report',
      }
    }
    return { inject: formatRegisterInject(pack), pack }
  }

  return { inject: null, pack: null }
}

export function draftRegisterFromDefault(def: RegisterDefault): DraftRegister {
  return {
    mode: def.mode,
    otherUsername: def.otherUsername,
  }
}
