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

export function formatRegisterInject(pack: RegisterPack, opts?: { customPrompt?: string }): string {
  const lines: string[] = [
    'REGISTER — HARD STYLE CONSTRAINT (non-negotiable for all publishable copy):',
    'Write as this voice. Mimic cadence, diction, metric density, punctuation habits, and rhetorical moves from the description, devices, and few-shot anchors below.',
    'Do NOT default to a generic marketing / AI-assistant voice. If the anchors are terse, stay terse. If they stack metrics, stack metrics. If they use a signature pivot ("but here is the tension", rankings, NFA distance), reuse that move.',
  ]
  if (pack.description.trim()) {
    lines.push(`Description: ${pack.description.trim()}`)
  }
  if (pack.devices.length > 0) {
    lines.push(`Devices: ${pack.devices.join('; ')}`)
  }
  if (pack.fewShotExamples.length > 0) {
    lines.push(
      'Few-shot style anchors (match rhythm and texture — do not copy verbatim unless asked):',
    )
    for (const ex of pack.fewShotExamples.slice(0, 12)) {
      const id = ex.postId ? ` [post:${ex.postId}]` : ''
      lines.push(`--- ${ex.label}${id} ---`)
      lines.push(ex.text.trim())
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
      '- Sentence length / line breaks match the anchors (not essay-smooth unless anchors are).',
      '- Number density and unit style match ($, %, K/M, ~approx) when the topic is quantitative.',
      '- Signature devices and pivots appear when they fit; inventing a softer tone is a failure.',
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
