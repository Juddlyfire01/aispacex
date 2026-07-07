# AiSpaceX

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

Open `http://localhost:5173`. If you're running in bring-your-own-key mode, connect your [Venice API key](https://venice.ai/settings/api) from the header.

### X OAuth (Intel → Connect X)

Intel's X login uses server-side OAuth and HttpOnly cookies. It does **not** work with plain `npm run dev` alone — you need the `/api` serverless routes. See **[docs/x-oauth-dev.md](docs/x-oauth-dev.md)** for local setup, Vercel previews, and callback registration.

Quick local start:

```bash
vercel dev   # terminal 1 — API
# terminal 2: VITE_API_TARGET=http://localhost:3000 npm run dev
```

Register `http://localhost:5173/api/x/oauth/callback` in the [X developer portal](https://developer.x.com).

Production callback (after deploy):

```text
https://aispacex.vercel.app/api/x/oauth/callback
```

## Self-hosting

### Static + Vercel Functions (recommended)

Deploy to [Vercel](https://vercel.com). The repo includes serverless proxies for Venice, VeniceStats, News RSS, and X OAuth.

Set environment variables in Vercel → Settings → Environment Variables:

- `VENICE_API_KEY` — optional shared Venice key (server-side only)
- `VITE_VENICE_SERVER_FRONTED=true` — hide BYOK UI when using a shared key
- `X_CLIENT_ID` / `X_CLIENT_SECRET` — for Intel Connect X

See `.env.example` for the full list.

### Static only

```bash
npm run build   # outputs to /dist
```

Serve `/dist` from any static host. The browser calls `https://api.venice.ai` directly (Venice allows CORS). Intel X OAuth and News/Stats proxies require the Vercel `/api` routes.

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
