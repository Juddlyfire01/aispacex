import { cn } from '../../lib/utils'
import { useSettingsStore } from '../../stores/settings-store'

const gradientAiClass =
  'bg-gradient-to-r from-blue-400 via-purple-500 to-pink-500 text-transparent bg-clip-text bg-[length:200%_200%] drop-shadow-[0_0_15px_rgba(147,51,234,0.5)]'

const gradientAiStyle = {
  WebkitBackgroundClip: 'text' as const,
  WebkitTextFillColor: 'transparent',
  willChange: 'background-position' as const,
  backfaceVisibility: 'hidden' as const,
  transition: 'color 0s, opacity 0s',
}

/** Animated AiSpace wordmark — mirrors the aispace Navbar inline brand. */
export function AppWordmark({ className }: { className?: string }) {
  const reduceMotion = useSettingsStore((s) => s.reduceMotion)

  return (
    <span
      className={cn(
        'font-orbitron tracking-tight font-bold inline-flex items-center whitespace-nowrap',
        className,
      )}
      aria-label="AiSpace"
    >
      <span
        className={cn(
          gradientAiClass,
          !reduceMotion && 'animate-gradient-x [animation-duration:3s] [animation-delay:0s]',
        )}
        style={gradientAiStyle}
      >
        Ai
      </span>
      <span
        className="ml-0.5 drop-shadow-[0_0_8px_rgba(255,255,255,0.3)] text-[var(--color-text-primary)]"
      >
        Space
      </span>
    </span>
  )
}

/** Product brand for expanded chrome (sidebar, empty states, dialogs). */
export function AppBrand({
  className,
  wordmarkClassName,
}: {
  className?: string
  /** @deprecated Ignored — brand is wordmark-only now. */
  logoSize?: number
  wordmarkClassName?: string
}) {
  return (
    <span className={cn('inline-flex items-center min-w-0', className)}>
      <AppWordmark className={cn('text-[15px]', wordmarkClassName)} />
    </span>
  )
}
