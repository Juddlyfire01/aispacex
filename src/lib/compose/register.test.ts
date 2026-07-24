import { describe, it, expect } from 'vitest'
import {
  emptyRegisterPack,
  formatRegisterInject,
  normalizeRegisterPack,
  parseRegisterUpload,
  resolveRegisterPack,
  draftRegisterFromDefault,
  DEFAULT_REGISTER_DEFAULT,
  EMPTY_SECTIONS,
} from './register'

const samplePack = {
  summary: 'Terse metric voice',
  sections: {
    ...EMPTY_SECTIONS,
    cadence: 'Short punches',
    rhetoric: 'Rankings and tension pivots',
  },
  devices: ['ranking', 'tension'],
}

describe('normalizeRegisterPack', () => {
  it('returns null for empty', () => {
    expect(normalizeRegisterPack({})).toBeNull()
    expect(
      normalizeRegisterPack({
        summary: '',
        devices: [],
        sections: { ...EMPTY_SECTIONS },
      }),
    ).toBeNull()
  })

  it('migrates legacy description and drops few-shots', () => {
    const pack = normalizeRegisterPack({
      description: 'Terse',
      devices: ['metrics', ''],
      fewShotExamples: [{ label: 'tension', postId: '1', text: 'but here is the tension' }],
    })
    expect(pack).toEqual({
      summary: 'Terse',
      devices: ['metrics'],
      sections: { ...EMPTY_SECTIONS },
    })
  })

  it('keeps summary and sections', () => {
    const pack = normalizeRegisterPack(samplePack)
    expect(pack?.summary).toBe('Terse metric voice')
    expect(pack?.sections.cadence).toBe('Short punches')
    expect(pack?.devices).toEqual(['ranking', 'tension'])
  })
})

describe('parseRegisterUpload', () => {
  it('parses bare pack', () => {
    const pack = parseRegisterUpload(JSON.stringify({ summary: 'x', devices: ['a'] }))
    expect(pack.summary).toBe('x')
  })

  it('parses wrapped register and legacy description', () => {
    const pack = parseRegisterUpload(JSON.stringify({ register: { description: 'y', devices: [] } }))
    expect(pack.summary).toBe('y')
  })

  it('throws on invalid json', () => {
    expect(() => parseRegisterUpload('not json')).toThrow(/valid JSON/)
  })
})

describe('formatRegisterInject', () => {
  it('includes summary sections devices and custom — no few-shots', () => {
    const text = formatRegisterInject(samplePack, { customPrompt: 'keep under 280' })
    expect(text).toMatch(/REGISTER — VOICE CONSTRAINT/)
    expect(text).toMatch(/Terse metric voice/)
    expect(text).toMatch(/Cadence: Short punches/)
    expect(text).toMatch(/Rhetoric: Rankings/)
    expect(text).toMatch(/ranking/)
    expect(text).toMatch(/keep under 280/)
    expect(text).toMatch(/Adherence checklist/)
    expect(text).toMatch(/FORMAT WINS LENGTH/)
    expect(text).toMatch(/hard caps/)
    expect(text).not.toMatch(/few.?shot/i)
    expect(text).not.toMatch(/RHYTHM SAMPLES/)
  })

  it('honors live-ask precedence', () => {
    const text = formatRegisterInject(samplePack)
    expect(text).toMatch(/NOT content/)
    expect(text).toMatch(/PRECEDENCE/)
    expect(text).toMatch(/not engagement tactics/)
  })
})

describe('resolveRegisterPack', () => {
  const youPack = {
    summary: 'me voice',
    devices: ['short'],
    sections: { ...EMPTY_SECTIONS, cadence: 'clipped' },
  }
  const otherPack = {
    summary: 'aixbt',
    devices: ['metrics'],
    sections: { ...EMPTY_SECTIONS, texture: 'dense numbers' },
  }

  it('none returns null inject', () => {
    expect(
      resolveRegisterPack({
        draft: { mode: 'none' },
        youPack,
        otherPack,
      }).inject,
    ).toBeNull()
  })

  it('you uses live pack', () => {
    const r = resolveRegisterPack({
      draft: { mode: 'you' },
      youPack,
      otherPack,
    })
    expect(r.inject).toMatch(/me voice/)
    expect(r.inject).toMatch(/clipped/)
  })

  it('you prefers localPack', () => {
    const r = resolveRegisterPack({
      draft: {
        mode: 'you',
        localPack: { summary: 'edited', devices: [], sections: { ...EMPTY_SECTIONS } },
      },
      youPack,
      otherPack,
    })
    expect(r.inject).toMatch(/edited/)
    expect(r.inject).not.toMatch(/me voice/)
  })

  it('you unavailable without report', () => {
    const r = resolveRegisterPack({
      draft: { mode: 'you' },
      youPack: null,
      otherPack,
    })
    expect(r.inject).toBeNull()
    expect(r.unavailableReason).toMatch(/Generate a report/)
  })

  it('other uses otherPack', () => {
    const r = resolveRegisterPack({
      draft: { mode: 'other', otherUsername: 'aixbt_agent' },
      youPack,
      otherPack,
    })
    expect(r.inject).toMatch(/aixbt/)
    expect(r.inject).toMatch(/dense numbers/)
  })

  it('custom uses prompt', () => {
    const r = resolveRegisterPack({
      draft: { mode: 'custom', customPrompt: 'sound like a pirate' },
      youPack: null,
      otherPack: null,
    })
    expect(r.inject).toMatch(/sound like a pirate/)
  })
})

describe('draftRegisterFromDefault', () => {
  it('copies mode from default', () => {
    expect(draftRegisterFromDefault(DEFAULT_REGISTER_DEFAULT)).toEqual({ mode: 'you' })
    expect(draftRegisterFromDefault({ mode: 'other', otherUsername: 'bob' })).toEqual({
      mode: 'other',
      otherUsername: 'bob',
    })
  })
})

describe('emptyRegisterPack', () => {
  it('is empty shape', () => {
    expect(emptyRegisterPack()).toEqual({
      summary: '',
      devices: [],
      sections: { ...EMPTY_SECTIONS },
    })
  })
})
