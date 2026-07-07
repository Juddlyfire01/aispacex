import { useEffect } from 'react'
import { bootstrapXOAuthReturn } from '../lib/x-intel/self-orchestrate'

/** Reconcile the X OAuth session on every app load; handle OAuth redirect params. */
export function useXOAuthBootstrap() {
  useEffect(() => {
    void bootstrapXOAuthReturn()
  }, [])
}
