import { ME_CONTEXT, ALL_CONTEXT } from '../../stores/compose-store'
import type { ComposeScope } from './types'

export function scopeFromContext(activeContext: string): ComposeScope {
  if (activeContext === ME_CONTEXT) return { type: 'me' }
  if (activeContext === ALL_CONTEXT) return { type: 'all' }
  return { type: 'target', username: activeContext }
}
