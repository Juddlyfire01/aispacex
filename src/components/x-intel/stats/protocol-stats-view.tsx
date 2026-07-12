import { useRef, useState } from 'react'
import { useVeniceCharts, useVeniceMetrics } from '../../../hooks/use-venicestats'
import type { VeniceChartPeriod, VeniceMetrics } from '../../../lib/venicestats/types'
import { fmtPct, fmtRatio, fmtToken, fmtUnitUsd, fmtUsd, fmtChartAxis, relUpdated } from '../../../lib/venicestats/format'
import { LoadingState, ViewLoadingFallback, VIEW_LOADING_LABEL } from '../../ui/spinner'
import { ChartCard, KpiCard, LineChart, monthlyBurnChartSeries, normalizeChartSeries, PeriodPicker, StatsSection } from './stats-ui'

const VENICESTATS_HOME = 'https://venicestats.com'

function deltaFromPct(n: number) {
  return { text: fmtPct(n), positive: n > 0 ? true : n < 0 ? false : undefined }
}

function VvvSection({
  m,
  period,
  updated,
  onPeriodChange,
}: {
  m: VeniceMetrics
  period: VeniceChartPeriod
  updated?: string
  onPeriodChange: (period: VeniceChartPeriod) => void
}) {
  const charts = useVeniceCharts(period)
  return (
    <StatsSection
      title="VVV Token"
      tip="Core VVV price, supply, and market metrics from VeniceStats on-chain data."
      titleExtra={
        updated ? (
          <span className="text-[11px] text-[var(--color-text-secondary)] shrink-0">
            · Updated {updated}
          </span>
        ) : null
      }
      href={VENICESTATS_HOME}
    >
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <KpiCard
          label="VVV Price"
          value={fmtUnitUsd(m.vvvPrice)}
          delta={deltaFromPct(m.priceChange24h)}
          tip="Spot USD price of VVV from on-chain DEX activity on Base."
        />
        <KpiCard
          label="Market Cap"
          value={fmtUsd(m.marketCap)}
          sub={`FDV ${fmtUsd(m.fdv)}`}
          tip="Circulating market cap and fully diluted valuation at the current VVV price."
        />
      </div>
      <ChartCard title="VVV Price (USD)" tip="Historical VVV spot price over the selected time range.">
        {charts.isPending ? (
          <LoadingState className="h-[140px]" label="Loading…" size="sm" />
        ) : (
          <LineChart data={charts.data?.vvvPrice ?? []} formatY={(n, range) => fmtChartAxis(n, { prefix: '$', range })} />
        )}
      </ChartCard>
      <div className="flex justify-end">
        <PeriodPicker value={period} onChange={onPeriodChange} />
      </div>
    </StatsSection>
  )
}

function DiemSection({ m, period }: { m: VeniceMetrics; period: VeniceChartPeriod }) {
  const charts = useVeniceCharts(period)
  const discountPct = m.marketDiscount * 100
  return (
    <StatsSection title="DIEM" tip="DIEM pricing, supply, and stake-backed mint economics." href={`${VENICESTATS_HOME}/diem`}>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <KpiCard
          label="DIEM Price"
          value={fmtUnitUsd(m.diemPrice)}
          delta={deltaFromPct(m.diemPriceChange24h)}
          tip="Secondary-market USD price of DIEM, Venice's staked-compute token."
        />
        <KpiCard
          label="Supply"
          value={fmtToken(m.diemSupply, 'DIEM')}
          sub={`${fmtRatio(m.diemStakeRatio)} staked · mint ${fmtToken(m.mintRate, 'sVVV/DIEM')}`}
          tip="Total DIEM in circulation, how much is staked, and the current sVVV required to mint one DIEM."
        />
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <KpiCard label="Mint cost" value={fmtUnitUsd(m.mintCostUsd)} sub="at current rate" tip="USD cost to mint one DIEM by locking sVVV at today's mint rate." />
        <KpiCard label="Market discount" value={`${discountPct.toFixed(1)}%`} sub="vs mint cost" tip="How much cheaper (or pricier) DIEM trades versus minting it from sVVV." />
        <KpiCard label="Break-even" value={`${m.diemBreakEvenDays}d`} sub="at current prices" tip="Estimated days of compute use before a newly minted DIEM pays back its mint cost." />
        <KpiCard label="Remaining mintable" value={fmtToken(m.remainingMintable, 'DIEM', 2)} tip="DIEM that can still be minted before the protocol supply cap is reached." />
      </div>
      <ChartCard title="DIEM Price (USD)" tip="Historical DIEM secondary-market price over the selected time range.">
        {charts.isPending ? (
          <LoadingState className="h-[140px]" label="Loading…" size="sm" />
        ) : (
          <LineChart data={charts.data?.diemPrice ?? []} color="#60a5fa" formatY={(n, range) => fmtChartAxis(n, { prefix: '$', range })} />
        )}
      </ChartCard>
    </StatsSection>
  )
}

function StakingSection({ m, period }: { m: VeniceMetrics; period: VeniceChartPeriod }) {
  const charts = useVeniceCharts(period)
  return (
    <StatsSection title="Staking & Locking" tip="How much VVV is staked, locked, and earning yield." href={`${VENICESTATS_HOME}/staking`}>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <KpiCard
          label="Total Staked"
          value={fmtToken(m.totalStaked, 'sVVV')}
          sub={`${fmtRatio(m.stakingRatio)} of circulating`}
          tip="VVV deposited into the staking contract as sVVV, as a share of circulating supply."
        />
        <KpiCard
          label="sVVV Locked"
          value={fmtToken(m.svvvLocked)}
          sub={`${fmtRatio(m.lockRatio)} locked for DIEM`}
          tip="sVVV committed to mint DIEM and not available to unstake until unlocked."
        />
        <KpiCard
          label="sVVV Unlocked"
          value={fmtToken(m.svvvUnlocked)}
          sub="can unstake (7d cooldown)"
          tip="Staked sVVV that is free to unstake, subject to the seven-day cooldown."
        />
        <KpiCard
          label="Emissions"
          value={`${fmtToken(m.emissionPerYear)}/yr`}
          sub={`APR ${m.stakerApr.toFixed(1)}%`}
          tip="New VVV emitted to stakers per year and the current staking APR."
        />
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <KpiCard label="Net flow (7d)" value={fmtToken(m.netFlow7d, 'VVV', 2)} delta={deltaFromPct(m.stakingGrowth7d)} tip="Net VVV moved into or out of staking over the last seven days." />
        <KpiCard label="Growth 30d" value={fmtPct(m.stakingGrowth30d)} tip="Percentage change in total staked sVVV over the last thirty days." />
        <KpiCard label="New stakers (7d)" value={String(m.newStakers7dCount)} sub={`${m.activeWallets7dCount} active wallets`} tip="Wallets that newly staked this week and wallets with recent staking activity." />
        <KpiCard label="Cooldown wave" value={fmtToken(m.cooldownVvv, 'VVV')} sub={`${m.cooldownWallets} wallets`} tip="VVV currently in the unstaking cooldown queue across all wallets." />
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-2">
        <ChartCard title="Staking Ratio" tip="Share of circulating VVV held as sVVV over time.">
          {charts.isPending ? (
            <LoadingState className="h-[140px]" label="Loading…" size="sm" />
          ) : (
            <LineChart data={charts.data?.stakingRatio ?? []} color="#34d399" formatY={(n, range) => fmtChartAxis(n, { pct: true, range })} />
          )}
        </ChartCard>
        <ChartCard title="Total Staked (sVVV)" tip="Total sVVV supply staked on-chain over time.">
          {charts.isPending ? (
            <LoadingState className="h-[140px]" label="Loading…" size="sm" />
          ) : (
            <LineChart data={charts.data?.totalStaked ?? []} color="#34d399" formatY={(n, range) => fmtChartAxis(n, { range })} />
          )}
        </ChartCard>
      </div>
    </StatsSection>
  )
}

function BurnsSection({ m, period }: { m: VeniceMetrics; period: VeniceChartPeriod }) {
  const charts = useVeniceCharts(period)
  const monthlyCharts = useVeniceCharts('all')
  const prog = m.programmaticBurns
  const latestMonthly = m.monthlyBurns[0]
  return (
    <StatsSection title="Burns" tip="VVV permanently removed from supply via organic burns and buybacks." href={`${VENICESTATS_HOME}/burns`}>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <KpiCard
          label="Organic burns"
          value={fmtUsd(m.organicBurned * m.vvvPrice)}
          sub={`${fmtToken(m.organicBurned, 'VVV')} lifetime`}
          tip="Discretionary and one-off VVV burns outside the subscription buyback program."
        />
        <KpiCard
          label="Buy-and-burn pace"
          value={`${fmtUsd(m.burnUsdValueAnnualized)}/yr`}
          sub={`Venice rev est. ${fmtUsd(m.veniceRevenue)}/yr`}
          tip="Annualized USD value of Venice's monthly on-chain buy-and-burn program."
        />
        <KpiCard
          label="Pro sub burns"
          value={`~${Math.round(prog.dailyRate)}/day`}
          delta={deltaFromPct(prog.growth24h)}
          tip="Average daily Pro-tier subscription buybacks that purchase and burn VVV on-chain."
        />
        <KpiCard
          label="Latest monthly burn"
          value={latestMonthly ? fmtUsd(latestMonthly.usd) : '—'}
          sub={latestMonthly ? `${fmtToken(latestMonthly.vvv, 'VVV')} · ${latestMonthly.month}` : undefined}
          tip="Most recent completed monthly buy-and-burn cycle in USD and VVV burned."
        />
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-2">
        <ChartCard title="Pro Sub Burns (daily)" tip="Daily USD spent on Pro subscription VVV buybacks.">
          {charts.isPending ? (
            <LoadingState className="h-[140px]" label="Loading…" size="sm" />
          ) : (
            <LineChart data={normalizeChartSeries(charts.data?.burns, 'programmaticUsd')} color="#f97316" formatY={(n, range) => fmtChartAxis(n, { prefix: '$', range })} />
          )}
        </ChartCard>
        <ChartCard title="Monthly Buy-and-Burn (USD)" tip="Completed monthly discretionary buy-and-burn spend in USD. Current month omitted until the burn executes.">
          {monthlyCharts.isPending ? (
            <LoadingState className="h-[140px]" label="Loading…" size="sm" />
          ) : (
            <LineChart data={monthlyBurnChartSeries(monthlyCharts.data?.burnsMonthly, period)} color="#ef4444" formatY={(n, range) => fmtChartAxis(n, { prefix: '$', range })} />
          )}
        </ChartCard>
      </div>
    </StatsSection>
  )
}

export function ProtocolStatsView() {
  const [period, setPeriod] = useState<VeniceChartPeriod>('30d')
  const metrics = useVeniceMetrics()
  const charts = useVeniceCharts(period)
  // First navigation only: keep Suspense’s labeled shell until metrics + charts
  // both resolve. Later period changes keep the page mounted (section spinners).
  const initialReady = useRef(false)
  if (!metrics.isPending && !charts.isPending) initialReady.current = true

  if (!initialReady.current && (metrics.isPending || charts.isPending)) {
    return <ViewLoadingFallback label={VIEW_LOADING_LABEL.stats} />
  }

  if (metrics.isError || !metrics.data) {
    return (
      <div className="flex flex-1 items-center justify-center min-h-0 px-6 text-center">
        <div className="space-y-2 max-w-sm">
          <p className="text-[13px] text-[var(--color-text-primary)]">Could not load Venice protocol data</p>
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
  const updated = relUpdated(m.priceLastUpdated ?? m.lastUpdated)

  return (
    <div className="flex flex-col flex-1 min-h-0 overflow-y-auto">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-5 space-y-8">
        <VvvSection m={m} period={period} updated={updated} onPeriodChange={setPeriod} />
        <DiemSection m={m} period={period} />
        <StakingSection m={m} period={period} />
        <BurnsSection m={m} period={period} />

        <footer className="pt-2 pb-4 border-t border-[var(--color-border-faint)]">
          <p className="text-[10px] text-[var(--color-text-secondary)] leading-relaxed">
            Data compiled by{' '}
            <a href={VENICESTATS_HOME} target="_blank" rel="noopener noreferrer" className="entity-link text-[10px]">
              VeniceStats
            </a>{' '}
            (venicestats.com) through on-chain analysis. May contain inaccuracies — verify critical data independently.
          </p>
        </footer>
      </div>
    </div>
  )
}
