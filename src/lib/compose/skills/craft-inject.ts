import { CRAFT_ANTI_PATTERNS } from './anti-patterns'
import { CRAFT_CADENCE } from './cadence'
import { CRAFT_HOOKS } from './hooks'
import { CRAFT_LEVERS } from './levers'
import { CRAFT_PRINCIPLES } from './principles'

/** Compact CRAFT block for compose system + draft writer prompts. */
export function buildCraftInject(): string {
  return [
    '## CRAFT (X post craft — apply when drafting or scoring angles)',
    CRAFT_PRINCIPLES,
    CRAFT_HOOKS,
    CRAFT_LEVERS,
    CRAFT_CADENCE,
    CRAFT_ANTI_PATTERNS,
  ].join('\n\n')
}
