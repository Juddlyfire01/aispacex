import { useCallback, useMemo, useRef, useState } from 'react'
import { cn } from '../../lib/utils'
import type { VeniceDataPoint } from '../../lib/venicestats/types'

export interface ChartAnnotation {
  t: number
  label: string
}

/**
 * Interactive SVG line chart — no chart library dependency.
 *
 * Evolution of the old static LineChart: same axis-gutter layout and
 * viewBox scaling, plus a hover/touch crosshair with a value tooltip and
 * optional point annotations (spike callouts).
 */
export function InteractiveChart({
  data,
  color = 'var(--color-accent)',
  height = 140,
  className,
  formatY,
  formatValue,
  annotations,
}: {
  data: VeniceDataPoint[]
  color?: string
  height?: number
  className?: string
  formatY?: (n: number, range: number) => string
  /** Tooltip value formatter — defaults to formatY (or locale string). */
  formatValue?: (n: number) => string
  annotations?: ChartAnnotation[]
}) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const [hoverIdx, setHoverIdx] = useState<number | null>(null)

  const series = useMemo(
    () => data.filter((d) => Number.isFinite(d.t) && Number.isFinite(d.v)),
    [data],
  )

  // Fixed internal coordinate space; SVG stretches via preserveAspectRatio="none".
  const w = 400
  const h = height
  const pad = { t: 4, r: 4, b: 4, l: 4 }
  const innerW = w - pad.l - pad.r
  const innerH = h - pad.t - pad.b

  const { min, max, range } = useMemo(() => {
    const values = series.map((d) => d.v)
    const mn = values.length ? Math.min(...values) : 0
    const mx = values.length ? Math.max(...values) : 0
    return { min: mn, max: mx, range: mx - mn || mx * 0.01 || 1 }
  }, [series])

  const xAt = useCallback(
    (i: number) => pad.l + (i / Math.max(1, series.length - 1)) * innerW,
    [series.length, innerW, pad.l],
  )
  const yAt = useCallback(
    (v: number) => pad.t + innerH - ((v - min) / (max - min || range)) * innerH,
    [min, max, range, innerH, pad.t],
  )

  const points = useMemo(
    () => series.map((d, i) => `${xAt(i)},${yAt(d.v)}`),
    [series, xAt, yAt],
  )

  const annotationIdx = useMemo(() => {
    if (!annotations?.length || !series.length) return new Map<number, string>()
    const map = new Map<number, string>()
    for (const a of annotations) {
      let best = -1
      let bestDist = Infinity
      for (let i = 0; i < series.length; i++) {
        const dist = Math.abs(series[i].t - a.t)
        if (dist < bestDist) {
          bestDist = dist
          best = i
        }
      }
      if (best >= 0) map.set(best, a.label)
    }
    return map
  }, [annotations, series])

  const handlePointer = useCallback(
    (e: React.PointerEvent<SVGSVGElement>) => {
      if (!series.length) return
      const rect = e.currentTarget.getBoundingClientRect()
      // Map screen X back into the internal coordinate space (SVG is stretched).
      const fx = (e.clientX - rect.left) / rect.width
      const internalX = fx * w
      const t = (internalX - pad.l) / innerW
      const idx = Math.round(t * (series.length - 1))
      setHoverIdx(Math.max(0, Math.min(series.length - 1, idx)))
    },
    [series.length, innerW, pad.l],
  )

  const clearHover = useCallback(() => setHoverIdx(null), [])

  if (!series.length) {
    return (
      <div
        className={cn('flex items-center justify-center text-[11px] text-[var(--color-text-secondary)]', className)}
        style={{ height }}
      >
        No chart data
      </div>
    )
  }

  const label = formatY ?? ((n: number) => n.toLocaleString(undefined, { maximumFractionDigits: 2 }))
  const tooltipFmt = formatValue ?? ((n: number) => label(n, max - min || range))

  const tickCount = 4
  const ticks = Array.from({ length: tickCount }, (_, i) => {
    const f = i / (tickCount - 1)
    const value = max - f * (max - min)
    return { f, value, y: pad.t + innerH * f }
  })

  const start = new Date(series[0].t)
  const end = new Date(series[series.length - 1].t)
  const fmtDate = (d: Date) => d.toLocaleDateString([], { month: 'short', day: 'numeric' })

  const hover = hoverIdx != null ? series[hoverIdx] : null
  const hoverX = hoverIdx != null ? xAt(hoverIdx) : 0
  const hoverY = hover ? yAt(hover.v) : 0
  // Tooltip position as % of chart width — clamp so it doesn't overflow.
  const hoverPctX = (hoverX / w) * 100

  return (
    <div className={cn('w-full', className)}>
      <div className="flex gap-1.5" style={{ height }}>
        <div ref={wrapRef} className="relative flex-1 min-w-0 h-full">
          <svg
            viewBox={`0 0 ${w} ${h}`}
            className="w-full h-full touch-none"
            preserveAspectRatio="none"
            role="img"
            aria-label={titleFromData(series)}
            onPointerMove={handlePointer}
            onPointerDown={handlePointer}
            onPointerLeave={clearHover}
          >
            {ticks.slice(1, -1).map((t) => (
              <line
                key={t.f}
                x1={pad.l}
                x2={w - pad.r}
                y1={t.y}
                y2={t.y}
                stroke="var(--color-border-faint)"
                strokeWidth="1"
              />
            ))}
            <polyline
              fill="none"
              stroke={color}
              strokeWidth="1.75"
              strokeLinejoin="round"
              strokeLinecap="round"
              points={points.join(' ')}
              vectorEffect="non-scaling-stroke"
            />
            <polyline
              fill={color}
              fillOpacity="0.08"
              stroke="none"
              points={`${pad.l},${pad.t + innerH} ${points.join(' ')} ${pad.l + innerW},${pad.t + innerH}`}
            />
            {[...annotationIdx.keys()].map((i) => (
              <circle
                key={`ann-${i}`}
                cx={xAt(i)}
                cy={yAt(series[i].v)}
                r="3"
                fill="var(--color-bg-base)"
                stroke={color}
                strokeWidth="1.5"
                vectorEffect="non-scaling-stroke"
              />
            ))}
            {hover && (
              <>
                <line
                  x1={hoverX}
                  x2={hoverX}
                  y1={pad.t}
                  y2={pad.t + innerH}
                  stroke="var(--color-text-secondary)"
                  strokeWidth="1"
                  strokeDasharray="3 3"
                  vectorEffect="non-scaling-stroke"
                />
                <circle
                  cx={hoverX}
                  cy={hoverY}
                  r="3.5"
                  fill={color}
                  stroke="var(--color-bg-base)"
                  strokeWidth="1.5"
                  vectorEffect="non-scaling-stroke"
                />
              </>
            )}
          </svg>

          {hover && (
            <div
              className="absolute top-0 pointer-events-none z-10"
              style={{
                left: `${hoverPctX}%`,
                transform: `translateX(${hoverPctX > 65 ? '-100%' : hoverPctX < 15 ? '0%' : '-50%'})`,
              }}
            >
              <div className="rounded-md border border-[var(--color-border-soft)] bg-[var(--color-bg-raised)] px-2 py-1 shadow-lg whitespace-nowrap">
                <div className="text-[11px] font-mono font-semibold text-[var(--color-text-primary)] leading-tight">
                  {tooltipFmt(hover.v)}
                </div>
                <div className="text-[9px] text-[var(--color-text-secondary)] leading-tight">
                  {new Date(hover.t).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })}
                  {hoverIdx != null && annotationIdx.has(hoverIdx) && (
                    <span className="ml-1 text-[var(--color-accent)]">· {annotationIdx.get(hoverIdx)}</span>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        <div
          className="flex flex-col justify-between shrink-0 w-11 text-left leading-none"
          style={{ height: innerH, marginTop: pad.t, marginBottom: pad.b }}
        >
          {ticks.map((t) => (
            <span key={t.f} className="text-[9px] font-mono text-[var(--color-text-secondary)]">
              {label(t.value, max - min || range)}
            </span>
          ))}
        </div>
      </div>
      <div className="flex justify-between text-[9px] font-mono text-[var(--color-text-secondary)] mt-1 pr-12 pl-0.5">
        <span>{fmtDate(start)}</span>
        <span>{fmtDate(end)}</span>
      </div>
    </div>
  )
}

function titleFromData(data: VeniceDataPoint[]): string {
  if (data.length < 2) return 'Chart'
  const first = data[0]?.v
  const last = data[data.length - 1]?.v
  if (!Number.isFinite(first) || !Number.isFinite(last)) return 'Chart'
  const ch = first !== 0 ? ((last - first) / first) * 100 : 0
  return `Trend from ${first.toLocaleString()} to ${last.toLocaleString()} (${ch >= 0 ? '+' : ''}${ch.toFixed(1)}%)`
}
