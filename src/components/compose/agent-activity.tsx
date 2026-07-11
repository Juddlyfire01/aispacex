import { useState } from 'react'
import type { AgentEvent } from '../../lib/compose/agent-events'

// Cursor-style agent activity timeline for compose chat:
// - Status indicator on top (shimmer while active)
// - Full step history listed under it (verb-first labels + result details)
// - Collapsible after the run so it stays in the transcript without dominating

function StepIcon({ status }: { status: AgentEvent['status'] }) {
  if (status === 'running') {
    return (
      <span className="inline-block w-2.5 h-2.5 rounded-full border border-white/25 border-t-white/70 animate-spin shrink-0" />
    )
  }
  if (status === 'error') {
    return (
      <svg viewBox="0 0 10 10" className="w-2.5 h-2.5 shrink-0 text-amber-400/70" fill="none">
        <path d="M5 2.2v3.2M5 7.4v.4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      </svg>
    )
  }
  return (
    <svg viewBox="0 0 10 10" className="w-2.5 h-2.5 shrink-0 text-white/35" fill="none">
      <path d="M2 5.2 4.2 7.4 8 2.8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function StepRow({ event }: { event: AgentEvent }) {
  // Progressive while live; past-tense once done (history + completed steps).
  const text =
    event.status === 'running' ? (event.progressLabel || event.label) : event.label
  return (
    <div className="flex items-center gap-2 py-[3px] min-w-0">
      <StepIcon status={event.status} />
      <span
        className={`text-[11.5px] truncate ${
          event.status === 'running' ? 'text-white/70' : 'text-white/40'
        }`}
      >
        {text}
      </span>
      {event.detail && (
        <span className="text-[10.5px] text-white/25 shrink-0">· {event.detail}</span>
      )}
    </div>
  )
}

interface AgentActivityProps {
  /** Steps for this turn (live store while streaming, message history after). */
  events: AgentEvent[]
  /** True while this run is still streaming. */
  active: boolean
  /** Top-level phase when no tool step is running ("Thinking", "Writing"). */
  phase?: string | null
}

/**
 * Live agent status + full step timeline for one assistant turn.
 * Renders nothing when there is no activity to show.
 */
export function AgentActivity({ events, active, phase = null }: AgentActivityProps) {
  // Historical turns start collapsed; live runs start open so the full list is visible.
  const [expanded, setExpanded] = useState(active)

  if (!active && events.length === 0) return null

  const running = events.filter((e) => e.status === 'running')
  const current = running[running.length - 1]
  // Prefer explicit phase (Thinking / Compressing thread / Writing) when set;
  // otherwise live header follows the active tool step.
  const headerText =
    active && phase
      ? phase
      : current
        ? current.progressLabel || current.label
        : active
          ? 'Working'
          : events.length === 1
            ? events[0]!.label
            : `${events.length} steps`

  // Live: always show full list under the indicator.
  // Done: collapsed to a one-line summary; expand reveals the same full history.
  const showList = active || expanded

  return (
    <div className="select-none max-w-[92%]">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex items-center gap-1.5 text-left hover:opacity-90 transition-opacity"
        aria-expanded={showList}
      >
        {!active && (
          <svg
            viewBox="0 0 10 10"
            className={`w-2 h-2 text-white/30 transition-transform shrink-0 ${showList ? 'rotate-90' : ''}`}
            fill="none"
          >
            <path
              d="M3.5 2 6.5 5 3.5 8"
              stroke="currentColor"
              strokeWidth="1.4"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        )}
        {active ? (
          <span className="text-[12px] font-medium shimmer-text">{headerText}…</span>
        ) : (
          <span className="text-[11px] text-white/30">
            {events.length === 0 ? headerText : `Worked through ${events.length} step${events.length === 1 ? '' : 's'}`}
          </span>
        )}
      </button>

      {showList && events.length > 0 && (
        <div className="mt-1.5 ml-0.5 pl-2.5 border-l border-white/[0.07]">
          {events.map((e) => (
            <StepRow key={e.id} event={e} />
          ))}
        </div>
      )}
    </div>
  )
}
