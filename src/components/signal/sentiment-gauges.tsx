import type { SocialMetrics } from '../../lib/venicestats/signal-types'
import { fmtCompact } from '../../lib/venicestats/format'
import { KpiCard } from '../x-intel/stats/stats-ui'

function pctOrDash(n: number | null | undefined): string {
  return n != null ? `${n.toFixed(1)}%` : '—'
}

export function SentimentGauges({ social }: { social: SocialMetrics }) {
  const balance = social.sentimentBalance
  return (
    <div className="grid grid-cols-2 gap-2">
      <KpiCard
        label="VVV sentiment"
        value={pctOrDash(social.sentimentUpPct)}
        sub={
          social.watchlistUsers != null
            ? `${fmtCompact(social.watchlistUsers, 1)} watchlist · rank #${social.marketCapRank ?? '—'}`
            : undefined
        }
        tip="CoinGecko community bullish vote share, watchlist size, and market cap rank for VVV."
      />
      <KpiCard
        label="DIEM sentiment"
        value={pctOrDash(social.diemSentimentUpPct)}
        sub={
          social.diemWatchlistUsers != null
            ? `${fmtCompact(social.diemWatchlistUsers, 1)} watchlist · rank #${social.diemMarketCapRank ?? '—'}`
            : undefined
        }
        tip="CoinGecko community bullish vote share, watchlist size, and market cap rank for DIEM."
      />
      <KpiCard
        label="Santiment balance"
        value={balance != null ? `${balance > 0 ? '+' : ''}${balance.toFixed(2)}` : '—'}
        sub={
          social.socialVolume != null
            ? `vol ${fmtCompact(social.socialVolume, 0)} · dom ${social.socialDominance != null ? `${(social.socialDominance * 100).toFixed(2)}%` : '—'}`
            : undefined
        }
        delta={
          balance != null
            ? { text: balance > 0 ? 'net positive' : balance < 0 ? 'net negative' : 'neutral', positive: balance > 0 ? true : balance < 0 ? false : undefined }
            : undefined
        }
        tip="Santiment net sentiment balance, social volume, and social dominance (30d delayed)."
      />
      <KpiCard
        label="Erik Voorhees"
        value={social.erikFollowers != null ? fmtCompact(social.erikFollowers, 1) : '—'}
        sub="X followers"
        tip="Follower count of Venice founder Erik Voorhees on X."
      />
    </div>
  )
}
