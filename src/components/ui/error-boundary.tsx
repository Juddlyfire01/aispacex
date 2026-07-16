import { Component, useState, type ErrorInfo, type ReactNode } from 'react'

interface Props {
  children: ReactNode
  fallback?: (props: { error: Error; reset: () => void }) => ReactNode
  onError?: (error: Error, info: ErrorInfo) => void
}

interface State {
  error: Error | null
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    if (this.props.onError) this.props.onError(error, info)
    console.error('[IntelX ErrorBoundary]', error, info)
  }

  reset = () => this.setState({ error: null })

  render() {
    if (this.state.error) {
      if (this.props.fallback) {
        return this.props.fallback({ error: this.state.error, reset: this.reset })
      }
      return <DefaultFallback error={this.state.error} reset={this.reset} />
    }
    return this.props.children
  }
}

function formatErrorText(error: Error): string {
  return [error.message, error.stack].filter(Boolean).join('\n\n')
}

function CopyIcon({ className }: { className?: string }) {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
      <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
    </svg>
  )
}

// eslint-disable-next-line react-refresh/only-export-components
function DefaultFallback({ error, reset }: { error: Error; reset: () => void }) {
  const [copied, setCopied] = useState(false)
  const detail = formatErrorText(error)

  const handleCopy = () => {
    void navigator.clipboard.writeText(detail).then(
      () => {
        setCopied(true)
        window.setTimeout(() => setCopied(false), 2000)
      },
      () => {
        /* clipboard blocked */
      },
    )
  }

  return (
    <div className="flex flex-col items-center justify-center h-full px-6 text-center" role="alert">
      <div className="max-w-md w-full">
        <div className="text-[20px] font-semibold text-white/85 mb-2">Something went wrong</div>
        <p className="text-[14px] text-white/40 mb-4">
          The app hit an unexpected error and couldn&apos;t render this view. Your work is safe — refresh to recover.
        </p>
        <details className="mb-5 text-left">
          <summary className="text-[13px] text-white/30 cursor-pointer hover:text-white/55">
            Show details
          </summary>
          <div className="relative mt-2">
            <pre className="text-[12px] text-red-300/70 bg-white/[0.03] border border-white/[0.06] rounded-lg p-3 pr-10 overflow-auto max-h-40 whitespace-pre-wrap break-words">
              {detail}
            </pre>
            <button
              type="button"
              onClick={handleCopy}
              title={copied ? 'Copied' : 'Copy error'}
              aria-label={copied ? 'Error copied' : 'Copy error details'}
              className="absolute top-2 right-2 p-1.5 rounded-md text-white/35 hover:text-white/70 hover:bg-white/[0.06] transition-colors"
            >
              {copied ? (
                <span className="text-[10px] font-medium text-[var(--color-accent)]">Copied</span>
              ) : (
                <CopyIcon />
              )}
            </button>
          </div>
        </details>
        <div className="flex gap-2 justify-center">
          <button
            type="button"
            onClick={reset}
            className="px-4 py-2 text-[14px] font-medium rounded-md bg-[var(--color-btn-primary-bg)] text-[var(--color-btn-primary-fg)] hover:opacity-90 transition-opacity"
          >
            Try again
          </button>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="px-4 py-2 text-[14px] font-medium border border-white/[0.1] text-white/60 hover:text-white/80 hover:border-white/[0.2] rounded-md transition-colors"
          >
            Reload page
          </button>
        </div>
      </div>
    </div>
  )
}
