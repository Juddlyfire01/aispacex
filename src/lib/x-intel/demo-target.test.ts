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
  it('allows any non-empty username without OAuth', () => {
    expect(canGatherTarget('AskVenice', false)).toBe(true)
    expect(canGatherTarget('elonmusk', false)).toBe(true)
    expect(canGatherTarget('elonmusk', true)).toBe(true)
  })

  it('rejects empty', () => {
    expect(canGatherTarget('', false)).toBe(false)
    expect(canGatherTarget(null, false)).toBe(false)
    expect(canGatherTarget(undefined, true)).toBe(false)
  })
})

describe('resolveGatherAuth', () => {
  beforeEach(() => {
    useXSelfStore.setState({ connected: false })
  })

  it('uses demo auth for any username when disconnected', () => {
    expect(resolveGatherAuth('askvenice')).toBe('demo')
    expect(resolveGatherAuth('random')).toBe('demo')
  })

  it('uses oauth when connected', () => {
    useXSelfStore.setState({ connected: true })
    expect(resolveGatherAuth('askvenice')).toBe('oauth')
    expect(resolveGatherAuth('random')).toBe('oauth')
  })
})
