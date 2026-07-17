import { describe, it, expect } from 'vitest'
import {
  DEFAULT_SYNTHESIS_SETTINGS,
  LEGACY_DEFAULT_CONTEXT_CAP,
  MAX_CONTEXT_CAP,
  upgradeLegacyContextCap,
} from './types'

describe('upgradeLegacyContextCap', () => {
  it('rewrites the old default (80) to MAX', () => {
    expect(upgradeLegacyContextCap(LEGACY_DEFAULT_CONTEXT_CAP)).toBe(MAX_CONTEXT_CAP)
  })

  it('leaves user-set and already-MAX values alone', () => {
    expect(upgradeLegacyContextCap(50)).toBe(50)
    expect(upgradeLegacyContextCap(200)).toBe(200)
    expect(upgradeLegacyContextCap(MAX_CONTEXT_CAP)).toBe(MAX_CONTEXT_CAP)
  })
})

describe('DEFAULT_SYNTHESIS_SETTINGS', () => {
  it('defaults post context cap to MAX', () => {
    expect(DEFAULT_SYNTHESIS_SETTINGS.contextCap).toBe(MAX_CONTEXT_CAP)
  })

  it('does not seed a concrete model id (avoids legacy→default flash)', () => {
    expect(DEFAULT_SYNTHESIS_SETTINGS.model).toBe('')
  })
})
