// A small circular character counter, matching X's composer ring. Turns amber
// as you approach the limit and red once over.

interface CharRingProps {
  used: number
  limit: number
}

export function CharRing({ used, limit }: CharRingProps) {
  const remaining = limit - used
  const pct = Math.min(used / limit, 1)
  const r = 8
  const circumference = 2 * Math.PI * r
  const dash = circumference * pct

  const over = remaining < 0
  const near = remaining <= 20 && !over
  const stroke = over ? '#f87171' : near ? '#fbbf24' : '#4b5563'

  return (
    <span className="inline-flex items-center gap-1.5">
      {(near || over) && (
        <span className={`text-[10px] font-mono ${over ? 'text-red-400' : 'text-amber-400/80'}`}>{remaining}</span>
      )}
      <svg width="20" height="20" viewBox="0 0 20 20" className="-rotate-90">
        <circle cx="10" cy="10" r={r} fill="none" stroke="#ffffff14" strokeWidth="2" />
        <circle
          cx="10"
          cy="10"
          r={r}
          fill="none"
          stroke={stroke}
          strokeWidth="2"
          strokeDasharray={`${dash} ${circumference}`}
          strokeLinecap="round"
        />
      </svg>
    </span>
  )
}
