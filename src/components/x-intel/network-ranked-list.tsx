import { useMemo } from 'react'
import type { EdgeKind, NetworkGraphModel, GraphNode } from '../../lib/x-intel/network-build'
import type { Post } from '../../lib/x-intel/types'
import { kindTint } from './network-kind-colors'
import { EvidencePosts } from './evidence-posts'
import { cn } from '../../lib/utils'

const KIND_ORDER: EdgeKind[] = ['mention', 'reply', 'quote', 'retweet']

/** Green <24h, amber <7d, grey older — mirrors ActivityGlance's recency read. */
function recencyDotClass(iso: string): string {
  const h = (Date.now() - new Date(iso).getTime()) / 3_600_000
  if (h < 24) return 'bg-green-400/70'
  if (h < 24 * 7) return 'bg-amber-400/70'
  return 'bg-white/25'
}

function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime()
  const d = Math.floor(ms / 86_400_000)
  if (d > 30) return `${Math.floor(d / 30)}mo`
  if (d > 0) return `${d}d`
  const h = Math.floor(ms / 3_600_000)
  if (h > 0) return `${h}h`
  return 'now'
}

/** Deterministic hue for accounts without a known avatar (matches the map). */
function hash01(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return ((h >>> 0) % 10000) / 10000
}

export interface NetworkRankedListProps {
  model: NetworkGraphModel
  direction?: 'outbound' | 'inbound'
  posts?: Post[]
  onJumpToPost?: (postId: string) => void
  onNodeClick?: (username: string) => void
}

/**
 * Ranked stacked-bar list — a legible alternative to the bubble map.
 *
 * One row per account, ordered by total engagement. Each row shows the
 * avatar, handle, a recency dot, a stacked bar of the mention/reply/quote/retweet
 * split (bar length ∝ weight, normalized to the heaviest account), and the total.
 * Expandable source posts reuse the report EvidencePosts pattern.
 */
export function NetworkRankedList({
  model,
  direction = 'outbound',
  posts = [],
  onJumpToPost,
  onNodeClick,
}: NetworkRankedListProps) {
  const maxWeight = useMemo(
    () => Math.max(1, ...model.nodes.map((n) => n.totalWeight)),
    [model.nodes],
  )

  const headline = direction === 'inbound'
    ? <>Who engages <b className="text-white/75 font-medium">@{model.center.username}</b></>
    : <>Who <b className="text-white/75 font-medium">@{model.center.username}</b> engages</>

  return (
    <div className="h-full overflow-y-auto px-4 py-2">
      {/* Header: direction headline + legend */}
      <div className="flex items-center gap-2 pb-2 mb-1 border-b border-white/[0.06]">
        <span className="text-[11px] text-white/45">{headline}</span>
        <div className="flex-1" />
        <div className="flex items-center gap-2.5">
          {KIND_ORDER.map((k) => (
            <span key={k} className="flex items-center gap-1 text-[9px] text-white/40 uppercase tracking-wide">
              <span className="w-2 h-2 rounded-[2px]" style={{ background: kindTint(k) }} />
              {k}
            </span>
          ))}
        </div>
      </div>

      <ul className="space-y-0.5">
        {model.nodes.map((n) => (
          <AccountRow
            key={n.id}
            node={n}
            maxWeight={maxWeight}
            posts={posts}
            onJumpToPost={onJumpToPost}
            onClick={onNodeClick}
          />
        ))}
      </ul>

      {(model.longTailCount > 0 || model.unresolvedCount > 0) && (
        <div className="mt-2 pt-2 border-t border-white/[0.06] text-[10px] text-white/30 font-mono">
          {model.longTailCount > 0 && (
            <span>+{model.longTailCount} more accounts ({model.longTailWeight} interactions) below the cap</span>
          )}
          {model.longTailCount > 0 && model.unresolvedCount > 0 && <span> · </span>}
          {model.unresolvedCount > 0 && <span>{model.unresolvedCount} unresolved</span>}
        </div>
      )}
    </div>
  )
}

interface AccountRowProps {
  node: GraphNode
  maxWeight: number
  posts: Post[]
  onJumpToPost?: (postId: string) => void
  onClick?: (username: string) => void
}

function AccountRow({ node, maxWeight, posts, onJumpToPost, onClick }: AccountRowProps) {
  const clickable = !!node.username && !!onClick
  const barPct = (Math.sqrt(node.totalWeight) / Math.sqrt(maxWeight)) * 100
  const hue = Math.floor(hash01(node.username || '?') * 360)
  const sources = node.sourcePostIds ?? []

  return (
    <li className="rounded-md px-1.5 py-1 hover:bg-white/[0.02]">
      <button
        type="button"
        disabled={!clickable}
        onClick={() => clickable && onClick!(node.username)}
        className={cn(
          'group w-full flex items-center gap-2.5 text-left transition-colors',
          clickable ? 'cursor-pointer' : 'cursor-default',
        )}
        title={clickable ? `Add @${node.username} as a profile to analyze` : `@${node.username}`}
      >
        {/* Avatar / initial */}
        <span className="shrink-0 relative w-7 h-7">
          {node.avatarUrl
            ? (
              <img
                src={node.avatarUrl}
                alt=""
                className="w-7 h-7 rounded-full object-cover ring-1 ring-white/10"
              />
            )
            : (
              <span
                className="w-7 h-7 rounded-full grid place-items-center text-[11px] font-semibold ring-1 ring-white/10"
                style={{ background: `hsl(${hue} 40% 22%)`, color: `hsl(${hue} 70% 78%)` }}
              >
                {(node.username[0] ?? '?').toUpperCase()}
              </span>
            )}
          <span
            className={cn('absolute -bottom-0 -right-0 w-2 h-2 rounded-full ring-2 ring-[var(--color-bg-base,#000)]', recencyDotClass(node.lastSeen))}
            title={`last seen ${timeAgo(node.lastSeen)} ago`}
          />
        </span>

        {/* Handle + bar */}
        <span className="flex-1 min-w-0">
          <span className="flex items-center gap-1.5">
            <span className="text-[12px] text-white/80 truncate group-hover:text-white/95">@{node.username}</span>
            <span className="text-[9px] text-white/25 font-mono shrink-0">{timeAgo(node.lastSeen)}</span>
          </span>
          <span className="mt-0.5 flex h-2 w-full items-center gap-px">
            <StackedBar node={node} widthPct={barPct} />
          </span>
        </span>

        {/* Total weight + per-kind counts on hover */}
        <span className="shrink-0 w-14 text-right">
          <span className="block text-[12px] tabular-nums text-white/70 font-medium">{node.totalWeight}</span>
          <span className="block text-[9px] text-white/25 font-mono truncate opacity-0 group-hover:opacity-100 transition-opacity">
            {breakdownShort(node)}
          </span>
        </span>
      </button>

      {sources.length > 0 && onJumpToPost && (
        <div className="pl-9 pr-1">
          <EvidencePosts ids={sources} posts={posts} onJumpToPost={onJumpToPost} label="source post" />
        </div>
      )}
    </li>
  )
}

/** The stacked segment bar. Total width ∝ sqrt(weight); segments ∝ kind share. */
function StackedBar({ node, widthPct }: { node: GraphNode; widthPct: number }) {
  return (
    <span
      className="flex h-2 items-stretch gap-px rounded-full overflow-hidden"
      style={{ width: `${Math.max(4, widthPct)}%` }}
    >
      {KIND_ORDER.map((k) => {
        const v = node.byKind[k]
        if (v <= 0) return null
        const pct = (v / node.totalWeight) * 100
        return (
          <span
            key={k}
            style={{ width: `${pct}%`, background: kindTint(k) }}
            title={`${k} ×${v}`}
          />
        )
      })}
    </span>
  )
}

function breakdownShort(n: GraphNode): string {
  return KIND_ORDER
    .filter((k) => n.byKind[k] > 0)
    .map((k) => `${k[0]}${n.byKind[k]}`)
    .join(' ')
}
