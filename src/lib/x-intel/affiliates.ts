// Orchestration for organization affiliate rosters: fetch via the X affiliates
// endpoint and persist into the affiliates store. Venice is fetchable gratis
// (demo bearer) when X is not connected; any other org requires OAuth.
import { gatherAffiliates } from './gather'
import { resolveGatherAuth } from './gather-auth'
import { flushEncryptedStorage } from '../encrypted-storage'
import {
  useXAffiliatesStore,
  VENICE_ORG,
  type AffiliateRoster,
} from '../../stores/x-affiliates-store'

/** An org to look up affiliates for. Defaults to Venice. */
export interface AffiliateOrg {
  id: string
  username: string
  name?: string | null
}

/**
 * Fetch (or refresh) an organization's affiliate roster and store it. Returns
 * the saved roster. Defaults to the Venice org. Sorts members by follower count
 * (desc) so the most prominent affiliates surface first.
 */
export async function refreshAffiliates(org: AffiliateOrg = VENICE_ORG): Promise<AffiliateRoster> {
  const auth = resolveGatherAuth(org.username)
  const { data: members } = await gatherAffiliates(org.id, auth)

  members.sort((a, b) => b.metrics.followers - a.metrics.followers)

  const roster: AffiliateRoster = {
    orgId: org.id,
    orgUsername: org.username,
    orgName: org.name ?? null,
    members,
    fetchedAt: new Date().toISOString(),
  }

  useXAffiliatesStore.getState().setRoster(roster)
  await flushEncryptedStorage('x-affiliates')
  return roster
}
