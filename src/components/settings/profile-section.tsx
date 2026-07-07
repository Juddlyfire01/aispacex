import { useSettingsStore } from '../../stores/settings-store'
import { Label } from '../ui/shared'

export function ProfileSection() {
  const profileName = useSettingsStore((s) => s.profileName)
  const setProfileName = useSettingsStore((s) => s.setProfileName)

  const initials = profileName.trim()
    .split(/\s+/).filter(Boolean).slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '').join('') || 'A'

  return (
    <div className="flex flex-col gap-6 max-w-md">
      <div className="flex items-center gap-4">
        <div className="flex items-center justify-center w-16 h-16 rounded-full bg-transparent text-[var(--color-text-primary)] text-[22px] font-semibold border border-[var(--color-border-soft)]">
          {initials}
        </div>
        <div className="flex flex-col">
          <span className="text-[15px] font-semibold text-[var(--color-text-primary)]">
            {profileName.trim() || 'Anon'}
          </span>
          <span className="text-[12px] text-[var(--color-text-tertiary)]">Local profile</span>
        </div>
      </div>

      <div>
        <Label htmlFor="profile-name">Display name</Label>
        <input
          id="profile-name"
          value={profileName}
          onChange={(e) => setProfileName(e.target.value)}
          placeholder="Your name"
          maxLength={48}
          className="w-full bg-[var(--color-bg-input)] border border-[var(--color-border-soft)] rounded-lg px-3 py-2.5 text-[15px] text-[var(--color-text-primary)] outline-none focus:border-[var(--color-border-strong)] transition-colors placeholder:text-[var(--color-text-placeholder)]"
        />
      </div>
    </div>
  )
}
