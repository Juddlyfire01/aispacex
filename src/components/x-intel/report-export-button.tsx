import { useEffect, useRef, useState } from 'react'
import { downloadReport } from '../../lib/x-intel/export-report'
import type { IntelReportSnapshot, Post, Profile } from '../../lib/x-intel/types'
import { cn } from '../../lib/utils'

type ReportExportButtonProps = {
  snapshot: IntelReportSnapshot
  username: string
  profile?: Profile | null
  posts?: Post[]
  disabled?: boolean
}

export function ReportExportButton({ snapshot, username, profile, posts, disabled }: ReportExportButtonProps) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const close = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [open])

  const exportAs = (format: 'md' | 'json') => {
    downloadReport(snapshot, format, { username, profile, posts })
    setOpen(false)
  }

  return (
    <div className="relative" ref={rootRef}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        disabled={disabled}
        aria-haspopup="menu"
        aria-expanded={open}
        className="px-2.5 py-1 text-[11px] font-medium border border-white/10 text-white/70 rounded-md hover:border-white/20 hover:text-white/90 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
      >
        Export
      </button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full mt-1 z-20 min-w-[7.5rem] rounded-md border border-white/10 bg-[var(--color-bg-raised)] py-1 shadow-lg"
        >
          <button
            type="button"
            role="menuitem"
            onClick={() => exportAs('md')}
            className={cn(
              'block w-full px-3 py-1.5 text-left text-[11px] text-white/70 hover:bg-white/[0.05] hover:text-white/90 transition-colors',
            )}
          >
            Markdown
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => exportAs('json')}
            className={cn(
              'block w-full px-3 py-1.5 text-left text-[11px] text-white/70 hover:bg-white/[0.05] hover:text-white/90 transition-colors',
            )}
          >
            JSON
          </button>
        </div>
      )}
    </div>
  )
}
