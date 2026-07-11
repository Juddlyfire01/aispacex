import { describe, it, expect } from 'vitest'
import { buildComposeSystem, buildHotUserPrefix } from './compose-prompt'

describe('buildComposeSystem', () => {
  it('identifies as the selected model id, not a ghostwriter', () => {
    const system = buildComposeSystem({
      modelId: 'venice-uncensored',
      xSearchOn: false,
      toolsEnabled: false,
    })
    expect(system).toMatch(/^You are venice-uncensored,/m)
    expect(system).not.toMatch(/ghostwriter/i)
    expect(system).toMatch(/research partner and analyst/i)
    expect(system).toMatch(/postdraft/)
    expect(system).toMatch(/segments/)
    expect(system).toMatch(/Do not offer to draft/i)
    // Ids must be emitted as bare digits so the UI can auto-link them.
    expect(system).toMatch(/bare digits/i)
    expect(system).toMatch(/no thousands separators/i)
  })

  it('falls back when model id is blank', () => {
    const system = buildComposeSystem({
      modelId: '   ',
      xSearchOn: false,
      toolsEnabled: false,
    })
    expect(system).toMatch(/^You are unknown-model,/m)
  })

  it('toolsEnabled adds intel and history tool rules', () => {
    const off = buildComposeSystem({ modelId: 'm', xSearchOn: false, toolsEnabled: false })
    const on = buildComposeSystem({ modelId: 'm', xSearchOn: false, toolsEnabled: true })
    expect(off).not.toMatch(/intel_\*/)
    expect(on).toMatch(/intel_\*/)
    expect(on).toMatch(/HOT WINDOW/i)
    expect(on).toMatch(/Never invent post ids/i)
    expect(on).toMatch(/compose_history_\*/)
    expect(on).toMatch(/Never invent thread ids/i)
    expect(on).toMatch(/active chat transcript/i)
  })

  it('xSearchOn adds live search capability blurb', () => {
    const off = buildComposeSystem({ modelId: 'm', xSearchOn: false, toolsEnabled: false })
    const on = buildComposeSystem({ modelId: 'm', xSearchOn: true, toolsEnabled: false })
    expect(off).not.toMatch(/Live X\/web search is available/i)
    expect(on).toMatch(/Live X\/web search is available/i)
  })

  it('includes register inject when provided', () => {
    const system = buildComposeSystem({
      modelId: 'm',
      xSearchOn: false,
      toolsEnabled: false,
      registerInject: 'REGISTER (draft in this exact linguistic register when writing post copy):\nDescription: terse',
    })
    expect(system).toMatch(/REGISTER \(draft in this exact/)
    expect(system).toMatch(/Description: terse/)
  })

  it('includes handoff draft tool instructions when draftHandoff', () => {
    const system = buildComposeSystem({
      modelId: 'm',
      xSearchOn: false,
      toolsEnabled: true,
      draftHandoff: true,
    })
    expect(system).toMatch(/compose_write_draft/)
    expect(system).toMatch(/Do NOT append a postdraft fence/i)
    expect(system).not.toMatch(/```postdraft\n/)
  })

  it('includes postdraft block spec when not handoff', () => {
    const system = buildComposeSystem({
      modelId: 'm',
      xSearchOn: false,
      toolsEnabled: false,
      draftHandoff: false,
    })
    expect(system).toMatch(/postdraft/)
    expect(system).not.toMatch(/compose_write_draft/)
  })
  it('does not embed corpus or target dumps', () => {
    const system = buildComposeSystem({
      modelId: 'm',
      xSearchOn: true,
      toolsEnabled: true,
    })
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
