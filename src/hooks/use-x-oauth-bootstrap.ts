import { useEffect } from 'react'
import { bootstrapXOAuthReturn, primeXOAuthReturnShell } from '../lib/x-intel/self-orchestrate'

/** Reconcile the X OAuth session on every app load; handle OAuth redirect params. */
export function useXOAuthBootstrap() {
  // Module-level prime usually already ran; re-run is a no-op when not pending.
  primeXOAuthReturnShell()
  useEffect(() => {
    void bootstrapXOAuthReturn()
  }, [])
}
