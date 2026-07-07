import { useBuzzMetrics, useSocial } from '../../hooks/use-venicestats'
import { LoadingState } from '../ui/spinner'
import { StatsSection } from '../x-intel/stats/stats-ui'
import { PulseStrip, MoodBadge, computePulse } from './pulse-strip'
import { MomentumChart } from './momentum-chart'
import { TopVoices } from './top-voices'
import { BuzzFeed } from './buzz-feed'
import { SentimentGauges } from './sentiment-gauges'

const VENICESTATS_BUZZ = 'https://venicestats.com/buzz'
const VENICESTATS_HOME = 'https://venicestats.com'

export function SignalView() {
  const metrics = useBuzzMetrics(52)
  const social = useSocial()

  if (metrics.isLoading) {
    return (
      <div className="flex flex-1 items-center justify-center min-h-0">
        <LoadingState size="md" />
      </div>
    )
  }

  if (metrics.isError || !metrics.data) {
    return (
      <div className="flex flex-1 items-center justify-center min-h-0 px-6 text-center">
        <div className="space-y-2 max-w-sm">
          <p className="text-[13px] text-[var(--color-text-primary)]">Could not load Venice community data</p>
          <p className="text-[11px] text-[var(--color-text-secondary)]">
            {metrics.error instanceof Error ? metrics.error.message : 'VeniceStats API unreachable'}
          </p>
          <button
            type="button"
            onClick={() => metrics.refetch()}
            className="text-[11px] text-[var(--color-accent)] hover:underline"
          >
            Retry
          </button>
        </div>
      </div>
    )
  }

  const m = metrics.data
  const pulse = computePulse(m)

  return (
    <div className="flex flex-col flex-1 min-h-0 overflow-y-auto">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-5 space-y-8 w-full">
        <StatsSection title="Pulse" titleExtra={<MoodBadge mood={pulse.mood} />} href={VENICESTATS_BUZZ}>
          <PulseStrip m={m} social={social.data} />
        </StatsSection>

        <StatsSection title="Narrative Momentum" href={VENICESTATS_BUZZ}>
          <MomentumChart m={m} />
        </StatsSection>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-x-6 gap-y-8 items-start">
          <StatsSection title="Top Voices" href={VENICESTATS_BUZZ}>
            <TopVoices authors={m.topAuthors} />
          </StatsSection>

          <StatsSection title="Sentiment" href={VENICESTATS_HOME}>
            {social.isLoading ? (
              <LoadingState className="h-32" />
            ) : social.data ? (
              <SentimentGauges social={social.data} />
            ) : (
              <div className="flex items-center justify-center h-24 text-[11px] text-[var(--color-text-secondary)]">
                Could not load sentiment data
              </div>
            )}
          </StatsSection>
        </div>

        <StatsSection title="Buzz Feed" href={VENICESTATS_BUZZ}>
          <BuzzFeed />
        </StatsSection>

        <footer className="pt-2 pb-4 border-t border-[var(--color-border-faint)]">
          <p className="text-[10px] text-[var(--color-text-secondary)] leading-relaxed">
            Data compiled by{' '}
            <a href={VENICESTATS_HOME} target="_blank" rel="noopener noreferrer" className="text-[var(--color-accent)] hover:underline">
              VeniceStats
            </a>{' '}
            (venicestats.com) through on-chain analysis. May contain inaccuracies — verify critical data independently.
          </p>
        </footer>
      </div>
    </div>
  )
}
