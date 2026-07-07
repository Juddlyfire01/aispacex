// POST /api/x/logout[?account=<id>]
// Clears the X auth cookies. With ?account=<id>, disconnects only that one
// account (and clears x_active_account if it was the active one). Without an
// account param, clears everything (legacy "logout all" behaviour).
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { parseCookies } from '../_lib/x-oauth.js'
import { clearSessionCookies, clearAccountSessionCookies } from '../_lib/x-session.js'
import { COOKIE } from '../_lib/x-oauth.js'

export default function handler(req: VercelRequest, res: VercelResponse) {
  const account = typeof req.query.account === 'string'
    ? req.query.account
    : Array.isArray(req.query.account) ? String(req.query.account[0] ?? '') : ''

  if (account) {
    const cookies = parseCookies(req.headers.cookie)
    const wasActive = cookies[COOKIE.activeAccount] === account
    clearAccountSessionCookies(res, account, wasActive)
    return res.status(200).json({ ok: true, disconnected: account })
  }

  clearSessionCookies(res)
  res.status(200).json({ ok: true })
}
