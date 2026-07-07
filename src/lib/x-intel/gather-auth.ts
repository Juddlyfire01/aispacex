import { useXSelfStore } from '../../stores/x-self-store'
import { isDemoTarget } from './fields'
import { XAPIError, type GatherAuth } from './x-client'

export type { GatherAuth }

/** OAuth when connected; demo bearer for @AskVenice when not. */
export function resolveGatherAuth(username: string): GatherAuth {
  if (useXSelfStore.getState().connected) return 'oauth'
  if (isDemoTarget(username)) return 'demo'
  throw new XAPIError('Connect your X account (header → Connect X) to gather other profiles.', 401)
}
