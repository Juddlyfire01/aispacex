export interface VeniceDataPoint {
  t: number
  v: number
}

export type VeniceChartPeriod = '7d' | '30d' | '90d' | '1y' | 'all'

export interface VeniceMetrics {
  vvvPrice: number
  priceChange24h: number
  vvvPriceChange7d: number
  marketCap: number
  fdv: number
  circulatingSupply: number
  burnedSupply: number
  diemPrice: number
  diemPriceChange24h: number
  diemPriceChange7d: number
  diemMarketCap: number
  diemFdv: number
  diemSupply: number
  diemStaked: number
  diemStakeRatio: number
  mintRate: number
  mintCostUsd: number
  marketDiscount: number
  diemBreakEvenDays: number
  remainingMintable: number
  totalStaked: number
  stakingRatio: number
  stakingRatioChange24h: number
  svvvLocked: number
  svvvUnlocked: number
  lockRatio: number
  emissionPerYear: number
  stakerApr: number
  stakingGrowth7d: number
  stakingGrowth30d: number
  netFlow7d: number
  newStakers7dCount: number
  activeWallets7dCount: number
  cooldownVvv: number
  cooldownWallets: number
  organicBurned: number
  burnUsdValueAnnualized: number
  burnRevenueAnnualized: number
  programmaticBurns: {
    dailyRate: number
    growth24h: number
    count24h: number
  }
  monthlyBurns: { month: string; vvv: number; usd: number }[]
  veniceRevenue: number
  ecosystemTvl: number
  priceLastUpdated: string | null
  lastUpdated: string | null
}

export interface VeniceBurnBucket {
  t: number
  organic?: number
  organicUsd?: number
  programmatic?: number
  programmaticUsd?: number
  [key: string]: unknown
}

export interface VeniceCharts {
  period: string
  vvvPrice: VeniceDataPoint[]
  diemPrice: VeniceDataPoint[]
  stakingRatio: VeniceDataPoint[]
  totalStaked: VeniceDataPoint[]
  burns: VeniceBurnBucket[]
  burnsMonthly: VeniceBurnBucket[]
}
