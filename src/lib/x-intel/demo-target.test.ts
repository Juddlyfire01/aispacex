import { describe, it, expect, beforeEach } from 'vitest'
import { canGatherTarget, isDemoTarget, DEFAULT_TARGET } from './fields'
import { resolveGatherAuth } from './gather-auth'
import { useXSelfStore } from '../../stores/x-self-store'

describe('isDemoTarget', () => {
  it('matches AskVenice case-insensitively', () => {
    expect(isDemoTarget('AskVenice')).toBe(true)
    expect(isDemoTarget('askvenice')).toBe(true)
    expect(isDemoTarget('Other')).toBe(false)
  })

  it('tracks DEFAULT_TARGET', () => {
    expect(isDemoTarget(DEFAULT_TARGET)).toBe(true)
  })
})

describe('canGatherTarget', () => {
  it('allows demo target without OAuth', () => {
    expect(canGatherTarget('AskVenice', false)).toBe(true)
  })

  it('blocks other targets until connected', () => {
    expect(canGatherTarget('elonmusk', false)).toBe(false)
    expect(canGatherTarget('elonmusk', true)).toBe(true)
  })
})

describe('resolveGatherAuth', () => {
  beforeEach(() => {
    useXSelfStore.setState({ connected: false })
  })

  it('uses demo auth for AskVenice when disconnected', () => {
    expect(resolveGatherAuth('askvenice')).toBe('demo')
  })

  it('uses oauth when connected', () => {
    useXSelfStore.setState({ connected: true })
    expect(resolveGatherAuth('askvenice')).toBe('oauth')
    expect(resolveGatherAuth('random')).toBe('oauth')
  })

  it('throws for non-demo targets when disconnected', () => {
    expect(() => resolveGatherAuth('random')).toThrow(/Connect your X account/)
  })
})
