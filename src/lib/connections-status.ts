// Header Connections pill: one readiness dot.
// Chrome = "can this tab run?" (same gate as assertPaidReady). Inventory stays
// in the Connections modal (Venice / X / Credits).

import { useAuthStore } from '../stores/auth-store'
import { useXSelfStore } from '../stores/x-self-store'
import { isUserVeniceKey } from './venice-config'
import { getPaidReadiness, isCreditsWalletConnected } from './x402/charge-flow'
import { X402_DISABLE_FREE } from './x402/config'

export type ConnectionsPillTone = 'ok' | 'amber' | 'off'

export interface ConnectionsStatus {
  /** Ready / partial / blocked for the active tab. */
  tone: ConnectionsPillTone
  ariaLabel: string
}

const MEDIA_TABS = new Set(['image', 'audio', 'music', 'video'])

function railForTab(tab: string): 'shared' | 'venice' {
  return MEDIA_TABS.has(tab) ? 'venice' : 'shared'
}

function readinessWord(tone: ConnectionsPillTone): string {
  if (tone === 'ok') return 'ready'
  if (tone === 'amber') return 'partial'
  return 'not ready'
}

/**
 * Pill tone mirrors action gating:
 * - ok     → can run (Free path, paid-ready, or rail-appropriate BYOK)
 * - amber  → partial (needs SIWE; Venice without X on Intel; locked key; …)
 * - off    → blocked
 */
export function getConnectionsStatus(tab: string): ConnectionsStatus {
  const apiKey = useAuthStore.getState().apiKey
  const hasEncrypted = useAuthStore.getState().hasEncrypted
  const veniceByok = isUserVeniceKey(apiKey)
  const xByok = useXSelfStore.getState().connected === true
  const paid = getPaidReadiness()
  const rail = railForTab(tab)

  let tone: ConnectionsPillTone

  if (!X402_DISABLE_FREE) {
    if (apiKey || veniceByok) tone = 'ok'
    else if (hasEncrypted || isCreditsWalletConnected() || paid === 'needs_session') tone = 'amber'
    else tone = 'off'
  } else if (paid === 'ready') {
    tone = 'ok'
  } else if (paid === 'needs_session') {
    tone = 'amber'
  } else if (rail === 'venice' && veniceByok) {
    tone = 'ok'
  } else if (rail === 'shared' && veniceByok && xByok) {
    tone = 'ok'
  } else if (veniceByok || xByok || isCreditsWalletConnected()) {
    tone = 'amber'
  } else {
    tone = 'off'
  }

  return {
    tone,
    ariaLabel: `Connections: ${readinessWord(tone)}`,
  }
}
