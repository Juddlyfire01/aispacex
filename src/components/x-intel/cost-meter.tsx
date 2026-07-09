import { useEffect, useRef, useState } from 'react'
import { useXIntelStore } from '../../stores/x-intel-store'
import { useVeniceCostStore } from '../../stores/venice-cost-store'
import { useSettingsStore } from '../../stores/settings-store'
import { VeniceKeysMark, XMark } from '../ui/brand-marks'
import { RAIL_FOOTER_CLASS, RAIL_FOOTER_STACK_CLASS } from '../layout/rail-footer'
import { cn } from '../../lib/utils'

export type CostProviderView = 'x' | 'venice' | 'combined'

const VIEWS: { id: CostProviderView; title: string }[] = [
  { id: 'combined', title: 'Combined Costs' },
  { id: 'x', title: 'X API Costs' },
  { id: 'venice', title: 'Venice API Costs' },
]

/** One half of the Y-flip (out to edge / in from edge). */
const FLIP_HALF_MS = 160

/**
 * Fixed stage for every face (X / Venice / Both) and every flip frame.
 * Content is object-fit contain — never changes outer size.
 */
const MARK_STAGE_CLASS = 'h-[14px] w-[32px]'

function nextView(current: CostProviderView): CostProviderView {
  const i = VIEWS.findIndex((v) => v.id === current)
  return VIEWS[(i + 1) % VIEWS.length]!.id
}

/**
 * Glyphs fill the same stage. Even pixel sizes only — odd widths (e.g. 13)
 * center at half-pixels in a 32px stage and look like a 1px horizontal jump.
 * Venice is optically larger than X (keys read smaller at equal box size).
 */
function ProviderFace({ view, theme }: { view: CostProviderView; theme: string }) {
  if (view === 'x') {
    return <XMark theme={theme} className="h-[12px] w-[12px] object-contain opacity-90" />
  }
  if (view === 'venice') {
    return <VeniceKeysMark className="h-[14px] w-[14px] object-contain opacity-90" />
  }
  return (
    <span className="flex h-full w-full items-center justify-center gap-0.5">
      <XMark theme={theme} className="h-[12px] w-[12px] object-contain opacity-90" />
      <VeniceKeysMark className="h-[14px] w-[12px] object-contain opacity-90" />
    </span>
  )
}

/**
 * Y-axis flip on a single persistent element (no remount).
 * Out → 90° (invisible edge) → swap face → in to 0°.
 * Remounting via key mid-flip was re-centering odd-width faces and causing a 1px glitch.
 */
function FlipProviderMark({ view, theme }: { view: CostProviderView; theme: string }) {
  const reduceMotion = useSettingsStore((s) => s.reduceMotion)
  const [display, setDisplay] = useState(view)
  /** Degrees of rotateY on the stable transform layer. */
  const [angle, setAngle] = useState(0)
  const [animating, setAnimating] = useState(false)
  const displayRef = useRef(display)
  const animatingRef = useRef(false)
  const targetRef = useRef(view)
  const timers = useRef<ReturnType<typeof setTimeout>[]>([])

  displayRef.current = display
  animatingRef.current = animating

  const clearTimers = () => {
    for (const t of timers.current) clearTimeout(t)
    timers.current = []
  }

  const runFlipTo = (next: CostProviderView) => {
    clearTimers()
    setAnimating(true)
    // 1) rotate out to edge (face still old)
    setAngle(90)
    const t1 = setTimeout(() => {
      // 2) swap while edge-on (invisible), snap to opposite edge without transition
      setDisplay(next)
      setAngle(-90)
      // 3) next frame: animate in to 0
      const t2 = setTimeout(() => {
        setAngle(0)
        const t3 = setTimeout(() => {
          setAnimating(false)
          if (targetRef.current !== next) {
            runFlipTo(targetRef.current)
          }
        }, FLIP_HALF_MS)
        timers.current.push(t3)
      }, 16)
      timers.current.push(t2)
    }, FLIP_HALF_MS)
    timers.current.push(t1)
  }

  useEffect(() => {
    targetRef.current = view

    if (reduceMotion) {
      clearTimers()
      setDisplay(view)
      setAngle(0)
      setAnimating(false)
      return
    }

    if (view === displayRef.current) return
    if (animatingRef.current) return

    runFlipTo(view)
    return clearTimers
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, reduceMotion])

  useEffect(() => () => clearTimers(), [])

  // After snap to -90, only enable transition when moving toward 0 or 90
  const transition =
    animating && (angle === 90 || angle === 0)
      ? `transform ${FLIP_HALF_MS}ms ${angle === 90 ? 'ease-in' : 'ease-out'}`
      : 'none'

  return (
    <span
      className={cn(MARK_STAGE_CLASS, 'relative block shrink-0')}
      style={{ perspective: 160, perspectiveOrigin: '50% 50%' }}
    >
      <span
        className={cn(
          MARK_STAGE_CLASS,
          'absolute inset-0 flex items-center justify-center',
        )}
        style={{
          transform: `rotateY(${angle}deg)`,
          transformOrigin: '50% 50%',
          transformStyle: 'preserve-3d',
          backfaceVisibility: 'hidden',
          transition,
          willChange: animating ? 'transform' : undefined,
        }}
      >
        <ProviderFace view={display} theme={theme} />
      </span>
    </span>
  )
}

export function CostMeter({ defaultView = 'x' }: { defaultView?: CostProviderView } = {}) {
  const [view, setView] = useState<CostProviderView>(defaultView)
  const theme = useSettingsStore((s) => s.theme)

  const xSession = useXIntelStore((s) => s.sessionCost)
  const xLifetime = useXIntelStore((s) => s.lifetimeTotal)
  const vSession = useVeniceCostStore((s) => s.sessionCost)
  const vLife = useVeniceCostStore((s) => s.lifetimeTotal)

  const session =
    view === 'x' ? xSession : view === 'venice' ? vSession : xSession + vSession
  const total = view === 'x' ? xLifetime : view === 'venice' ? vLife : xLifetime + vLife

  const activeMeta = VIEWS.find((v) => v.id === view)!

  return (
    <div
      className={cn(RAIL_FOOTER_CLASS, 'relative cursor-pointer select-none')}
      role="button"
      tabIndex={0}
      title={activeMeta.title}
      aria-label={activeMeta.title}
      onClick={() => setView((v) => nextView(v))}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          setView((v) => nextView(v))
        }
      }}
    >
      {/* Logos live on top, centered — never in the Session row */}
      <div className="pointer-events-none absolute inset-x-0 top-1.5 z-10 flex justify-center">
        <FlipProviderMark view={view} theme={theme} />
      </div>

      <div className={cn(RAIL_FOOTER_STACK_CLASS, 'relative')}>
        <div className="flex h-[13px] items-center justify-between gap-1.5 text-[9px] leading-none text-[var(--color-text-tertiary)]">
          <span className="shrink-0" title="This load">
            Session
          </span>
          <span className="font-mono tabular-nums shrink-0">${session.toFixed(3)}</span>
        </div>
        <div className="flex h-[15px] items-center justify-between gap-1.5 text-[11px] leading-none text-[var(--color-text-secondary)]">
          <span className="shrink-0" title="All time">
            Total
          </span>
          <span className="font-mono shrink-0 tabular-nums">${total.toFixed(3)}</span>
        </div>

        <div
          className="pointer-events-none absolute inset-x-0 bottom-0 flex h-2.5 items-end justify-center gap-1.5"
          role="group"
          aria-label="Source"
        >
          {VIEWS.map((v) => {
            const active = view === v.id
            return (
              <button
                key={v.id}
                type="button"
                title={v.title}
                aria-label={v.title}
                aria-pressed={active}
                onClick={(e) => {
                  e.stopPropagation()
                  setView(v.id)
                }}
                className="pointer-events-auto flex h-2.5 w-2.5 items-end justify-center p-0"
              >
                <span
                  className={cn(
                    'rounded-full transition-all',
                    active
                      ? 'h-1.5 w-1.5 bg-[var(--color-text-primary)]'
                      : 'h-1 w-1 bg-[var(--color-text-tertiary)] opacity-45 hover:opacity-80',
                  )}
                />
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}
