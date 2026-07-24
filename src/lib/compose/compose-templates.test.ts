import { describe, it, expect } from 'vitest'
import { COMPOSE_TEMPLATES, PRIMARY_TEMPLATE } from './compose-templates'
import { DISCOVER_STARTER } from './discover-workflow'
import { fullToolsReminder, spentReminder, buildStagePrompt } from './skill-pipeline'

describe('COMPOSE_TEMPLATES registry', () => {
  it('contains six skill stages with Discover primary', () => {
    expect(COMPOSE_TEMPLATES).toHaveLength(6)
    expect(COMPOSE_TEMPLATES.map((t) => t.id)).toEqual([
      'discover',
      'inbound-replies',
      'angles',
      'craft-post',
      'craft-thread',
      'polish',
    ])
    expect(COMPOSE_TEMPLATES[0]).toBe(DISCOVER_STARTER)
    expect(PRIMARY_TEMPLATE).toBe(DISCOVER_STARTER)
    expect(PRIMARY_TEMPLATE.id).toBe('discover')
  })

  it('has unique ids and labels', () => {
    const ids = COMPOSE_TEMPLATES.map((t) => t.id)
    const labels = COMPOSE_TEMPLATES.map((t) => t.label)
    expect(new Set(ids).size).toBe(ids.length)
    expect(new Set(labels).size).toBe(labels.length)
  })

  it('sets preferredFormat per stage and auto does not force format', () => {
    const byId = Object.fromEntries(COMPOSE_TEMPLATES.map((t) => [t.id, t]))
    expect(byId.discover?.preferredFormat).toBe('auto')
    expect(byId['inbound-replies']?.preferredFormat).toBe('auto')
    expect(byId.angles?.preferredFormat).toBe('auto')
    expect(byId.polish?.preferredFormat).toBe('auto')
    expect(byId['craft-post']?.preferredFormat).toBe('post')
    expect(byId['craft-thread']?.preferredFormat).toBe('thread')
  })

  it('every stage prompt mentions tools, spent, and stage job', () => {
    for (const tpl of COMPOSE_TEMPLATES) {
      expect(tpl.id).toBeTruthy()
      expect(tpl.label).toBeTruthy()
      expect(tpl.hint).toBeTruthy()
      expect(tpl.blurb).toBeTruthy()

      const prompt = tpl.buildPrompt()
      const display = tpl.buildDisplayMessage()

      expect(prompt.length).toBeGreaterThan(200)
      expect(prompt).toMatch(/intel_\*/)
      expect(prompt).toMatch(/compose_history_/)
      expect(prompt).toMatch(/compose_write_draft/)
      expect(prompt).toMatch(/SPENT/i)
      expect(prompt).toMatch(/SKILL STAGE/i)

      expect(display.length).toBeLessThan(prompt.length / 2)
      expect(display).not.toMatch(/CRITICAL/)
    }
  })

  it('craft stages require compose_write_draft; chat stages discourage early draft', () => {
    const discover = COMPOSE_TEMPLATES.find((t) => t.id === 'discover')!.buildPrompt()
    const inbound = COMPOSE_TEMPLATES.find((t) => t.id === 'inbound-replies')!.buildPrompt()
    const angles = COMPOSE_TEMPLATES.find((t) => t.id === 'angles')!.buildPrompt()
    const craftPost = COMPOSE_TEMPLATES.find((t) => t.id === 'craft-post')!.buildPrompt()
    const craftThread = COMPOSE_TEMPLATES.find((t) => t.id === 'craft-thread')!.buildPrompt()
    const polish = COMPOSE_TEMPLATES.find((t) => t.id === 'polish')!.buildPrompt()

    expect(discover).toMatch(/CHAT ONLY|discourage/i)
    expect(inbound).toMatch(/CHAT ONLY|discourage/i)
    expect(inbound).toMatch(/Highest-signal reply targets/i)
    expect(inbound).toMatch(/Mass-mention spam/i)
    expect(angles).toMatch(/Tier/i)
    expect(angles).toMatch(/claim|evidence/i)
    expect(angles).not.toMatch(/\[lever\]/i)
    expect(craftPost).toMatch(/MUST call compose_write_draft/)
    expect(craftThread).toMatch(/MUST call compose_write_draft/)
    expect(craftThread).toMatch(/coherent thread/i)
    expect(craftThread).not.toMatch(/5-beat/i)
    expect(craftThread).not.toMatch(/Hook —/)
    expect(polish).toMatch(/MUST call compose_write_draft/)
    expect(polish).toMatch(/Register fidelity|Register/i)
    expect(polish).not.toMatch(/CRAFT|CADENCE|pre-publish/i)
  })
})

describe('skill-pipeline scaffolding', () => {
  it('fullToolsReminder lists the full tool surface', () => {
    const t = fullToolsReminder()
    expect(t).toMatch(/intel_\*/)
    expect(t).toMatch(/stats_\*/)
    expect(t).toMatch(/alpha_\*/)
    expect(t).toMatch(/news_read/)
    expect(t).toMatch(/compose_write_draft/)
  })

  it('spentReminder trusts injected pack', () => {
    expect(spentReminder()).toMatch(/SPENT \/ PRIOR ART/)
    expect(spentReminder()).toMatch(/FAILED/)
  })

  it('buildStagePrompt assembles shared blocks', () => {
    const p = buildStagePrompt({
      stage: 'discover',
      label: 'Discover',
      jobBody: 'Do the brief.',
    })
    expect(p).toMatch(/SKILL STAGE: Discover/)
    expect(p).toMatch(/Do the brief/)
    expect(p).toMatch(/intel_\*/)
    expect(p).toMatch(/SPENT/)
    expect(p).toMatch(/HANDOFF CONTRACT/)
  })

  it('inbound-replies handoff stays chat-only like discover', () => {
    const p = buildStagePrompt({
      stage: 'inbound-replies',
      label: 'Inbound replies',
      jobBody: 'List replies.',
    })
    expect(p).toMatch(/reply report/)
    expect(p).toMatch(/discourage early compose_write_draft/i)
    expect(p).not.toMatch(/MUST call compose_write_draft/)
  })
})
