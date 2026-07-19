import type { LibraryMode } from './hot-window'
import type { RegisterDefault } from './register'
import type { ComposeScope } from '../intel-library/types'

/** Snapshot of UI prefs extracted from a legacy `venice-compose` blob (v < 18). */
export interface ComposePrefsSeed {
  model: string
  draftModel: string
  xSearch: 'off' | 'auto' | 'on'
  webSearch: 'off' | 'auto' | 'on'
  xNewsOn: boolean
  xNewsMaxAgeHours: number
  longformPreference: boolean
  registerDefault: RegisterDefault
  libraryMode: LibraryMode
  budgetPct: number
  dayWindowDays: number | null
  draftDrawerOpen: boolean
  draftDrawerWidthPct: number
  activePostSubTab: 'composer' | 'alpha' | 'performance'
  newThreadContext: ComposeScope
}

let pending: ComposePrefsSeed | null = null

export function setPendingComposePrefsSeed(seed: ComposePrefsSeed): void {
  pending = seed
}

export function peekPendingComposePrefsSeed(): ComposePrefsSeed | null {
  return pending
}

export function takePendingComposePrefsSeed(): ComposePrefsSeed | null {
  const seed = pending
  pending = null
  return seed
}

export function clearPendingComposePrefsSeed(): void {
  pending = null
}
