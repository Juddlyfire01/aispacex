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

  it('toolsEnabled adds intel, history, VeniceStats, and news_read rules', () => {
    const off = buildComposeSystem({ modelId: 'm', xSearchOn: false, toolsEnabled: false })
    const on = buildComposeSystem({ modelId: 'm', xSearchOn: false, toolsEnabled: true })
    expect(off).not.toMatch(/intel_\*/)
    expect(off).not.toMatch(/stats_protocol/)
    expect(off).not.toMatch(/news_read/)
    expect(on).toMatch(/intel_\*/)
    expect(on).toMatch(/HOT WINDOW/i)
    expect(on).toMatch(/Never invent post ids/i)
    expect(on).toMatch(/compose_history_\*/)
    expect(on).toMatch(/Never invent thread ids/i)
    expect(on).toMatch(/stats_protocol/)
    expect(on).toMatch(/VeniceStats/)
    expect(on).toMatch(/news_read/)
    expect(on).toMatch(/BOOKMARKED NEWS/)
    expect(on).not.toMatch(/compose_write_draft/)
    expect(on).not.toMatch(/x_news_search/)
  })

  it('xNewsOn adds X News tool rules', () => {
    const off = buildComposeSystem({
      modelId: 'm',
      xSearchOn: false,
      toolsEnabled: true,
      xNewsOn: false,
    })
    const on = buildComposeSystem({
      modelId: 'm',
      xSearchOn: false,
      toolsEnabled: true,
      xNewsOn: true,
    })
    expect(off).not.toMatch(/x_news_search/)
    expect(on).toMatch(/x_news_search/)
    expect(on).toMatch(/x_news_get/)
  })

  it('xSearchOn adds live X search capability blurb', () => {
    const off = buildComposeSystem({ modelId: 'm', xSearchOn: false, toolsEnabled: false })
    const on = buildComposeSystem({ modelId: 'm', xSearchOn: true, toolsEnabled: false })
    expect(off).not.toMatch(/Live X\/Twitter search is available/i)
    expect(on).toMatch(/Live X\/Twitter search is available/i)
  })

  it('webSearchOn adds live web search capability blurb', () => {
    const off = buildComposeSystem({ modelId: 'm', xSearchOn: false, webSearchOn: false, toolsEnabled: false })
    const on = buildComposeSystem({ modelId: 'm', xSearchOn: false, webSearchOn: true, toolsEnabled: false })
    expect(off).not.toMatch(/Live web search is available/i)
    expect(on).toMatch(/Live web search is available/i)
  })

  it('includes register inject when provided', () => {
    const system = buildComposeSystem({
      modelId: 'm',
      xSearchOn: false,
      toolsEnabled: false,
      registerInject:
        'REGISTER — HARD STYLE CONSTRAINT (non-negotiable for all publishable copy):\nDescription: terse',
    })
    expect(system).toMatch(/REGISTER — HARD STYLE CONSTRAINT/)
    expect(system).toMatch(/Description: terse/)
    expect(system).toMatch(/REGISTER ADHERENCE/)
  })

  it('keeps register inject under draftHandoff (chat + writer both see it)', () => {
    const system = buildComposeSystem({
      modelId: 'm',
      xSearchOn: false,
      toolsEnabled: true,
      draftHandoff: true,
      registerInject: 'REGISTER — HARD STYLE CONSTRAINT\nDescription: metric stack',
    })
    expect(system).toMatch(/REGISTER — HARD STYLE CONSTRAINT/)
    expect(system).toMatch(/compose_write_draft/)
    expect(system).toMatch(/register-critical style cues/i)
  })

  it('includes handoff draft tool instructions when draftHandoff', () => {
    const system = buildComposeSystem({
      modelId: 'm',
      xSearchOn: false,
      toolsEnabled: true,
      draftHandoff: true,
    })
    expect(system).toMatch(/compose_write_draft/)
    expect(system).toMatch(/ONLY when the user asks/i)
    expect(system).toMatch(/NEVER paste the full draft/i)
    expect(system).toMatch(/Do not announce a "handoff"/i)
    expect(system).not.toMatch(/```postdraft\n/)
  })

  it('adds article mode rules when preferredFormat is article', () => {
    const system = buildComposeSystem({
      modelId: 'm',
      xSearchOn: false,
      toolsEnabled: true,
      draftHandoff: true,
      preferredFormat: 'article',
    })
    expect(system).toMatch(/ARTICLE MODE/)
    expect(system).toMatch(/find-a-post|reply-target/i)
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

  it('injects forced preferred format', () => {
    const s = buildComposeSystem({
      modelId: 'm',
      xSearchOn: false,
      toolsEnabled: false,
      preferredFormat: 'article',
    })
    expect(s).toMatch(/User prefers format: article/)
  })

  it('documents format modes in auto', () => {
    const s = buildComposeSystem({
      modelId: 'm',
      xSearchOn: false,
      toolsEnabled: false,
      preferredFormat: 'auto',
    })
    expect(s).toMatch(/Article/i)
    expect(s).toMatch(/thread/i)
  })

  it('notes non-premium auto preference', () => {
    const s = buildComposeSystem({
      modelId: 'm',
      xSearchOn: false,
      toolsEnabled: false,
      preferredFormat: 'auto',
      premiumCapable: false,
    })
    expect(s).toMatch(/not Premium-verified/i)
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
