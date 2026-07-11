import { useComposeStore } from '../../stores/compose-store'
import type { PreferredFormat } from '../../lib/compose/format'
import { PREFERRED_FORMATS } from '../../lib/compose/format'
import { Label, PillGroup } from '../ui/shared'

export function FormatPreference({ title = 'Preferred format' }: { title?: string }) {
  const preferredFormat = useComposeStore((s) => s.preferredFormat)
  const setPreferredFormat = useComposeStore((s) => s.setPreferredFormat)
  return (
    <div>
      <Label title="Auto lets the model choose. Your override persists.">{title}</Label>
      <PillGroup
        ariaLabel="Preferred draft format"
        options={PREFERRED_FORMATS}
        value={preferredFormat}
        onChange={(v) => setPreferredFormat(v as PreferredFormat)}
      />
    </div>
  )
}
