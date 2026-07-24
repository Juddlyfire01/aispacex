// Shared register pack for intel reports + compose draft style transfer.
// Style sheet (summary + sections + devices). No few-shot anchors.

export type RegisterMode = 'none' | 'you' | 'other' | 'custom' | 'upload'

export interface RegisterSections {
  cadence: string
  diction: string
  stance: string
  rhetoric: string
  texture: string
  /** How the same voice flexes across post / thread / article — never length quotas. */
  formatFlex: string
  constraints: string
}

export interface RegisterPack {
  summary: string
  sections: RegisterSections
  devices: string[]
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

export const EMPTY_SECTIONS: RegisterSections = {
  cadence: '',
  diction: '',
  stance: '',
  rhetoric: '',
  texture: '',
  formatFlex: '',
  constraints: '',
}

const SECTION_KEYS: (keyof RegisterSections)[] = [
  'cadence',
  'diction',
  'stance',
  'rhetoric',
  'texture',
  'formatFlex',
  'constraints',
]

export function emptyRegisterPack(): RegisterPack {
  return { summary: '', sections: { ...EMPTY_SECTIONS }, devices: [] }
}

function normalizeSections(raw: unknown): RegisterSections {
  const o = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}
  const out = { ...EMPTY_SECTIONS }
  for (const key of SECTION_KEYS) {
    const v = o[key]
    out[key] = typeof v === 'string' ? v : ''
  }
  return out
}

function sectionsHaveContent(sections: RegisterSections): boolean {
  return SECTION_KEYS.some((k) => sections[k].trim().length > 0)
}

export function normalizeRegisterPack(raw: unknown): RegisterPack | null {
  if (!raw || typeof raw !== 'object') return null
  const o = raw as Record<string, unknown>
  const summaryFromSummary = typeof o.summary === 'string' ? o.summary : ''
  const summaryFromDescription = typeof o.description === 'string' ? o.description : ''
  const summary = summaryFromSummary.trim() ? summaryFromSummary : summaryFromDescription
  const devices = Array.isArray(o.devices)
    ? o.devices.filter((d): d is string => typeof d === 'string' && d.trim().length > 0)
    : []
  const sections = normalizeSections(o.sections)
  // Ignore legacy fewShotExamples entirely (repetition risk).
  if (!summary.trim() && devices.length === 0 && !sectionsHaveContent(sections)) return null
  return { summary, sections, devices }
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
  if (!pack) {
    throw new Error(
      'Upload must be a register pack with summary, sections, and/or devices',
    )
  }
  return pack
}

export function packFromReportRegister(register: {
  summary?: string
  description?: string
  devices: string[]
  sections?: Partial<RegisterSections> | RegisterSections
}): RegisterPack {
  const summary =
    (typeof register.summary === 'string' && register.summary.trim()
      ? register.summary
      : typeof register.description === 'string'
        ? register.description
        : '') ?? ''
  return {
    summary,
    sections: normalizeSections(register.sections),
    devices: Array.isArray(register.devices) ? register.devices : [],
  }
}

export function isRegisterPackEmpty(pack: RegisterPack | null | undefined): boolean {
  if (!pack) return true
  return (
    !pack.summary.trim() &&
    pack.devices.length === 0 &&
    !sectionsHaveContent(pack.sections)
  )
}

export function formatRegisterInject(pack: RegisterPack, opts?: { customPrompt?: string }): string {
  const lines: string[] = [
    'REGISTER - VOICE CONSTRAINT (identity of voice, NOT content, NOT length quotas):',
    'Match this voice abstractly: rhythm habits, diction class, stance, and rhetorical moves. Invent fresh wording for the current task.',
    'HARD LIMITS:',
    '- Content, facts, and receipts come ONLY from the current research/brief - never invent exhibits to "sound like" the register.',
    '- Do NOT treat any character/word/sentence averages in the sheet as hard caps. Those describe the source corpus (mostly short posts); they must NOT force tweet-length prose into threads or articles.',
    '- FORMAT WINS LENGTH: post → compact; thread → short beats that still cohere across posts; article/long-form → full paragraphs, transitions, and article structure. Keep the SAME voice (diction/stance/rhetoric) while scaling sentence length and paragraphing to the format.',
    '- Metric density is a style trait, not a mandate: use quantitative texture only when the current material supports it.',
    '- Topical nouns in the sheet (products, causes, slogans) are NOT required content - reuse only the move (contrast, certainty, list), never the exhibit.',
    '- Register describes voice (diction/stance/rhetoric), not engagement tactics - do not add hooks, forced binaries, or reply-bait endings unless the sheet itself does that.',
    'PRECEDENCE: a live instruction in this turn (e.g. "be totally casual", "make it novel", "no metrics tables") OVERRIDES the register\'s default posture. Honor the current ask first, then apply the register within that ask.',
  ]
  if (pack.summary.trim()) {
    lines.push(`Summary: ${pack.summary.trim()}`)
  }
  for (const key of SECTION_KEYS) {
    const body = pack.sections[key]?.trim()
    if (!body) continue
    const label =
      key === 'formatFlex' ? 'FormatFlex' : key.charAt(0).toUpperCase() + key.slice(1)
    lines.push(`${label}: ${body}`)
  }
  if (pack.devices.length > 0) {
    lines.push(`Devices (abstract rhetorical moves - not content topics): ${pack.devices.join('; ')}`)
  }
  const custom = opts?.customPrompt?.trim()
  if (custom) {
    lines.push('Additional register instructions:')
    lines.push(custom)
  }
  lines.push(
    [
      'Adherence checklist before finalizing copy:',
      '- Voice (diction/stance/rhetoric) matches the sheet; wording and facts are wholly your own from the current brief.',
      '- Length and paragraphing match the REQUESTED FORMAT, not the corpus averages in Cadence.',
      '- Unit style ($, %, K/M, ~approx) matches the sheet ONLY where the current material is quantitative.',
      '- A live "casual / novel / lighter" instruction was honored - that is success, not drift.',
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
