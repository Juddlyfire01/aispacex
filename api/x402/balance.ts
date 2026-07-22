// /api/x402/balance
//   POST { address, statement, signature, nonce } → { address, balanceUsd, ledger }
//
// SIWE-authenticated read of the caller's own credit balance + recent ledger.
// The signer must match the address in the body (verifySiwe enforces the
// statement embeds that address). Returns 402 when no SIWE payload is present
// (mirrors Venice's convention), 401 when a signature is present but invalid.
import type { VercelRequest, VercelResponse } from '@vercel/node'
import {
  AuthError,
  getBalanceUsd,
  getLedger,
  issueSessionToken,
  verifySiwe,
  x402KvConfigured,
} from '../_lib/x402.js'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'method_not_allowed' })
  if (!x402KvConfigured()) return res.status(503).json({ error: 'x402_kv_not_configured' })

  const body = (req.body ?? {}) as {
    address?: string
    statement?: string
    signature?: string
    nonce?: string
  }
  if (!body.address || !body.statement || !body.signature || !body.nonce) {
    return res.status(402).json({ error: 'siwe_required' })
  }

  let address: string
  try {
    address = await verifySiwe({
      address: body.address,
      statement: body.statement,
      signature: body.signature,
      nonce: body.nonce,
    })
  } catch (err) {
    if (err instanceof AuthError) return res.status(401).json({ error: err.message })
    return res.status(500).json({ error: 'siwe_verify_failed' })
  }

  try {
    const [balanceUsd, ledger] = await Promise.all([getBalanceUsd(address), getLedger(address, 50, 0)])
    const session = issueSessionToken(address)
    res.setHeader('cache-control', 'no-store')
    return res.status(200).json({
      address,
      balanceUsd,
      ledger,
      sessionToken: session.token,
      sessionExpiresAt: session.expiresAt,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'balance_read_failed'
    return res.status(502).json({ error: 'x402_balance_failed', message })
  }
}
