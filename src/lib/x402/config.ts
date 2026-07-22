// x402 monetization config (client-visible booleans + constants only — never
// secrets). x402 is the paid mode that runs in parallel with Free
// (VENICE_SERVER_FRONTED) and BYOK. When enabled, users connect a wallet and
// pay this app in USDC on Base per action; the shared server key keeps paying
// the upstreams (Venice + X). See docs/plan for the full topology.

/** Base mainnet chain id (CAIP-2 + numeric). USDC settlement chain. */
export const X402_CHAIN_ID = 8453
export const X402_CHAIN_CAIP2 = 'eip155:8453'
export const X402_CHAIN_HEX = '0x2105'

/** Native USDC on Base (6 decimals). Not USDbC. */
export const USDC_BASE_ADDRESS = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913'
export const USDC_DECIMALS = 6

/**
 * Margin multiplier applied to raw itemized cost when charging a user in x402
 * mode. Charged = rawCostUsd * X402_MARGIN.
 *
 * Client-visible (VITE_) so the cost preview matches the debit. The exact value
 * is a business decision; default 1.3x (30% margin) until tuned.
 */
export const X402_MARGIN = (() => {
  const raw = import.meta.env.VITE_X402_MARGIN as string | undefined
  const n = raw != null ? Number(raw) : NaN
  return Number.isFinite(n) && n >= 1 ? n : 1.3
})()

/**
 * Whether x402 credits are available in this build. Off by default.
 *
 * true  → show Credits UI; users may connect a wallet.
 *         Connecting a wallet opts into paid (debit credits).
 *         No wallet connected → Free / BYOK still works (unless DISABLE_FREE).
 * false → feature hidden entirely; everyone stays on Free / BYOK.
 *
 * Disconnect = Free again (unless VITE_X402_DISABLE_FREE is on).
 */
export const X402_ENABLED = (import.meta.env.VITE_X402_ENABLED as string | undefined) === 'true'

/**
 * When true (and X402_ENABLED), block Free/shared-key usage unless the user
 * is paid-ready, or has full BYOK (Venice key + X OAuth for Intel; Venice key
 * alone for media). No-op when credits are disabled.
 */
export const X402_DISABLE_FREE =
  X402_ENABLED &&
  (import.meta.env.VITE_X402_DISABLE_FREE as string | undefined)?.trim() === 'true'

/**
 * When true, X metering / x402 charges only bill resource IDs not yet seen
 * today (UTC), matching X's daily dedup. Off by default — dedup savings stay
 * in margin. Owned-Read discount is still retained as margin either way.
 */
export const X402_PASS_X_DEDUP =
  (import.meta.env.VITE_X402_PASS_X_DEDUP as string | undefined) === 'true'

/** Your collection wallet — where user payments settle. Client-visible (public address). */
export const X402_RECEIVER_WALLET =
  (import.meta.env.VITE_X402_RECEIVER_WALLET as string | undefined)?.trim() || ''

/** Minimum top-up in USD (mirrors Venice's x402 floor; overridable). */
export const X402_MIN_TOPUP_USD = (() => {
  const raw = import.meta.env.VITE_X402_MIN_TOPUP_USD as string | undefined
  const n = raw != null ? Number(raw) : NaN
  return Number.isFinite(n) && n > 0 ? n : 5
})()

/** Apply the margin multiplier to a raw USD cost. */
export function applyMargin(rawUsd: number): number {
  if (!(rawUsd > 0)) return 0
  return rawUsd * X402_MARGIN
}

/** Convert a USD amount to USDC base units (6 decimals) as a string. */
export function usdToUsdcBaseUnits(usd: number): string {
  const units = Math.round(Math.max(0, usd) * 10 ** USDC_DECIMALS)
  return String(units)
}

/** Convert USDC base units (string or number) back to a USD number. */
export function usdcBaseUnitsToUsd(units: string | number): number {
  const n = typeof units === 'string' ? Number(units) : units
  if (!Number.isFinite(n)) return 0
  return n / 10 ** USDC_DECIMALS
}
