# Hosting on Vercel

**Vercel hosts the frontend only.** The backend cannot run on Vercel: it is a long-running server that holds WebSocket
(socket.io) connections, keeps every live match, queue and the draft clock in memory, and stores accounts in a SQLite file.
Serverless functions are short-lived and stateless, so none of those survive there. Run the backend on a host that keeps a
process running (Render, Railway, Fly.io, a VPS): `backend/Dockerfile` already builds it, and it needs a persistent disk
mounted at `/app/data` for the SQLite database.

## 1. Backend (any always-on host)

- Build from the repo root: `docker build -f backend/Dockerfile .` (or the host's Docker option).
- Mount a persistent volume at `/app/data`.
- Set `NODE_ENV=production`, and `ALLOWED_ORIGINS` to the Vercel site, for example
  `https://your-game.vercel.app` (comma separate more; custom domains too).
- It must be served over HTTPS so the browser can open a secure WebSocket. Note its public URL.
- Run one instance only: matches live in that process's memory.

## 2. Frontend (Vercel)

- Import the repo. Set **Root Directory** to `frontend`. `frontend/vercel.json` supplies the build command
  (`npm run build && node scripts/copy-assets.mjs`, which also copies the hero art into the site) and output folder.
- Environment variables (Production, and Preview if you want previews to work):
  - `VITE_API_BASE_URL` = the backend URL, for example `https://api.your-game.example`
  - `VITE_SOCKET_URL` = the same backend URL
  - `VITE_IMAGE_BASE_URL` is optional; leave it unset and the site serves its own hero images.
- Deploy. Preview deployments have their own `*.vercel.app` address, so add each one you use to `ALLOWED_ORIGINS`,
  or test on the production domain only.

## Why not make the backend serverless?

It would mean replacing socket.io with a hosted realtime service, moving all match state into Redis and SQLite into a hosted
database, and rewriting the game server's timers (draft clock, turn timers, queues) as scheduled functions. That is a rewrite
of the game server rather than a hosting change.
