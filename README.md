# AiSpace Xintel

A privacy-focused dashboard for [Venice AI](https://venice.ai) — X intelligence, community signal, on-chain protocol stats, and curated news — with generation tools for image, audio, music, and video.

Host it yourself, bring your own API key (or front a shared server-side key), and own the interface.

## Dashboard

| Tab | What it does |
|-----|----------------|
| **Intel** | X intelligence gathering — profile analysis, network graphs, activity feeds, and AI-synthesized reports for your account and targets |
| **Signal** | Venice community buzz, sentiment, momentum, and top voices via [VeniceStats](https://venicestats.com) |
| **Stats** | Real-time on-chain data for VVV & DIEM on Base |
| **News** | RSS-driven news reader with categories, bookmarks, and Venice-powered TL;DR |

## Generate

Image, audio, music, and video generation live in the sidebar — full access to Venice's model catalog with a clean, hackable UI.

## Getting Started

```bash
npm install
npm run dev
```

That single command starts **one** Vite process on **http://localhost:5173**:

| Layer | How | Role |
|-------|-----|------|
| UI | Vite | App + localStorage |
| `/api/*` | In-process handlers (same process) | OAuth, Venice proxy, News, X — **no cold starts** |

Put secrets in a project-root **`.env`** (see `.env.example`). The in-process API reads them from there — it does **not** auto-pull Vercel project env.

If you're running in bring-your-own-key mode, connect your [Venice API key](https://venice.ai/settings/api) from the header.

| Script | What it runs |
|--------|----------------|
| `npm run dev` | UI + in-process API (recommended, fast) |
| `npm run dev:vercel` | Legacy: Vite + `vercel dev` on :3000 (slow cold starts) |
| `npm run dev:ui` | Vite UI only (`VITE_API_TARGET=off`) |
| `npm run dev:api` | `vercel dev` API only |

### X OAuth (Intel → Connect X)

Intel's X login uses server-side OAuth and HttpOnly cookies. With `npm run dev`, open **http://localhost:5173** and register this callback in the [X developer portal](https://developer.x.com):

```text
http://localhost:5173/api/x/oauth/callback
```

See **[docs/x-oauth-dev.md](docs/x-oauth-dev.md)** for previews, production callbacks, and debugging.

Production callback (after deploy):

```text
https://aispacex-aispace-team.vercel.app/api/x/oauth/callback
```

If you add a custom domain, register `{your-domain}/api/x/oauth/callback` instead. The bare `aispacex.vercel.app` subdomain may be owned by another Vercel project globally — use the team URL above or your own domain.

## Self-hosting

### Static + Vercel Functions (recommended)

Deploy to [Vercel](https://vercel.com). The repo includes serverless proxies for Venice, VeniceStats, News RSS, and X OAuth.

Set environment variables in Vercel → Settings → Environment Variables:

- `VENICE_API_KEY` — optional shared Venice key (server-side only; injected by `/api/venice/proxy`)
- `VITE_VENICE_SERVER_FRONTED=true` — hide BYOK UI and route Venice through that proxy (local + prod)
- `X_CLIENT_ID` / `X_CLIENT_SECRET` — for Intel Connect X

See `.env.example` for the full list.

### Static only

```bash
npm run build   # outputs to /dist
```

Serve `/dist` from any static host. The browser calls `https://api.venice.ai` directly (Venice allows CORS). Xintel OAuth and News/Stats proxies require the Vercel `/api` routes.

### Docker

```bash
docker build -t aispacex .
docker run -p 8080:80 aispacex
```

A `railway.json` is included for one-click Railway deploy.

## Tech Stack

React 19, TypeScript, Vite, Zustand, TanStack Query, Tailwind CSS v4.

## License

MIT
