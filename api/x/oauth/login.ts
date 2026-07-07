// GET /api/x/oauth/login
// Starts the X OAuth 2.0 Authorization Code + PKCE flow. Generates a PKCE
// verifier + CSRF state, stashes them in short-lived HttpOnly cookies, and
// 302-redirects the browser to X's consent screen.
import type { VercelRequest, VercelResponse } from '@vercel/node'
import {
  X_AUTHORIZE_URL, X_SCOPES,
  readEnv, randomUrlToken, codeChallengeS256, packOAuthState,
} from '../../_lib/x-oauth.js'

export default function handler(req: VercelRequest, res: VercelResponse) {
  try {
    const env = readEnv(req)
    const verifier = randomUrlToken(32)
    const challenge = codeChallengeS256(verifier)
    const state = packOAuthState(verifier)

    const authUrl = new URL(X_AUTHORIZE_URL)
    authUrl.searchParams.set('response_type', 'code')
    authUrl.searchParams.set('client_id', env.clientId)
    authUrl.searchParams.set('redirect_uri', env.redirectUri)
    authUrl.searchParams.set('scope', X_SCOPES.join(' '))
    authUrl.searchParams.set('state', state)
    authUrl.searchParams.set('code_challenge', challenge)
    authUrl.searchParams.set('code_challenge_method', 'S256')

    // Verifier travels in signed `state` — no cookies needed for the X round-trip.
    res.setHeader('Location', authUrl.toString())
    res.status(302).end()
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : 'OAuth login failed' })
  }
}
