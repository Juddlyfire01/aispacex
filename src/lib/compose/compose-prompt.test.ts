import { describe, it, expect } from 'vitest'
import { buildComposeSystem, buildHotUserPrefix } from './compose-prompt'

describe('buildComposeSystem', () => {
  it('includes postdraft / ghostwriter voice', () => {
    const system = buildComposeSystem({ xSearchOn: false, toolsEnabled: false })
    expect(system).toMatch(/ghostwriter/i)
    expect(system).toMatch(/postdraft/)
    expect(system).toMatch(/segments/)
  })

  it('toolsEnabled adds intel tool rules', () => {
    const off = buildComposeSystem({ xSearchOn: false, toolsEnabled: false })
    const on = buildComposeSystem({ xSearchOn: false, toolsEnabled: true })
    expect(off).not.toMatch(/intel_\*/)
    expect(on).toMatch(/intel_\*/)
    expect(on).toMatch(/HOT WINDOW/i)
    expect(on).toMatch(/Never invent post ids/i)
  })

  it('xSearchOn adds live search blurb', () => {
    const off = buildComposeSystem({ xSearchOn: false, toolsEnabled: false })
    const on = buildComposeSystem({ xSearchOn: true, toolsEnabled: false })
    expect(off).not.toMatch(/live X\/web search/i)
    expect(on).toMatch(/live X\/web search/i)
  })

  it('does not embed corpus or target dumps', () => {
    const system = buildComposeSystem({ xSearchOn: true, toolsEnabled: true })
    expect(system).not.toMatch(/===== DATA SET =====/)
    expect(system).not.toMatch(/Recent posts by @/)
  })
})

describe('buildHotUserPrefix', () => {
  it('empty hot returns user message only', () => {
    expect(buildHotUserPrefix('', 'Hello')).toBe('Hello')
    expect(buildHotUserPrefix('   \n  ', 'Hello')).toBe('Hello')
  })

  it('non-empty joins with ---', () => {
    expect(buildHotUserPrefix('HOT DATA', 'Write a post')).toBe('HOT DATA\n\n---\nWrite a post')
  })
})
