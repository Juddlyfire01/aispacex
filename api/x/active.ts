// POST /api/x/active?account=<id>
// Switches the active X account by setting the x_active_account cookie. The
// account must already be connected (its x_account__<id> label cookie must
// exist). The next /api/x/proxy or /api/x/session call will resolve to this
// account's tokens.
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { COOKIE, parseCookies, serializeCookie, cookiesAreSecure, accountLabelCookieName } from '../_lib/x-oauth.js'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const account = typeof req.query.account === 'string'
    ? req.query.account
    : Array.isArray(req.query.account) ? String(req.query.account[0] ?? '') : ''

  if (!account) return res.status(400).json({ error: 'missing_account' })

  const cookies = parseCookies(req.headers.cookie)
  const label = cookies[accountLabelCookieName(account)]
  if (!label) return res.status(404).json({ error: 'account_not_connected' })

  const secure = cookiesAreSecure(req)
  res.setHeader('Set-Cookie', [
    serializeCookie(COOKIE.activeAccount, account, { maxAge: 60 * 60 * 24 * 60, secure }),
  ])
  res.status(200).json({ ok: true, accountId: account, username: label })
}
