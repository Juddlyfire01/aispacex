# X OAuth — why dev/previews are fiddly (and how to set them up)

Intel’s **Connect X** flow is a classic **server-side OAuth** pattern. Tokens live in **HttpOnly cookies** on whatever origin the browser is using. That design is correct for production, but it collides with how we usually develop frontends.

## The three things that must line up

Every OAuth connect is really three URLs that **must be the same origin**:

| Step | What happens | URL example |
|------|----------------|-------------|
| 1. Login | Browser opens your API route | `https://your-app.vercel.app/api/x/oauth/login` |
| 2. Callback | X redirects back with `?code=` | `https://your-app.vercel.app/api/x/oauth/callback` |
| 3. App | User lands back in the UI | `https://your-app.vercel.app/?x_connected=1` |

Plus: **auth cookies** are set on that same host. If step 2 runs on `localhost:3000` but step 3 opens `localhost:5173`, the UI never sees the cookies — it always looks disconnected.

X adds a fourth constraint: the **callback URL must be registered exactly** in the [X developer portal](https://developer.x.com). Wildcards like `*.vercel.app` are not supported.

## Local setup (recommended)

```bash
npm run dev
```

That starts **one** Vite process on **http://localhost:5173**. Serverless handlers under `api/` run **in-process** (no `vercel dev`, no cold starts).

| Layer | Port | Role |
|-------|------|------|
| Vite UI | **5173** | Browser origin / localStorage |
| `/api/*` | same process | OAuth, Venice proxy, News, X |

In the X developer portal, add callback:

```text
http://localhost:5173/api/x/oauth/callback
```

In project-root **`.env`**: `X_CLIENT_ID` and `X_CLIENT_SECRET` (if confidential). The in-process API does **not** auto-pull Vercel env — copy secrets into `.env` (or `vercel env pull .env.local`). You do **not** need `X_REDIRECT_URI` / `APP_BASE_URL` unless overriding.

OAuth URLs are derived from the request `Host` header (`localhost:5173`), so cookies and `redirect_uri` stay on the UI origin.

### Escape hatches

| Command | When |
|---------|------|
| `npm run dev:vercel` | Legacy stack: Vite + `vercel dev` on `:3000` (pulls Vercel env; slow cold starts) |
| `npm run dev:ui` | UI only (no `/api`) |
| `npm run dev:api` | `vercel dev` API only |
| `VITE_API_TARGET=http://localhost:3000 npm run dev:web` | Proxy `/api` to an already-running API on `:3000` |

## Vercel preview deployments

Previews fail for two independent reasons:

### 1. Environment variables

`X_CLIENT_ID` / `X_CLIENT_SECRET` must be enabled for **Preview** in Vercel → Settings → Environment Variables. If they’re Production-only, preview `/api/x/oauth/login` returns `{"error":"X_CLIENT_ID is not set"}`.

To fix: open each X variable → Edit → check **Preview** (and **Development** for `vercel dev` linked env) → Save → **redeploy** the preview.

`X_REDIRECT_URI` / `APP_BASE_URL` are optional — the server derives them from the preview hostname when unset.

### 2. Callback URL whitelist

Each preview hostname is unique, e.g.:

```text
https://aispacex-git-main-juddlyfire01.vercel.app/api/x/oauth/callback
```

(Vercel preview hostnames include the project name — register whatever URL your deployment actually serves.)

You must **add that exact URL** in the X developer portal before Connect works on that deployment. X does not allow wildcard callbacks.

**Practical approaches:**

| Approach | When to use |
|----------|-------------|
| Test OAuth on **production** (or one stable custom domain) | Simplest; previews for UI-only |
| **Branch alias** / fixed staging URL on Vercel | One extra callback URL for all PRs to that branch |
| Register each preview URL | Only if you must OAuth on every PR (tedious) |

After deploy, open the preview → Intel → Connect X. If X shows “redirect_uri mismatch”, copy the hostname from the address bar and add `{origin}/api/x/oauth/callback` in the X app settings.

## Production

Register:

```text
https://aispacex-aispace-team.vercel.app/api/x/oauth/callback
```

(Replace with your custom domain if you use one.)

Ensure `X_CLIENT_ID` (+ secret) are set for **Production** on Vercel.

## Debugging checklist

1. **`/api/x/oauth/login`** — should 302 to `x.com`, not 404/500.
2. **After consent** — URL should return to *your* origin with `?x_connected=1` or `?x_error=...`.
3. **`?x_error=state_mismatch`** — PKCE cookies lost (origin mismatch or blocked cookies).
4. **`?x_error=missing_verifier`** — same as above; login and callback were on different hosts.
5. **X “redirect_uri mismatch”** — callback not registered for the exact origin the app is using.
6. **Connected on redirect but UI still disconnected** — fixed in app bootstrap; hard-refresh if on an old build.

## Override static URLs

Only if a reverse proxy hides the real host:

```env
X_OAUTH_USE_ENV_URLS=true
X_REDIRECT_URI=https://fixed.example.com/api/x/oauth/callback
APP_BASE_URL=https://fixed.example.com/
```
