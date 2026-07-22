// /api/x402/top-up-info
//   GET → { receiver, chainId, asset, minUsd }
//
// Public discovery of how to fund credits: the collection wallet, chain, asset,
// and minimum. No auth. Returns 503 if the receiver wallet is not configured.
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { minTopUpUsd, receiverWallet } from '../_lib/x402.js'

const CHAIN_ID = 8453
const USDC_BASE = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'method_not_allowed' })
  const receiver = receiverWallet()
  if (!receiver) return res.status(503).json({ error: 'x402_receiver_not_configured' })
  res.setHeader('cache-control', 'no-store')
  return res.status(200).json({
    receiver,
    chainId: CHAIN_ID,
    asset: USDC_BASE,
    minUsd: minTopUpUsd(),
  })
}
