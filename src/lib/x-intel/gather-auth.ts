import { useXSelfStore } from '../../stores/x-self-store'
import type { GatherAuth } from './x-client'

export type { GatherAuth }

/**
 * OAuth when connected (richer fields e.g. connection_status); otherwise
 * app-bearer public reads for any username. Never requires Connect X to gather.
 */
export function resolveGatherAuth(_username: string): GatherAuth {
  if (useXSelfStore.getState().connected) return 'oauth'
  return 'demo'
}
