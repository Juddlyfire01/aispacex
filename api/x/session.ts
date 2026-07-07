// GET /api/x/session
// Lightweight "am I connected?" probe for the client. Returns the active
// account (id + username), the full list of connected accounts, and forwards
// any refreshed-token cookies. Used to reconcile the frontend multi-account
// store and decide whether the Profile tab shows its connected state or the
// "Connect X" call-to-action.
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { resolveSession, listAccounts } from '../_lib/x-session.js'
import { parseCookies, accountLabelCookieName } from '../_lib/x-oauth.js'

interface SessionBody {
  connected: boolean
  accountId?: string
  username?: string
  accounts: { id: string; username: string }[]
}

function send(res: VercelResponse, body: SessionBody) {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate')
  res.status(200).json(body)
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    const session = await resolveSession(req)
    if (!session) {
      // Even with no resolvable session, surface any stale account labels so the
      // frontend can show disconnected-but-remembered accounts (it'll prompt
      // re-auth per account). This is rare; usually no labels means none.
      const accounts = listAccounts(req)
      return send(res, { connected: false, accounts })
    }
    if (session.setCookies.length) res.setHeader('Set-Cookie', session.setCookies)

    const accounts = listAccounts(req)
    // The active account's username comes from its label cookie.
    const cookies = parseCookies(req.headers.cookie)
    const username = cookies[accountLabelCookieName(session.accountId)]

    send(res, {
      connected: true,
      accountId: session.accountId,
      username,
      accounts,
    })
  } catch {
    send(res, { connected: false, accounts: [] })
  }
}
