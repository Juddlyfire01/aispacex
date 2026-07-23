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
    expect(system).toMatch(/compose_write_draft/)
    expect(system).not.toMatch(/```postdraft\n\{/)
    expect(system).toMatch(/Do not offer to draft/i)
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

  it('toolsEnabled adds intel, history, VeniceStats, news_read, and SPENT — not CRAFT/REGISTER', () => {
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
    expect(on).not.toMatch(/## CRAFT/)
    expect(on).toMatch(/SPENT \/ PRIOR ART/)
    expect(off).not.toMatch(/alpha_list/)
    expect(on).toMatch(/compose_write_draft/)
    expect(off).not.toMatch(/compose_write_draft/)
    expect(on).not.toMatch(/x_news_search/)
    expect(on).not.toMatch(/REGISTER —/)
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

  it('xSearchOn adds FRESHNESS rules for live X; off has no mandate', () => {
    const off = buildComposeSystem({ modelId: 'm', xSearchOn: false, toolsEnabled: true })
    const on = buildComposeSystem({ modelId: 'm', xSearchOn: true, toolsEnabled: true })
    expect(off).not.toMatch(/Live X\/Twitter search is available/i)
    expect(off).not.toMatch(/FRESHNESS \(live X search is ON\)/)
    expect(off).not.toMatch(/MUST use live X search/)
    expect(on).toMatch(/Live X\/Twitter search is available/i)
    expect(on).toMatch(/FRESHNESS \(live X search is ON\)/)
    expect(on).toMatch(/MUST use live X search/)
    expect(on).toMatch(/library snapshot/i)
    expect(on).toMatch(/may lag live X/i)
    expect(on).toMatch(/for last\/latest\/current recency claims/i)
  })

  it('webSearchOn adds live web search capability blurb', () => {
    const off = buildComposeSystem({ modelId: 'm', xSearchOn: false, webSearchOn: false, toolsEnabled: false })
    const on = buildComposeSystem({ modelId: 'm', xSearchOn: false, webSearchOn: true, toolsEnabled: false })
    expect(off).not.toMatch(/Live web search is available/i)
    expect(on).toMatch(/Live web search is available/i)
  })

  it('does not embed register inject in research system', () => {
    const system = buildComposeSystem({
      modelId: 'm',
      xSearchOn: false,
      toolsEnabled: true,
    })
    expect(system).not.toMatch(/REGISTER ADHERENCE/)
    expect(system).not.toMatch(/register-critical style cues/i)
  })

  it('drafting always uses compose_write_draft metadata; draft stage continues the thread', () => {
    const system = buildComposeSystem({
      modelId: 'm',
      xSearchOn: false,
      toolsEnabled: true,
    })
    expect(system).toMatch(/compose_write_draft/)
    expect(system).toMatch(/metadata only/i)
    expect(system).toMatch(/draft stage/i)
    expect(system).toMatch(/continues THIS conversation/i)
    expect(system).not.toMatch(/```postdraft\n\{/)
    expect(system).not.toMatch(/status write_now/i)
    expect(system).not.toMatch(/dense brief/i)
    expect(system).toMatch(/Do not announce a \"handoff\"/i)
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
    expect(s).toMatch(/User prefers draft format: article/)
  })

  it('documents format modes in auto', () => {
    const s = buildComposeSystem({
      modelId: 'm',
      xSearchOn: false,
      toolsEnabled: true,
      preferredFormat: 'auto',
    })
    expect(s).toMatch(/Article/i)
    expect(s).toMatch(/thread/i)
    expect(s).toMatch(/format: "post" \| "thread" \| "longform" \| "article"/)
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
