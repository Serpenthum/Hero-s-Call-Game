# Hosting Hero's Call on Cloudflare (free plan)

The game has two parts:

- **The server** (a Cloudflare Worker): https://heroscall-server.heros-call-backend.workers.dev
- **The website** (Cloudflare Pages): https://heroscall.pages.dev

## Deploying

First run `npm run install:all` once in the project folder, then log in once by running `npx wrangler login`
from the `backend` folder. After that, run these from the project folder:

- Server: `npm run deploy:server`
- Website: `npm run deploy:site`

Deploying the server restarts it. Any live matches end and everyone is logged out, so deploy when nobody is playing.

## Admin password

The game has three admin accounts: Admin1, Admin2 and Admin3, plus the "Quick admin login" button on the login screen.
To set their password, open a terminal in the `backend` folder and run:

    npx wrangler secret put ADMIN_PASSWORD

It will ask you to type the password. The password is stored at Cloudflare and never in the code.

Setting the secret also redeploys the server, which restarts it and ends any live matches, so do it when nobody is playing.
After it is set, Admin1, Admin2, Admin3 (and any other AdminN account) use that password from the next server start.

## Running it on your own computer

Open two terminals:

1. In `backend`: `npx wrangler dev` (starts the server on your computer)
2. In `frontend`: `npm run dev` (starts the website, usually at http://localhost:5173)

For a local admin password, put `ADMIN_PASSWORD=whatever` in `backend/.dev.vars` (this file is never committed).

## Free plan limits

- 100,000 requests per day. Each live-game WebSocket message counts as 1/20 of a request for the game server.
- The game server's Durable Object may use 13,000 GB-seconds of running time per day.

If a limit is passed, requests fail and the game stops working until the counters reset at 00:00 UTC. Nothing is
charged on the free plan. For a group of friends these limits are very unlikely to be reached.
