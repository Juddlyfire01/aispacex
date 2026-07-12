import { describe, it, expect } from 'vitest'
import {
  emptyRegisterPack,
  formatRegisterInject,
  normalizeRegisterPack,
  parseRegisterUpload,
  resolveRegisterPack,
  draftRegisterFromDefault,
  DEFAULT_REGISTER_DEFAULT,
} from './register'

describe('normalizeRegisterPack', () => {
  it('returns null for empty', () => {
    expect(normalizeRegisterPack({})).toBeNull()
    expect(normalizeRegisterPack({ description: '', devices: [], fewShotExamples: [] })).toBeNull()
  })

  it('keeps description devices and few-shots', () => {
    const pack = normalizeRegisterPack({
      description: 'Terse',
      devices: ['metrics', ''],
      fewShotExamples: [
        { label: 'tension', postId: '1', text: 'but here is the tension' },
        { label: 'bad', text: '  ' },
      ],
    })
    expect(pack).toEqual({
      description: 'Terse',
      devices: ['metrics'],
      fewShotExamples: [{ label: 'tension', postId: '1', text: 'but here is the tension' }],
    })
  })
})

describe('parseRegisterUpload', () => {
  it('parses bare pack', () => {
    const pack = parseRegisterUpload(JSON.stringify({ description: 'x', devices: ['a'] }))
    expect(pack.description).toBe('x')
  })

  it('parses wrapped register', () => {
    const pack = parseRegisterUpload(JSON.stringify({ register: { description: 'y', devices: [] } }))
    expect(pack.description).toBe('y')
  })

  it('throws on invalid json', () => {
    expect(() => parseRegisterUpload('not json')).toThrow(/valid JSON/)
  })
})

describe('formatRegisterInject', () => {
  it('includes description devices few-shots and custom', () => {
    const text = formatRegisterInject(
      {
        description: 'Clinical',
        devices: ['rankings'],
        fewShotExamples: [{ label: 'ranking', postId: '99', text: 'top 5:' }],
      },
      { customPrompt: 'keep under 280' },
    )
    expect(text).toMatch(/REGISTER — HARD STYLE CONSTRAINT/)
    expect(text).toMatch(/Clinical/)
    expect(text).toMatch(/rankings/)
    expect(text).toMatch(/--- ranking \[post:99\] ---/)
    expect(text).toMatch(/top 5:/)
    expect(text).toMatch(/keep under 280/)
    expect(text).toMatch(/Adherence checklist/)
  })
})

describe('resolveRegisterPack', () => {
  const youPack = {
    description: 'me voice',
    devices: ['short'],
    fewShotExamples: [] as { label: string; text: string }[],
  }
  const otherPack = {
    description: 'aixbt',
    devices: ['metrics'],
    fewShotExamples: [{ label: 'tension', text: 'but here is the tension' }],
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
  })

  it('you prefers localPack', () => {
    const r = resolveRegisterPack({
      draft: {
        mode: 'you',
        localPack: { description: 'edited', devices: [], fewShotExamples: [] },
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
    expect(r.inject).toMatch(/tension/)
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
    expect(emptyRegisterPack()).toEqual({ description: '', devices: [], fewShotExamples: [] })
  })
})
