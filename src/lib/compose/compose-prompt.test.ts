import { describe, it, expect } from 'vitest'
import { buildComposeSystem, buildHotUserPrefix } from './compose-prompt'

describe('buildComposeSystem', () => {
  it('identifies as the selected model id, not a ghostwriter', () => {
    const system = buildComposeSystem({
      modelId: 'venice-uncensored',
      xSearchOn: false,
      toolsEnabled: true,
    })
    expect(system).toMatch(/^You are venice-uncensored,/m)
    expect(system).not.toMatch(/ghostwriter/i)
    expect(system).toMatch(/research partner and analyst/i)
    // Drafting always goes through the write-draft tool; the old postdraft JSON
    // template must be gone (postdraft may still appear as a forbidden term).
    expect(system).toMatch(/compose_write_draft/)
    expect(system).not.toMatch(/```postdraft\n\{/)
    expect(system).not.toMatch(/"segments":\s*\[\{\s*"text"/)
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

  it('toolsEnabled adds intel, history, VeniceStats, news_read, CRAFT, and SPENT rules', () => {
    const off = buildComposeSystem({ modelId: 'm', xSearchOn: false, toolsEnabled: false })
    const on = buildComposeSystem({ modelId: 'm', xSearchOn: false, toolsEnabled: true })
    expect(off).not.toMatch(/intel_\*/)
    expect(off).not.toMatch(/stats_protocol/)
    expect(off).not.toMatch(/news_read/)
    expect(off).not.toMatch(/## CRAFT/)
    expect(off).not.toMatch(/SPENT \/ PRIOR ART/)
    expect(on).toMatch(/intel_\*/)
    expect(on).toMatch(/HOT WINDOW/i)
    expect(on).toMatch(/Never invent post ids/i)
    expect(on).toMatch(/compose_history_\*/)
    expect(on).toMatch(/Never invent thread ids/i)
    expect(on).toMatch(/stats_protocol/)
    expect(on).toMatch(/VeniceStats/)
    expect(on).toMatch(/news_read/)
    expect(on).toMatch(/BOOKMARKED NEWS/)
    expect(on).toMatch(/alpha_list|ALPHA RADAR|24h/)
    expect(on).toMatch(/## CRAFT/)
    expect(on).toMatch(/Specificity beats cleverness/)
    expect(on).toMatch(/SPENT \/ PRIOR ART/)
    expect(on).toMatch(/FAILED draft/)
    expect(off).not.toMatch(/alpha_list/)
    // Drafting tool is always present once tools are enabled.
    expect(on).toMatch(/compose_write_draft/)
    expect(off).not.toMatch(/compose_write_draft/)
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

  it('register inject is shared with the writer (chat + writer both see it)', () => {
    const system = buildComposeSystem({
      modelId: 'm',
      xSearchOn: false,
      toolsEnabled: true,
      registerInject: 'REGISTER — HARD STYLE CONSTRAINT\nDescription: metric stack',
    })
    expect(system).toMatch(/REGISTER — HARD STYLE CONSTRAINT/)
    expect(system).toMatch(/compose_write_draft/)
    expect(system).toMatch(/register-critical style cues/i)
  })

  it('drafting always uses compose_write_draft, never a postdraft fence', () => {
    const system = buildComposeSystem({
      modelId: 'm',
      xSearchOn: false,
      toolsEnabled: true,
    })
    expect(system).toMatch(/compose_write_draft/)
    // The legacy JSON draft template is gone (no fence example to fill in).
    expect(system).not.toMatch(/```postdraft\n\{/)
    expect(system).toMatch(/streams? .*into the Draft drawer/i)
  })

  it('draft spec forwards conversation history to a separate writer', () => {
    const system = buildComposeSystem({
      modelId: 'm',
      xSearchOn: false,
      toolsEnabled: true,
    })
    expect(system).toMatch(/compose_write_draft/)
    expect(system).toMatch(/conversation history/i)
    expect(system).toMatch(/Do not announce a \"handoff\"/i)
    expect(system).not.toMatch(/```postdraft\n/)
  })

  it('same-as-main spec continues the research turn instead of a separate writer', () => {
    const system = buildComposeSystem({
      modelId: 'm',
      xSearchOn: false,
      toolsEnabled: true,
      sameModelDraft: true,
    })
    expect(system).toMatch(/status write_now/i)
    expect(system).toMatch(/very next response/i)
    expect(system).not.toMatch(/distinct writer model receives/i)
  })

  it('adds article mode rules when preferredFormat is article', () => {
    const system = buildComposeSystem({
      modelId: 'm',
      xSearchOn: false,
      toolsEnabled: true,
      preferredFormat: 'article',
    })
    expect(system).toMatch(/ARTICLE MODE/)
    expect(system).toMatch(/find-a-post|reply-target/i)
  })

  it('omits the draft tool spec when tools are disabled', () => {
    const system = buildComposeSystem({
      modelId: 'm',
      xSearchOn: false,
      toolsEnabled: false,
    })
    expect(system).not.toMatch(/postdraft/)
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

  it('includes spent block when present', () => {
    expect(buildHotUserPrefix('HOT', 'Write', '## SPENT / PRIOR ART\n- x')).toBe(
      'HOT\n\n## SPENT / PRIOR ART\n- x\n\n---\nWrite',
    )
  })

  it('spent-only prefix works without hot', () => {
    expect(buildHotUserPrefix('', 'Write', '## SPENT / PRIOR ART\n- x')).toBe(
      '## SPENT / PRIOR ART\n- x\n\n---\nWrite',
    )
  })
})
