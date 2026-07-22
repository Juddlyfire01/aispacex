// Header Connections pill: readiness tone + per-rail micro-dot inventory.
// Readiness = "can I run this tab's billable work?", not "is any apiKey set".

import { useAuthStore } from '../stores/auth-store'
import { useX402Store } from '../stores/x402-store'
import { useXSelfStore } from '../stores/x-self-store'
import { isUserVeniceKey } from './venice-config'
import { getPaidReadiness, isCreditsWalletConnected } from './x402/charge-flow'
import { X402_DISABLE_FREE, X402_ENABLED } from './x402/config'

export type ConnectionDotTone = 'ok' | 'amber' | 'off'
export type ConnectionsPillTone = 'ok' | 'amber' | 'off'

export interface ConnectionsStatus {
  /** Whether the active tab can run billable work. */
  tone: ConnectionsPillTone
  venice: ConnectionDotTone
  x: ConnectionDotTone
  credits: ConnectionDotTone
  ariaLabel: string
}

const MEDIA_TABS = new Set(['image', 'audio', 'music', 'video'])

function railForTab(tab: string): 'shared' | 'venice' {
  return MEDIA_TABS.has(tab) ? 'venice' : 'shared'
}

function dotWord(tone: ConnectionDotTone): string {
  if (tone === 'ok') return 'ok'
  if (tone === 'amber') return 'partial'
  return 'off'
}

function readinessWord(tone: ConnectionsPillTone): string {
  if (tone === 'ok') return 'ready'
  if (tone === 'amber') return 'partial'
  return 'not ready'
}

function veniceDot(): ConnectionDotTone {
  const { apiKey, hasEncrypted } = useAuthStore.getState()
  if (isUserVeniceKey(apiKey)) return 'ok'
  if (hasEncrypted) return 'amber'
  return 'off'
}

function xDot(): ConnectionDotTone {
  const { connected, connecting } = useXSelfStore.getState()
  if (connected) return 'ok'
  if (connecting) return 'amber'
  return 'off'
}

function creditsDot(): ConnectionDotTone {
  if (!X402_ENABLED) return 'off'
  const paid = getPaidReadiness()
  if (paid === 'ready') return 'ok'
  if (paid === 'needs_session' || isCreditsWalletConnected()) return 'amber'
  return 'off'
}

function pillToneForTab(tab: string): ConnectionsPillTone {
  const apiKey = useAuthStore.getState().apiKey
  const hasEncrypted = useAuthStore.getState().hasEncrypted
  const veniceByok = isUserVeniceKey(apiKey)
  const xByok = useXSelfStore.getState().connected === true
  const paid = getPaidReadiness()
  const rail = railForTab(tab)

  if (!X402_DISABLE_FREE) {
    // Free path: app/fronted key or BYOK Venice is enough to work.
    if (apiKey || veniceByok) return 'ok'
    if (hasEncrypted) return 'amber'
    return 'off'
  }

  // Free off: paid-ready or rail-appropriate BYOK.
  if (paid === 'ready') return 'ok'
  if (paid === 'needs_session') return 'amber'
  if (rail === 'venice' && veniceByok) return 'ok'
  if (rail === 'shared' && veniceByok && xByok) return 'ok'
  if (veniceByok || xByok || isCreditsWalletConnected()) return 'amber'
  return 'off'
}

/** Snapshot of Connections header status for the active tab. */
export function getConnectionsStatus(tab: string): ConnectionsStatus {
  const tone = pillToneForTab(tab)
  const venice = veniceDot()
  const x = xDot()
  const credits = creditsDot()
  const ariaLabel = `Connections: ${readinessWord(tone)} — Venice ${dotWord(venice)}, X ${dotWord(x)}, Credits ${dotWord(credits)}`
  return { tone, venice, x, credits, ariaLabel }
}
