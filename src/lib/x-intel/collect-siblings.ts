import { useXIntelStore } from '../../stores/x-intel-store'
import { useXSelfStore } from '../../stores/x-self-store'
import { type SiblingSubject } from './network-build'

/**
 * Collect sibling subjects (other tracked targets + cached self accounts) so the
 * network builder can draw cross-links and reuse known avatars.
 *
 * Lives in lib/ (not inside network-graph.tsx) so the graph component file only
 * exports React components. Mixing a non-component export into a component
 * module breaks React Fast Refresh's "components-only export" rule, which forces
 * a full HMR invalidation of the whole boundary (~30 components) on every edit —
 * a large, self-inflicted dev-only slowdown. Keeping this helper separate lets
 * Fast Refresh hot-swap the graph normally.
 */
export function collectSiblings(excludeProfileId: string | null): SiblingSubject[] {
  const { reports } = useXIntelStore.getState()
  const { accounts } = useXSelfStore.getState()
  const out: SiblingSubject[] = []
  const seen = new Set<string>()

  for (const report of Object.values(reports)) {
    const p = report.profile
    if (!p || p.id === excludeProfileId || seen.has(p.id)) continue
    seen.add(p.id)
    out.push({ id: p.id, username: p.username, avatarUrl: p.avatarUrl || null, edges: report.edges ?? [] })
  }
  for (const account of Object.values(accounts)) {
    const p = account.profile
    if (!p || p.id === excludeProfileId || seen.has(p.id)) continue
    seen.add(p.id)
    out.push({ id: p.id, username: p.username, avatarUrl: p.avatarUrl || null, edges: account.edges })
  }
  return out
}
