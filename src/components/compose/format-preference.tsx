import { useComposeStore } from '../../stores/compose-store'
import type { PreferredFormat } from '../../lib/compose/format'
import { PREFERRED_FORMATS } from '../../lib/compose/format'
import { Label, PillGroup } from '../ui/shared'

const FORMAT_TOOLTIP =
  'Auto lets the model choose per draft (pill stays Auto). Lock Post, Thread, Long-form, or Article to force that shape for this thread.'

export function FormatPreference({
  threadId,
  title = 'Format',
}: {
  threadId: string
  title?: string
}) {
  const preferredFormat = useComposeStore(
    (s) => s.threads[threadId]?.preferredFormat ?? 'auto',
  )
  const setPreferredFormat = useComposeStore((s) => s.setPreferredFormat)
  return (
    <div>
      <Label title={FORMAT_TOOLTIP}>{title}</Label>
      <PillGroup
        ariaLabel="Draft format"
        options={PREFERRED_FORMATS}
        value={preferredFormat}
        onChange={(v) => setPreferredFormat(threadId, v as PreferredFormat)}
      />
    </div>
  )
}
