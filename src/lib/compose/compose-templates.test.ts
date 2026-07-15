import { describe, it, expect } from 'vitest'
import { COMPOSE_TEMPLATES, PRIMARY_TEMPLATE } from './compose-templates'
import { SPHERE_REPORT_STARTER } from './sphere-report-workflow'
import { SIGNAL_DOSSIER_STARTER } from './signal-dossier-workflow'
import { BY_THE_NUMBERS_STARTER } from './by-the-numbers-workflow'
import { REBUTTAL_BRIEF_STARTER } from './rebuttal-brief-workflow'
import { BULL_THESIS_STARTER } from './bull-thesis-workflow'

describe('COMPOSE_TEMPLATES registry', () => {
  it('contains the Sphere Report plus its four complements', () => {
    expect(COMPOSE_TEMPLATES).toHaveLength(5)
    expect(COMPOSE_TEMPLATES[0]).toBe(SPHERE_REPORT_STARTER)
    expect(PRIMARY_TEMPLATE).toBe(SPHERE_REPORT_STARTER)
  })

  it('has unique ids and labels', () => {
    const ids = COMPOSE_TEMPLATES.map((t) => t.id)
    const labels = COMPOSE_TEMPLATES.map((t) => t.label)
    expect(new Set(ids).size).toBe(ids.length)
    expect(new Set(labels).size).toBe(labels.length)
  })

  it('every template satisfies the shared UX contract', () => {
    for (const tpl of COMPOSE_TEMPLATES) {
      // Metadata present.
      expect(tpl.id).toBeTruthy()
      expect(tpl.label).toBeTruthy()
      expect(tpl.hint).toBeTruthy()
      expect(tpl.blurb).toBeTruthy()
      expect(tpl.preferredFormat).toBe('longform')

      const prompt = tpl.buildPrompt()
      const display = tpl.buildDisplayMessage()

      // Same multi-phase / draft-handoff flow across all templates.
      expect(prompt.length).toBeGreaterThan(500)
      expect(prompt).toMatch(/Phase 0/i)
      expect(prompt).toMatch(/Phase 4/i)
      expect(prompt).toMatch(/compose_write_draft/)
      expect(prompt).toMatch(/do not exit early/i)
      expect(prompt).toMatch(/Conclusion/i)

      // Chat bubble is a short launch line, never the full prompt.
      expect(display.length).toBeLessThan(prompt.length / 2)
      expect(display).not.toMatch(/compose_write_draft/)
      expect(display).not.toMatch(/CRITICAL/)
      expect(display).toMatch(/^Generate /)
    }
  })
})

describe('template distinctiveness — each has its signature gate', () => {
  it('Signal Dossier is deep/single-subject with an evolution gate', () => {
    const p = SIGNAL_DOSSIER_STARTER.buildPrompt()
    expect(p).toMatch(/DEPTH HARD RULE/i)
    expect(p).toMatch(/one subject|single node|single subject/i)
    expect(p).toMatch(/then vs now|evolution|arc/i)
  })

  it('By the Numbers is metric-led with a sourcing gate', () => {
    const p = BY_THE_NUMBERS_STARTER.buildPrompt()
    expect(p).toMatch(/SOURCING HARD RULE/i)
    expect(p).toMatch(/VeniceStats/)
    expect(p).toMatch(/no price predictions|no price|no unsourced/i)
  })

  it('Rebuttal Brief steelmans before countering', () => {
    const p = REBUTTAL_BRIEF_STARTER.buildPrompt()
    expect(p).toMatch(/STEELMAN HARD RULE/i)
    expect(p).toMatch(/strawman/i)
    expect(p).toMatch(/concede/i)
  })

  it('Bull Thesis is fundamentals-only, no price calls', () => {
    const p = BULL_THESIS_STARTER.buildPrompt()
    expect(p).toMatch(/FUNDAMENTALS HARD RULE/i)
    expect(p).toMatch(/no price/i)
    expect(p).toMatch(/compounding/i)
    expect(p).toMatch(/RISK FOOTNOTE/i)
  })
})
