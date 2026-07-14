import { useDeferredValue, useEffect, useMemo, useRef, useState, useCallback } from 'react'
import {
  forceSimulation, forceManyBody, forceCollide, forceRadial, forceLink, forceX, forceY,
  type SimulationNodeDatum, type SimulationLinkDatum,
} from 'd3-force'
import type { EdgeKind, NetworkGraphModel, GraphNode, CrossLink } from '../../lib/x-intel/network-build'
import { kindTint } from './network-kind-colors'

export { KIND_COLORS, kindTint, KIND_TINT_ALPHA } from './network-kind-colors'

const CENTER_R = 34
const MIN_R = 14
const MAX_R = 46
const LABEL_MIN_R = 20

interface SimNode extends SimulationNodeDatum {
  id: string
  node: GraphNode | null // null = center
  r: number
}

interface LaidOutNode {
  id: string
  node: GraphNode | null
  r: number
  x: number
  y: number
}

/** Deterministic pseudo-random from a string — stable initial angles. */
function hash01(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return ((h >>> 0) % 10000) / 10000
}

function hueFor(username: string): number {
  return Math.floor(hash01(username || '?') * 360)
}

/** sqrt-scaled bubble radius. */
function radiusFor(weight: number, maxWeight: number): number {
  const t = Math.sqrt(weight) / Math.sqrt(Math.max(1, maxWeight))
  return MIN_R + t * (MAX_R - MIN_R)
}

/** Run the force simulation synchronously to a settled, frozen layout. */
function layoutGraph(model: NetworkGraphModel): LaidOutNode[] {
  const maxWeight = Math.max(1, ...model.nodes.map((n) => n.totalWeight))

  const center: SimNode = { id: model.center.id, node: null, r: CENTER_R, x: 0, y: 0, fx: 0, fy: 0 }
  const simNodes: SimNode[] = [center, ...model.nodes.map((n) => {
    const r = radiusFor(n.totalWeight, maxWeight)
    // Heavier accounts start (and are pulled) closer to the center.
    const tier = 170 + (n.rank / Math.max(1, model.nodes.length - 1)) * 260
    const angle = hash01(n.id) * Math.PI * 2
    return {
      id: n.id, node: n, r,
      x: Math.cos(angle) * tier,
      y: Math.sin(angle) * tier,
    }
  })]

  const byId = new Map(simNodes.map((n) => [n.id, n]))
  const links: SimulationLinkDatum<SimNode>[] = model.crossLinks
    .filter((l) => byId.has(l.a) && byId.has(l.b))
    .map((l) => ({ source: l.a, target: l.b }))

  const n = model.nodes.length
  const sim = forceSimulation(simNodes)
    .force('charge', forceManyBody().strength(-120))
    .force('radial', forceRadial(
      (d) => {
        const sn = d as SimNode
        if (!sn.node) return 0
        return 170 + (sn.node.rank / Math.max(1, n - 1)) * 260
      },
    ).strength(0.55))
    .force('collide', forceCollide<SimNode>().radius((d) => d.r + 14).strength(0.9))
    .force('x', forceX(0).strength(0.02))
    .force('y', forceY(0).strength(0.02))
    .stop()

  if (links.length > 0) {
    sim.force('link', forceLink<SimNode, SimulationLinkDatum<SimNode>>(links)
      .id((d) => d.id)
      .distance(120)
      .strength(0.25))
  }

  sim.tick(300)

  return simNodes.map((sn) => ({ id: sn.id, node: sn.node, r: sn.r, x: sn.x ?? 0, y: sn.y ?? 0 }))
}

/** Quadratic path from a→b bowing slightly outward, trimmed to bubble edges. */
function curvePath(ax: number, ay: number, ar: number, bx: number, by: number, br: number, bow: number): string {
  const dx = bx - ax
  const dy = by - ay
  const len = Math.hypot(dx, dy) || 1
  const ux = dx / len
  const uy = dy / len
  // trim endpoints to circle borders
  const sx = ax + ux * ar
  const sy = ay + uy * ar
  const ex = bx - ux * br
  const ey = by - uy * br
  // control point offset perpendicular to the chord
  const mx = (sx + ex) / 2 - uy * bow
  const my = (sy + ey) / 2 + ux * bow
  return `M ${sx.toFixed(1)} ${sy.toFixed(1)} Q ${mx.toFixed(1)} ${my.toFixed(1)} ${ex.toFixed(1)} ${ey.toFixed(1)}`
}

function formatBreakdown(n: GraphNode): string {
  const parts: string[] = []
  for (const k of ['mention', 'reply', 'quote', 'retweet'] as EdgeKind[]) {
    if (n.byKind[k] > 0) parts.push(`${k} ×${n.byKind[k]}`)
  }
  return parts.join(' · ')
}

function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime()
  const d = Math.floor(ms / 86400000)
  if (d > 30) return `${Math.floor(d / 30)}mo ago`
  if (d > 0) return `${d}d ago`
  const h = Math.floor(ms / 3600000)
  if (h > 0) return `${h}h ago`
  return 'recently'
}

export interface NetworkBubbleMapProps {
  model: NetworkGraphModel
  onNodeClick?: (username: string) => void
}

interface Viewport { x: number; y: number; k: number }

export function NetworkBubbleMap({ model, onNodeClick }: NetworkBubbleMapProps) {
  const svgRef = useRef<SVGSVGElement>(null)
  const [viewport, setViewport] = useState<Viewport>({ x: 0, y: 0, k: 1 })
  const [size, setSize] = useState<{ w: number; h: number }>({ w: 0, h: 0 })
  const [hovered, setHovered] = useState<string | null>(null)
  const dragRef = useRef<{ startX: number; startY: number; vx: number; vy: number; moved: boolean } | null>(null)

  // Track container size so the world origin can sit at the visual center.
  useEffect(() => {
    const el = svgRef.current
    if (!el) return
    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect
      setSize({ w: width, h: height })
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // Defer layout so filter/slider changes stay responsive; keep the prior graph visible.
  const layoutModel = useDeferredValue(model)
  const laidOut = useMemo(() => layoutGraph(layoutModel), [layoutModel])
  const layoutPending = layoutModel !== model
  const nodeById = useMemo(() => new Map(laidOut.map((n) => [n.id, n])), [laidOut])

  // Fit the settled layout into view on model change.
  useEffect(() => {
    const el = svgRef.current
    if (!el || laidOut.length === 0) return
    const xs = laidOut.map((n) => Math.abs(n.x) + n.r)
    const ys = laidOut.map((n) => Math.abs(n.y) + n.r)
    const extent = Math.max(120, ...xs, ...ys) + 60
    const { width, height } = el.getBoundingClientRect()
    const k = Math.min(1.4, Math.min(width, height) / (extent * 2))
    setViewport({ x: 0, y: 0, k: k > 0 ? k : 1 })
  }, [laidOut])

  const onWheel = useCallback((e: React.WheelEvent<SVGSVGElement>) => {
    const el = svgRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    const px = e.clientX - rect.left - rect.width / 2
    const py = e.clientY - rect.top - rect.height / 2
    setViewport((v) => {
      const k = Math.min(4, Math.max(0.2, v.k * (e.deltaY < 0 ? 1.15 : 1 / 1.15)))
      const scale = k / v.k
      return { k, x: px - (px - v.x) * scale, y: py - (py - v.y) * scale }
    })
  }, [])

  const onPointerDown = useCallback((e: React.PointerEvent<SVGSVGElement>) => {
    ;(e.currentTarget as Element).setPointerCapture?.(e.pointerId)
    dragRef.current = { startX: e.clientX, startY: e.clientY, vx: viewport.x, vy: viewport.y, moved: false }
  }, [viewport.x, viewport.y])

  const onPointerMove = useCallback((e: React.PointerEvent<SVGSVGElement>) => {
    const d = dragRef.current
    if (!d) return
    const dx = e.clientX - d.startX
    const dy = e.clientY - d.startY
    if (Math.abs(dx) + Math.abs(dy) > 3) d.moved = true
    setViewport((v) => ({ ...v, x: d.vx + dx, y: d.vy + dy }))
  }, [])

  const movedRef = useRef(false)
  const onPointerUp = useCallback(() => {
    movedRef.current = dragRef.current?.moved ?? false
    dragRef.current = null
  }, [])

  const handleNodeClick = useCallback((username: string) => {
    if (movedRef.current) { movedRef.current = false; return }
    onNodeClick?.(username)
  }, [onNodeClick])

  // Connectivity for hover dimming: hovered node + its direct connections stay lit.
  const litIds = useMemo(() => {
    if (!hovered) return null
    const lit = new Set<string>([hovered, model.center.id])
    for (const l of model.crossLinks) {
      if (l.a === hovered) lit.add(l.b)
      if (l.b === hovered) lit.add(l.a)
    }
    return lit
  }, [hovered, model])

  const hoveredNode = hovered ? nodeById.get(hovered) : null

  return (
    <div className="relative w-full h-full overflow-hidden">
      {layoutPending && (
        <div className="pointer-events-none absolute inset-0 z-[1] bg-[var(--color-bg-base)]/20" aria-hidden />
      )}
      <svg
        ref={svgRef}
        className="w-full h-full cursor-grab active:cursor-grabbing select-none"
        onWheel={onWheel}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={onPointerUp}
      >
        <g transform={`translate(${size.w / 2 + viewport.x}, ${size.h / 2 + viewport.y}) scale(${viewport.k})`}>
          <SpokeLayer model={model} nodeById={nodeById} litIds={litIds} />
          <CrossLinkLayer model={model} nodeById={nodeById} litIds={litIds} hovered={hovered} />
          <BubbleLayer
            model={model}
            laidOut={laidOut}
            litIds={litIds}
            hovered={hovered}
            onHover={setHovered}
            onNodeClick={handleNodeClick}
          />
        </g>
      </svg>
      {hoveredNode?.node && <Tooltip node={hoveredNode.node} />}
    </div>
  )
}

interface LayerProps {
  model: NetworkGraphModel
  nodeById: Map<string, LaidOutNode>
  litIds: Set<string> | null
}

/** Center → account curves, colored by dominant kind, width by weight. */
function SpokeLayer({ model, nodeById, litIds }: LayerProps) {
  const center = nodeById.get(model.center.id)
  if (!center) return null
  const maxWeight = Math.max(1, ...model.spokes.map((s) => s.totalWeight))
  return (
    <g>
      {model.spokes.map((s) => {
        const n = nodeById.get(s.nodeId)
        if (!n) return null
        const lit = !litIds || litIds.has(s.nodeId)
        const t = Math.sqrt(s.totalWeight / maxWeight)
        const bow = 18 + hash01(s.nodeId) * 26
        return (
          <path
            key={s.nodeId}
            d={curvePath(center.x, center.y, CENTER_R, n.x, n.y, n.r, bow)}
            fill="none"
            stroke={kindTint(s.dominantKind)}
            strokeWidth={0.8 + t * 3.2}
            opacity={lit ? 0.55 + t * 0.4 : 0.1}
            style={{ transition: 'opacity 150ms' }}
          />
        )
      })}
    </g>
  )
}

interface BubbleLayerProps {
  model: NetworkGraphModel
  laidOut: LaidOutNode[]
  litIds: Set<string> | null
  hovered: string | null
  onHover: (id: string | null) => void
  onNodeClick?: (username: string) => void
}

function BubbleLayer({ model, laidOut, litIds, hovered, onHover, onNodeClick }: BubbleLayerProps) {
  return (
    <g>
      {laidOut.map((n) => (
        n.node
          ? (
            <AccountBubble
              key={n.id}
              laid={n}
              node={n.node}
              lit={!litIds || litIds.has(n.id)}
              hovered={hovered === n.id}
              onHover={onHover}
              onClick={onNodeClick}
            />
          )
          : <CenterBubble key={n.id} center={model.center} laid={n} />
      ))}
    </g>
  )
}

interface AccountBubbleProps {
  laid: LaidOutNode
  node: GraphNode
  lit: boolean
  hovered: boolean
  onHover: (id: string | null) => void
  onClick?: (username: string) => void
}

function AccountBubble({ laid, node, lit, hovered, onHover, onClick }: AccountBubbleProps) {
  const clipId = `clip-${node.id.replace(/[^a-zA-Z0-9_-]/g, '_')}`
  const hue = hueFor(node.username)
  const kindColor = kindTint(node.dominantKind)
  const showLabel = laid.r >= LABEL_MIN_R || hovered
  const clickable = !!node.username && !!onClick
  return (
    <g
      transform={`translate(${laid.x}, ${laid.y})`}
      opacity={lit ? 1 : 0.15}
      style={{ transition: 'opacity 150ms', cursor: clickable ? 'pointer' : 'default' }}
      onMouseEnter={() => onHover(node.id)}
      onMouseLeave={() => onHover(null)}
      onClick={() => { if (clickable) onClick!(node.username) }}
    >
      <circle r={laid.r + 2.5} fill="none" stroke={kindColor} strokeWidth={hovered ? 2 : 1.2} opacity={hovered ? 0.9 : 0.45} />
      {node.avatarUrl
        ? (
          <>
            <circle r={laid.r} fill="rgba(255,255,255,0.06)" />
            <clipPath id={clipId}><circle r={laid.r - 1} /></clipPath>
            <image
              href={node.avatarUrl}
              x={-(laid.r - 1)} y={-(laid.r - 1)}
              width={(laid.r - 1) * 2} height={(laid.r - 1) * 2}
              clipPath={`url(#${clipId})`}
              preserveAspectRatio="xMidYMid slice"
            />
          </>
        )
        : (
          <>
            <circle r={laid.r} fill={`hsl(${hue} 40% 22%)`} />
            <text textAnchor="middle" dominantBaseline="central" fontSize={Math.max(10, laid.r * 0.8)} fontWeight={600} fill={`hsl(${hue} 70% 78%)`}>
              {(node.username[0] ?? '?').toUpperCase()}
            </text>
          </>
        )}
      {showLabel && (
        <text y={laid.r + 12} textAnchor="middle" fontSize={10} fill={hovered ? 'rgba(255,255,255,0.95)' : 'rgba(255,255,255,0.55)'}>
          @{node.username}
        </text>
      )}
    </g>
  )
}

function Tooltip({ node }: { node: GraphNode }) {
  return (
    <div className="absolute top-3 left-3 z-10 pointer-events-none rounded-lg border border-[var(--color-border-soft)] bg-[var(--color-bg-raised)]/95 px-3 py-2 shadow-lg max-w-[260px]">
      <div className="text-[12px] font-semibold text-[var(--color-text-primary)]">@{node.username}</div>
      <div className="text-[11px] mt-0.5" style={{ color: kindTint(node.dominantKind) }}>
        {formatBreakdown(node)}
      </div>
      <div className="text-[10px] mt-0.5 text-[var(--color-text-tertiary)]">
        {node.totalWeight} interactions · last seen {timeAgo(node.lastSeen)}
      </div>
    </div>
  )
}

function CenterBubble({ center, laid }: { center: NetworkGraphModel['center']; laid: LaidOutNode }) {
  const clipId = `clip-center-${center.id}`
  return (
    <g transform={`translate(${laid.x}, ${laid.y})`}>
      <circle r={CENTER_R + 4} fill="none" stroke="rgba(255,255,255,0.25)" strokeWidth={1} />
      <circle r={CENTER_R} fill="#fff" />
      {center.avatarUrl && (
        <>
          <clipPath id={clipId}><circle r={CENTER_R - 2} /></clipPath>
          <image
            href={center.avatarUrl}
            x={-(CENTER_R - 2)} y={-(CENTER_R - 2)}
            width={(CENTER_R - 2) * 2} height={(CENTER_R - 2) * 2}
            clipPath={`url(#${clipId})`}
            preserveAspectRatio="xMidYMid slice"
          />
        </>
      )}
      {!center.avatarUrl && (
        <text textAnchor="middle" dominantBaseline="central" fontSize={20} fontWeight={700} fill="#000">
          {(center.username[0] ?? '?').toUpperCase()}
        </text>
      )}
      <text y={CENTER_R + 16} textAnchor="middle" fontSize={12} fontWeight={600} fill="rgba(255,255,255,0.9)">
        @{center.username}
      </text>
    </g>
  )
}

/** Account ↔ account links: dimmer, dashed, so the ego structure stays primary. */
function CrossLinkLayer({ model, nodeById, litIds, hovered }: LayerProps & { hovered: string | null }) {
  if (model.crossLinks.length === 0) return null
  const maxW = Math.max(1, ...model.crossLinks.map((l) => l.weight))
  return (
    <g>
      {model.crossLinks.map((l: CrossLink) => {
        const a = nodeById.get(l.a)
        const b = nodeById.get(l.b)
        if (!a || !b) return null
        const touchesHover = hovered !== null && (l.a === hovered || l.b === hovered)
        const lit = !litIds || touchesHover
        const t = Math.sqrt(l.weight / maxW)
        return (
          <path
            key={`${l.a}|${l.b}`}
            d={curvePath(a.x, a.y, a.r, b.x, b.y, b.r, 12)}
            fill="none"
            stroke="#94a3b8"
            strokeWidth={0.7 + t * 1.8}
            strokeDasharray="4 4"
            opacity={lit ? (touchesHover ? 0.55 : 0.18 + t * 0.15) : 0.04}
            style={{ transition: 'opacity 150ms' }}
          />
        )
      })}
    </g>
  )
}
