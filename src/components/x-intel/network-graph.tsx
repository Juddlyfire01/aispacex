import { useMemo, useState } from 'react'
import { ReactFlow, Background, Controls, type Node, type Edge as FlowEdge } from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { useXIntelStore } from '../../stores/x-intel-store'
import { useXSelfStore } from '../../stores/x-self-store'
import { runGather, refreshPosts, refreshNetworkWithMentions } from '../../lib/x-intel/orchestrate'
import { SectionRefresh, SectionEmpty } from './section-actions'
import { canGatherTarget } from '../../lib/x-intel/fields'
import type { Edge, Profile } from '../../lib/x-intel/types'
import { cn } from '../../lib/utils'

function readToken(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || '#111114'
}

const KIND_COLORS: Record<Edge['kind'], string> = {
  mention: '#60a5fa',
  reply: '#34d399',
  quote: '#c084fc',
  retweet: '#fbbf24',
}

const KINDS: Edge['kind'][] = ['mention', 'reply', 'quote', 'retweet']

export interface NetworkGraphInnerProps {
  profile: Profile | null
  edges: Edge[]
  /** Active subject label for empty-state copy (e.g. "@username"). */
  subjectLabel: string
  connected: boolean
  canGather: boolean
  refreshing: null | 'posts' | 'mentions'
  refreshError: string | null
  onRefresh: (mode: 'posts' | 'mentions') => void
  /** Called when a node is clicked; the inner graph handles the confirm/UX. */
  onAddTarget?: (username: string) => void
  /** Whether to offer "+ Mentions" / "Add as target" affordances. */
  canAddTargets: boolean
  lastGatheredIso?: string
}

/** Presentational network graph — props-driven so it can be wired to either a
 *  target or the connected self account. */
export function NetworkGraphInner({
  profile, edges, subjectLabel, connected, canGather, refreshing, refreshError,
  onRefresh, onAddTarget, canAddTargets, lastGatheredIso,
}: NetworkGraphInnerProps) {
  const [kindFilter, setKindFilter] = useState<Set<Edge['kind']>>(new Set(KINDS))
  const [minWeight, setMinWeight] = useState(2)

  const filteredEdges = useMemo(
    () => edges.filter((e) => kindFilter.has(e.kind) && e.weight >= minWeight),
    [edges, kindFilter, minWeight],
  )

  const { nodes, flowEdges } = useMemo(() => {
    if (!profile) return { nodes: [] as Node[], flowEdges: [] as FlowEdge[] }

    const maxWeight = Math.max(1, ...filteredEdges.map((e) => e.weight))
    const nodes: Node[] = [{
      id: profile.id,
      position: { x: 0, y: 0 },
      data: { label: `@${profile.username}` },
      style: { background: '#fff', color: '#000', fontSize: 12, fontWeight: 600, borderRadius: 999, padding: '6px 14px', border: 'none' },
    }]

    // circular layout around the pinned-center subject
    // De-duplicate node IDs: the same target can appear across multiple edge kinds
    const placed = new Set<string>([profile.id])
    let placedCount = 0
    filteredEdges.forEach((e) => {
      if (placed.has(e.target)) return // node already placed; edge still wires to it
      placed.add(e.target)
      const angle = (2 * Math.PI * placedCount) / filteredEdges.length
      const radius = 260
      const size = 10 + (e.weight / maxWeight) * 16
      nodes.push({
        id: e.target,
        position: { x: Math.cos(angle) * radius, y: Math.sin(angle) * radius },
        data: { label: e.targetUsername ? `@${e.targetUsername}` : `unknown (${e.target.slice(0, 12)}…)` },
        style: {
          background: readToken('--color-bg-raised'), color: readToken('--color-text-secondary'), fontSize: size,
          borderRadius: 999, padding: '4px 10px', border: `1px solid ${KIND_COLORS[e.kind]}55`,
        },
      })
      placedCount++
    })

    const flowEdges: FlowEdge[] = filteredEdges.map((e) => ({
      id: `${e.kind}-${e.target}`,
      source: profile!.id,
      target: e.target,
      label: `${e.kind} × ${e.weight}`,
      style: { stroke: KIND_COLORS[e.kind], strokeWidth: Math.min(1 + e.weight, 6), opacity: 0.6 },
      labelStyle: { fill: 'rgba(255,255,255,0.35)', fontSize: 9 },
    }))

    return { nodes, flowEdges }
  }, [profile, filteredEdges])

  // No graph yet: nothing gathered, no profile, or gathered posts had no references.
  if (!profile || edges.length === 0) {
    return (
      <SectionEmpty
        title="No network gathered yet"
        hint={canGather
          ? `Build ${subjectLabel}'s graph from their posts, or pull who's mentioning them.`
          : 'Connect your X account first (header → Connect X).'}
        actionLabel="Gather from posts"
        onAction={() => onRefresh('posts')}
        busy={refreshing === 'posts'}
        disabled={!canGather}
        error={refreshError}
        secondaryLabel="+ Mentions"
        onSecondary={() => onRefresh('mentions')}
        secondaryBusy={refreshing === 'mentions'}
      />
    )
  }

  const unresolved = edges.filter((e) => !e.targetUsername && e.target.startsWith('post:'))

  const onNodeClick = (_: unknown, node: Node) => {
    const label = String(node.data.label)
    if (!label.startsWith('@') || node.id === profile!.id) return
    if (!canAddTargets || !onAddTarget) return
    const username = label.slice(1)
    if (!connected) {
      alert('Connect your X account (header → Connect X) to add new targets from the network graph.')
      return
    }
    if (confirm(`Add @${username} as a new intel target?`)) {
      onAddTarget(username)
    }
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-2 px-4 py-1.5 border-b border-[var(--color-border-faint)] text-[10px]">
        {KINDS.map((k) => (
          <button
            key={k}
            onClick={() => setKindFilter((s) => {
              const next = new Set(s)
              if (next.has(k)) next.delete(k); else next.add(k)
              return next
            })}
            className={cn(
              'px-2 py-[2px] rounded-full font-medium transition-all border',
              kindFilter.has(k) ? 'text-[var(--color-text-primary)]' : 'text-[var(--color-text-tertiary)] opacity-60',
            )}
            style={{ borderColor: `${KIND_COLORS[k]}55` }}
          >
            {k}
          </button>
        ))}
        <label className="flex items-center gap-1 text-[var(--color-text-tertiary)] ml-2">
          weight ≥
          <input
            type="number" min={1} value={minWeight}
            onChange={(e) => setMinWeight(Math.max(1, Number(e.target.value)))}
            className="w-10 bg-[var(--color-bg-input)] border border-[var(--color-border-soft)] rounded px-1 py-px text-[var(--color-text-secondary)] outline-none"
          />
        </label>
        <div className="flex-1" />
        {unresolved.length > 0 && (
          <span className="text-[var(--color-text-tertiary)]">{unresolved.length} unresolved (quote/reply targets need a post lookup — future)</span>
        )}
        {canAddTargets && (
          <button
            onClick={() => onRefresh('mentions')}
            disabled={!!refreshing || !canGather}
            title="Pull who's mentioning this subject"
            className="text-[10px] font-medium px-2 py-1 rounded-md border border-[var(--color-border-soft)] text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:border-[var(--color-border-strong)] transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
          >
            {refreshing === 'mentions' ? 'Pulling…' : '+ Mentions'}
          </button>
        )}
        <SectionRefresh
          onClick={() => onRefresh('posts')}
          busy={refreshing === 'posts'}
          disabled={!canGather}
          lastGatheredIso={lastGatheredIso}
          error={refreshError}
        />
      </div>
      <div className="flex-1 min-h-0">
        <ReactFlow
          nodes={nodes}
          edges={flowEdges}
          onNodeClick={onNodeClick}
          fitView
          colorMode="dark"
          proOptions={{ hideAttribution: true }}
        >
          <Background color="rgba(255,255,255,0.04)" />
          <Controls />
        </ReactFlow>
      </div>
    </div>
  )
}

/** Target-side wrapper: pulls the active target's data from useXIntelStore. */
export function NetworkGraph() {
  const activeTarget = useXIntelStore((s) => s.activeTarget)
  const report = useXIntelStore((s) => (s.activeTarget ? s.reports[s.activeTarget] : undefined))
  const addTarget = useXIntelStore((s) => s.addTarget)
  const connected = useXSelfStore((s) => s.connected)
  const [refreshing, setRefreshing] = useState<null | 'posts' | 'mentions'>(null)
  const [refreshError, setRefreshError] = useState<string | null>(null)

  const runRefresh = async (mode: 'posts' | 'mentions') => {
    if (!activeTarget) return
    setRefreshing(mode)
    setRefreshError(null)
    try {
      await (mode === 'mentions' ? refreshNetworkWithMentions(activeTarget) : refreshPosts(activeTarget))
    } catch (e) {
      setRefreshError(e instanceof Error ? e.message : 'Refresh failed')
    } finally {
      setRefreshing(null)
    }
  }

  const canGather = canGatherTarget(activeTarget, connected)

  if (!activeTarget || !report) {
    return <div className="flex items-center justify-center h-full text-[12px] text-white/15">No target selected</div>
  }

  const lastGathered = report.refreshedAt?.network ?? report.posts[0]?.gatheredAt

  const onAddTarget = (username: string) => {
    addTarget(username)
    runGather(username).catch(() => { /* surfaced in target rail */ })
  }

  return (
    <NetworkGraphInner
      profile={report.profile}
      edges={report.edges ?? []}
      subjectLabel={`@${activeTarget}`}
      connected={connected}
      canGather={canGather}
      refreshing={refreshing}
      refreshError={refreshError}
      onRefresh={runRefresh}
      onAddTarget={onAddTarget}
      canAddTargets
      lastGatheredIso={lastGathered}
    />
  )
}
