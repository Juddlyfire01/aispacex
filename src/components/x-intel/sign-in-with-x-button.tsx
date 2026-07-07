import { cn } from '../../lib/utils'

/** X-branded OAuth entry point — black pill, white 𝕏 mark, official copy. */
export function SignInWithXButton({
  onClick,
  className,
  disabled,
}: {
  onClick: () => void
  className?: string
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'inline-flex items-center justify-center gap-2.5 min-w-[220px] px-5 py-2.5',
        'text-[13px] font-bold tracking-[0.01em] bg-black text-white rounded-full',
        'hover:bg-neutral-900 transition-colors',
        'focus-visible:outline focus-visible:outline-2 focus-visible:outline-white focus-visible:outline-offset-2',
        'disabled:opacity-50 disabled:cursor-not-allowed',
        className,
      )}
    >
      <img src="/x-logo.svg" alt="" className="h-[15px] w-auto shrink-0" aria-hidden />
      Sign in with X
    </button>
  )
}
