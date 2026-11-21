# Hero's Call on Cloudflare (free plan): design

Date: 2026-11-04
Status: final draft, awaiting owner approval

## Why

Hero's Call has been running on a friend's server (Docker images `ericellb/heros-call-*`, domains
`heroescall.8363742.xyz` / `apiheroescall.8363742.xyz`). The owner wants it off that server and onto hosting they
control, at no monthly cost. Vercel was considered and rejected: it cannot keep a long-running game server alive.
Cloudflare's free plan can, through a Durable Object, which is one always-addressable server instance that holds
memory and WebSocket connections while players are connected.

Success: players open `https://heroscall.pages.dev`, register or log in, and every mode (draft, random, friendly
rooms, survival, gauntlet, tutorial, spectating, friends, messages, shop, quests, collection, profile) plays the
same as it does today. Nothing runs on the friend's server and nothing costs money.

## Goals

- Website (the Vite/React app in `frontend/`) hosted on Cloudflare Pages at **`heroscall.pages.dev`** (owner's
  choice of name).
- Game server (everything in `backend/`) running in a Cloudflare Worker plus **one** Durable Object, on the Workers
  Free plan.
- Accounts and all saved data in the Durable Object's built-in SQLite storage.
- Gameplay, rules, balance and UI unchanged. This is a hosting move, not a redesign.
- Fresh start: the new database begins empty except for the three admin accounts.

## Non-goals

- No copying of data from the friend's server. The owner said: keep the 3 admin accounts, wipe everything else.
- No new features, no rule or balance changes, no UI redesign.
- No custom domain (can be added later in the Cloudflare dashboard).
- No multi-region or multi-instance scaling. One Durable Object holds the whole game, exactly like today's single
  Node process.

## Anti-goals (a failure even if it "works")

- **Touching the David's Class project in any way.** That is a separate project (`Businesses\David's Class`, Vercel
  project `mr-davids-class`, its own Supabase). No file in that folder is read for this work, edited, or deployed, and no
  Vercel command is run. Note: `Game/.vercel/project.json` currently links this game folder to the `mr-davids-class`
  Vercel project by mistake. It must be deleted (with `Game/.env.local`, which holds a Vercel token) before anything
  else, without running any Vercel CLI command.
- Anything that needs a paid Cloudflare plan or a credit card to keep running.
- Admin passwords written in the code or the repo. The quick admin login button is a separate, owner-accepted case:
  see Decision 5.
- Gameplay that behaves differently from today (turn timers, draft clock, gauntlet state, rewards).

## Constraints (Cloudflare Workers Free plan, checked 2026-11-04 on developers.cloudflare.com)

| Limit | Free plan | What it means here |
|---|---|---|
| Durable Object requests | 100,000/day. Incoming WebSocket messages count at 20:1, outgoing and pings are free | Roughly 2 million player actions a day. Ample. |
| Durable Object duration | 13,000 GB-s/day, billed at 128 MB while active | One object awake 24/7 uses 10,800 GB-s. Fits, **but only if there is exactly one Durable Object.** |
| Worker requests | 100,000/day | HTTP API calls plus WebSocket connection starts. Ample. |
| CPU per invocation | Docs conflict: 30 s for Durable Objects vs 10 ms for Free-plan Workers | **Main risk.** Must be measured early (see Rollout step 1). |
| Memory | 128 MB per isolate | All live games must fit, same as today. |
| SQLite storage | 5 GB total. 100,000 rows written/day, 5 million rows read/day | Ample for this game. |
| Over a limit | Operations fail with an error until 00:00 UTC | The game stops for the rest of the day instead of charging. |

Free-plan Durable Objects must use the SQLite storage backend.

## Architecture (owner-approved shape)

```
Browser ──HTTPS──▶ heroscall.pages.dev        (Cloudflare Pages: built frontend + hero art, login art)
   │
   ├──HTTPS /api/*──▶ heroscall-server Worker ──▶ GameServer Durable Object (single instance, name "main")
   └──WSS /ws ───────▶ heroscall-server Worker ──▶ same Durable Object
                                                  ├─ in memory: games, queues, draft clock, timers, sessions, tokens
                                                  └─ ctx.storage.sql: users, friends, messages, gauntlet saves,
                                                     player_stats, player_quests
```

- The Worker is a thin front door. It forwards every `/api/*` request and the `/ws` WebSocket upgrade to the one
  Durable Object (`idFromName("main")`). All game logic runs inside the Durable Object, so HTTP routes and sockets
  share memory the way `server.js` relies on today. For example, login looks up the user's live socket.
- The frontend talks to the Worker's own URL (`https://heroscall-server.<account>.workers.dev`) through the existing
  `VITE_API_BASE_URL` and `VITE_SOCKET_URL` settings, with CORS allowing `https://heroscall.pages.dev`.
- **Builder's call:** route through Pages Functions instead (same origin), if that turns out simpler.

## Decisions (my calls, made for the owner; flagged so they can be checked)

1. **SQLite inside the Durable Object, not D1.** Its API is synchronous and in-process, so wrapping it in the
   `sqlite3`-style callback API that `database.js` uses is straightforward, and there is no extra service. The
   tables and columns stay the same as `database.js` creates today. The `ALTER TABLE` migrations fold into the
   `CREATE TABLE` statements, since the database starts empty.
2. **Plain WebSockets with small socket.io-compatible shims on both ends,** instead of rewriting all 98 frontend
   calls and about 150 server emit and room calls.
   - **Server shim** supports what `server.js` uses:
     - `io.to(room).emit`, `io.emit`, `io.sockets.sockets` (a Map of id to socket)
     - `socket.id`, `socket.data`, `socket.join`, `socket.leave`, `socket.to(room).emit`, `socket.emit`,
       `socket.on`, the `disconnect` event
     - acknowledgement callbacks (used by `latency-ping`)
   - **Client shim** in `frontend/src/socketService.ts` supports what the app uses: `emit`, `on`, `off`, `once`,
     `connected`, `connect`/`disconnect` events, `timeout(ms).emit(..., ack)`, and automatic reconnect with backoff.
     After a reconnect the socket gets a new id, exactly as socket.io does today. The existing `reconnect-game` and
     `authenticate` flow carries on unchanged.
   - Wire format is JSON `{ t: event, d: args, a?: ackId }`, or the builder's equivalent.
3. **No WebSocket hibernation.** Hibernation would throw away in-memory game state. The duration budget above
   covers one always-awake object.
4. **Password hashing moves from bcryptjs to PBKDF2 via WebCrypto (`crypto.subtle`).** bcrypt in pure JavaScript
   costs tens to hundreds of milliseconds of CPU, which may break the Free-plan CPU limit. PBKDF2 is built in and
   fast. Every account is new, so old hashes never need verifying.
5. **Admin accounts.**
   - `createAdminAccounts()` keeps creating Admin1, Admin2 and Admin3, with every enabled hero, 1,000 VP and
     level 10, the same as today.
   - **The "Quick admin login" button and `POST /api/admin-login` stay exactly as they are (owner's decision).**
     That includes creating Admin4 and up, to a maximum of Admin100, when the first three are in use. The owner
     uses it with friends and accepts that anyone who finds the public site can use it too.
   - The password for normal username-and-password login on every AdminN account comes from a Worker secret,
     `ADMIN_PASSWORD`. The owner sets it with `wrangler secret put` and types it in themselves. It is never
     committed or put in chat.
   - The hard-coded `'admin'` password is removed from the code.
   - If the secret is missing, admin accounts get an unguessable random password hash. Normal login then fails, and
     quick admin login still works.
   - `reset-admins.js` is a local SQLite script that won't work against the Durable Object. Drop it (builder may
     replace it with an admin-only route if trivial).
6. **Static files move to Pages.**
   - Express's `express.static` for `frontend/dist`, `/hero-images` and `/login-images` is dropped from the server.
   - Pages serves them. `frontend/scripts/copy-assets.mjs` already copies the hero art into `dist`; it also needs
     `login-images` if they are not already in `public/`.
   - Pages cache headers replace `frontend/vercel.json`, using a `_headers` file.
7. **Express goes; route handlers stay.** The 18 routes in `server.js`, plus the shop router in `shop.js`, are
   served by a small router in the Durable Object (Hono, or a hand-written one). Each handler body keeps its logic.
   An adapter gives handlers `req.body`, `req.params`, `req.query`, `req.headers` and `res.status().json()`, so
   `auth.requireUser` keeps working.
8. **Timers.**
   - `setTimeout` and `setInterval` work inside a Durable Object while it is awake. Turn timers, the draft clock,
     auto-end-turn and gauntlet timers keep their current logic.
   - Remove `.unref()` (Node-only).
   - Remove the startup waits (`await 5000 ms`, the 10 s admin delay). The SQLite tables are created synchronously
     in the Durable Object constructor, inside `ctx.blockConcurrencyWhile`.
9. **Node-only code.**
   - Turn on the `nodejs_compat` flag, for `crypto.randomBytes` and similar. Replace anything still unsupported.
   - `require('./heros.json')` becomes a bundled import. The `delete require.cache` "fresh data" trick goes, since
     hero data changes only on deploy.
   - `uuid` stays or becomes `crypto.randomUUID()`.
10. **Friend's-server leftovers.** After the move works, remove from the repo:
    - `docker-compose.yml`, both Dockerfiles, `frontend/docker-entrypoint.sh` and the runtime `window.ENV` config
      path
    - the `docker:*` scripts
    - `frontend/vercel.json` and `docs/DEPLOY_VERCEL.md`

    They stay in git history. Replace them with `docs/DEPLOY_CLOUDFLARE.md`.
11. **Local development.** `wrangler dev` runs the server locally. `npm run dev` in `frontend` points at it. The
    existing `backend/test` suite (Node's `node --test`) keeps passing. The tests can run against a small in-memory
    SQLite adapter or `better-sqlite3`, whichever is less work (builder's call).

## Restarts (owner accepted)

Cloudflare restarts the Durable Object on every deploy, on its own runtime updates, and when it evicts an idle
object. A restart ends live matches, clears queues and logs everyone out, because tokens are kept in memory.
Accounts, heroes, friends, messages, stats, quests and saved gauntlet progress survive because they are in SQLite.
The owner accepted this; it matches how a restart of the friend's server behaves. **Do not** build persistence of
live game state.

## Cloudflare account and names

- The owner has a new, free Cloudflare account. The builder runs `wrangler login`, and the owner completes the
  browser sign-in. Plans must stop and wait for the owner at that point and when `ADMIN_PASSWORD` is set.
- Use the Pages project name `heroscall` and the Worker name `heroscall-server`. If either name is taken, use the
  closest free variant (for example `heroscall-game`), carry on, and tell the owner the final URLs.
- Read the account's `workers.dev` subdomain after login. It goes into the `VITE_*` URLs and the CORS allowed
  origins.

## Rollout

1. **Fit check first. This is a gate for the whole project.** Build the Worker and Durable Object with the shims,
   deploy them to the owner's Cloudflare account, and measure on the free plan:
   - CPU time for register, login and a full draft-plus-battle (two browser tabs)
   - that timers fire
   - that the object stays alive during a match

   If the CPU limit is hit and cannot be engineered around, stop and report to the owner before going further. The
   fallback is Render or Railway at about $5–7/month, which the owner already knows about.
2. Port the rest: all routes, all socket events, every mode.
3. Deploy the frontend to Pages as project `heroscall`. Set the `VITE_*` URLs. Set `ADMIN_PASSWORD`.
4. End-to-end pass in a real browser on `heroscall.pages.dev`: every mode listed under Success, with two accounts.
5. Remove the friend's-server and Vercel leftovers, and write `docs/DEPLOY_CLOUDFLARE.md`.
6. The owner tells their friend the old server can be shut down. Nothing in this project does that.

## Working rules for this project

- All work happens in `C:\Users\David\Documents\David's Files\Businesses\Hero's Call\Game`, on a new git branch
  off `main`. Nothing outside this folder is changed, except the owner's Cloudflare account through `wrangler`.
- Planning and review are done with Opus. Coding tasks go to Sonnet subagents (owner's instruction).
- Nothing is pushed to GitHub or merged without the owner saying so.

## Left to the builder

- Hono or a hand-written router, and exact shim internals and wire format.
- Whether to bundle the CommonJS backend as is (wrangler/esbuild handles CJS) or convert it to ESM.
- Test harness for the SQLite adapter.
- File layout for the new Worker code (suggested: `backend/worker/`, with `backend/wrangler.toml`).
