import { useComposeStore } from '../../stores/compose-store'
import type { PreferredFormat } from '../../lib/compose/format'
import { PREFERRED_FORMATS } from '../../lib/compose/format'
import { Label, PillGroup } from '../ui/shared'

export function FormatPreference({
  threadId,
  title = 'Preferred format',
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
      <Label title="Auto lets the model choose. Your override persists for this thread.">
        {title}
      </Label>
      <PillGroup
        ariaLabel="Preferred draft format"
        options={PREFERRED_FORMATS}
        value={preferredFormat}
        onChange={(v) => setPreferredFormat(threadId, v as PreferredFormat)}
      />
    </div>
  )
}
