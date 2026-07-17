import { useComposeStore } from '../../stores/compose-store'
import type { PostSegment } from '../../lib/compose/types'

// Poll body editor. Enable via + Poll on the segment / draft toolbar.

interface PollEditorProps {
  threadId: string
  segment: PostSegment
}

const DURATIONS = [
  { label: '1 hour', minutes: 60 },
  { label: '1 day', minutes: 1440 },
  { label: '3 days', minutes: 4320 },
  { label: '7 days', minutes: 10080 },
]

export function PollEditor({ threadId, segment }: PollEditorProps) {
  const patchSegment = useComposeStore((s) => s.patchSegment)
  const poll = segment.poll
  if (!poll) return null

  const setOption = (i: number, value: string) => {
    const options = poll.options.map((o, idx) => (idx === i ? value : o))
    patchSegment(threadId, segment.id, { poll: { ...poll, options } })
  }

  return (
    <div className="space-y-1.5 border border-[var(--color-border-faint)] rounded-lg p-2">
      {poll.options.map((opt, i) => (
        <div key={i} className="flex items-center gap-2">
          <input
            value={opt}
            onChange={(e) => setOption(i, e.target.value)}
            placeholder={`Choice ${i + 1}`}
            maxLength={25}
            className="flex-1 bg-[var(--color-bg-input)] border border-[var(--color-border-faint)] rounded px-2 py-1 text-[11px] text-white/70 outline-none focus:border-[var(--color-border-strong)]"
          />
          {poll.options.length > 2 && (
            <button
              onClick={() => patchSegment(threadId, segment.id, { poll: { ...poll, options: poll.options.filter((_, idx) => idx !== i) } })}
              className="text-[10px] text-white/25 hover:text-red-400/70 transition-colors"
            >
              ×
            </button>
          )}
        </div>
      ))}
      <div className="flex items-center gap-2 pt-1">
        {poll.options.length < 4 && (
          <button
            onClick={() => patchSegment(threadId, segment.id, { poll: { ...poll, options: [...poll.options, ''] } })}
            className="text-[10px] text-white/30 hover:text-white/60 transition-colors"
          >
            + Choice
          </button>
        )}
        <select
          value={poll.durationMinutes}
          onChange={(e) => patchSegment(threadId, segment.id, { poll: { ...poll, durationMinutes: Number(e.target.value) } })}
          className="bg-[var(--color-bg-input)] border border-[var(--color-border-faint)] rounded px-1.5 py-1 text-[10px] text-white/60 outline-none"
        >
          {DURATIONS.map((d) => (
            <option key={d.minutes} value={d.minutes}>{d.label}</option>
          ))}
        </select>
        <div className="flex-1" />
        <button
          onClick={() => patchSegment(threadId, segment.id, { poll: undefined })}
          className="text-[10px] text-white/25 hover:text-red-400/70 transition-colors"
        >
          Remove poll
        </button>
      </div>
    </div>
  )
}
