import { useXSelfStore } from '../stores/x-self-store'
import { isVerifiedProfile } from '../lib/compose/verified-features'

/** Verification state for the active connected X account (compose gating). */
export function useComposeVerified() {
  const connected = useXSelfStore((s) => s.connected)
  const profile = useXSelfStore((s) =>
    s.activeAccountId ? s.accounts[s.activeAccountId]?.profile ?? null : null,
  )

  return {
    connected,
    isVerified: isVerifiedProfile(profile),
    verifiedType: profile?.verified.type ?? null,
  }
}

export function getActiveAccountVerified(): boolean {
  const { activeAccountId, accounts } = useXSelfStore.getState()
  if (!activeAccountId) return false
  return isVerifiedProfile(accounts[activeAccountId]?.profile)
}
