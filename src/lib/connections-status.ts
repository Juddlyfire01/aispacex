// Header Connections pill: readiness tone + two micro-dots.
//
//   compute — Credits and Venice BYOK are alternate ways to fund/run inference
//   x       — OAuth is optional/non-blocking for Credits; only amber | ok

import { useAuthStore } from '../stores/auth-store'
import { useXSelfStore } from '../stores/x-self-store'
import { isUserVeniceKey } from './venice-config'
import { getPaidReadiness, isCreditsWalletConnected } from './x402/charge-flow'
import { X402_DISABLE_FREE } from './x402/config'

export type ConnectionDotTone = 'ok' | 'amber' | 'off'
/** X OAuth is never a hard “off” in the header — amber = not connected / connecting. */
export type XConnectionDotTone = 'ok' | 'amber'
export type ConnectionsPillTone = 'ok' | 'amber' | 'off'

export interface ConnectionsStatus {
  /** Whether the active tab can run billable work. */
  tone: ConnectionsPillTone
  /** Credits ready or Venice BYOK (same job: fund/run compute). */
  compute: ConnectionDotTone
  /** X OAuth — ok when connected, amber otherwise. */
  x: XConnectionDotTone
  ariaLabel: string
}

const MEDIA_TABS = new Set(['image', 'audio', 'music', 'video'])

function railForTab(tab: string): 'shared' | 'venice' {
  return MEDIA_TABS.has(tab) ? 'venice' : 'shared'
}

function computeWord(tone: ConnectionDotTone): string {
  if (tone === 'ok') return 'ok'
  if (tone === 'amber') return 'partial'
  return 'off'
}

function readinessWord(tone: ConnectionsPillTone): string {
  if (tone === 'ok') return 'ready'
  if (tone === 'amber') return 'partial'
  return 'not ready'
}

/**
 * One signal for “how inference is funded”:
 * Credits (paid-ready) and Venice BYOK are equivalent greens.
 */
function computeDot(): ConnectionDotTone {
  const { apiKey, hasEncrypted } = useAuthStore.getState()
  const veniceByok = isUserVeniceKey(apiKey)
  const paid = getPaidReadiness()

  if (paid === 'ready' || veniceByok) return 'ok'

  // Free / app-fronted path counts as compute when Free is allowed.
  if (!X402_DISABLE_FREE && apiKey) return 'ok'

  if (paid === 'needs_session' || isCreditsWalletConnected() || hasEncrypted) return 'amber'
  return 'off'
}

/** OAuth: connected → ok; otherwise amber (never red/off). */
function xDot(): XConnectionDotTone {
  return useXSelfStore.getState().connected === true ? 'ok' : 'amber'
}

function pillToneForTab(tab: string): ConnectionsPillTone {
  const apiKey = useAuthStore.getState().apiKey
  const hasEncrypted = useAuthStore.getState().hasEncrypted
  const veniceByok = isUserVeniceKey(apiKey)
  const xByok = useXSelfStore.getState().connected === true
  const paid = getPaidReadiness()
  const rail = railForTab(tab)

  if (!X402_DISABLE_FREE) {
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
  const compute = computeDot()
  const x = xDot()
  const ariaLabel = `Connections: ${readinessWord(tone)} — compute ${computeWord(compute)}, X ${x === 'ok' ? 'ok' : 'optional'}`
  return { tone, compute, x, ariaLabel }
}
