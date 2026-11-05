# Hero's Call on Cloudflare Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task by task. Steps use checkbox (`- [ ]`) syntax for tracking.
> **Owner's instruction:** implementer subagents run on **Sonnet** (`model: "sonnet"`). Planning, reviews and the final
> branch review run on **Opus**.

**Goal:** Run Hero's Call entirely on Cloudflare's free plan. The website goes on Pages at `heroscall.pages.dev`. The
game server goes in one Worker plus one SQLite-backed Durable Object. Gameplay stays exactly the same.

**Architecture:**
- **Game logic:** the code in `backend/server.js` moves into a factory, `createGameServer`. Its game logic stays in
  place.
- **Shims:** the factory runs on small replacements for socket.io (`realtime/hub.js`), Express (`http/router.js`) and
  sqlite3 (`sql/compat.js`).
- **Cloudflare:** one Durable Object hosts the factory. A thin Worker forwards `/api/*` and `/ws` to it.
- **Website:** the frontend swaps `socket.io-client` for a matching client on plain WebSockets
  (`src/realtime/client.ts`).

**Tech Stack:** Cloudflare Workers + Durable Objects (SQLite storage), wrangler 4, Node 22 (`node:sqlite` and
`node --test` for backend tests), Vite 4 + React 18, vitest for the new frontend test.

**Spec:** `docs/superpowers/specs/2026-11-04-cloudflare-hosting-design.md` (read it before starting any task)

## Global Constraints

- All work happens in `C:\Users\David\Documents\David's Files\Businesses\Hero's Call\Game`, on branch
  `cloudflare-hosting`.
- **Never read, edit or deploy anything under `Businesses\David's Class`. Never run any `vercel` command.**
- Free plan only. **Exactly one** Durable Object instance: `env.GAME.idFromName("main")`. No WebSocket hibernation;
  use `server.accept()`.
- Names:
  - Worker: `heroscall-server`
  - Durable Object class: `GameServer`, bound as `GAME`
  - Pages project: `heroscall`
  - If a name is taken, use the closest free variant and tell the owner.
- `ADMIN_PASSWORD` is a Worker secret that the owner types in. It is never committed, logged or put in chat.
- Keep Quick admin login (`POST /api/admin-login`, Admin4 to Admin100) behaving as it does today.
- Admin accounts get every enabled hero, 1,000 VP and level 10, as they do today.
- Gameplay, rules, UI and event names stay unchanged. No persistence of live game state.
- Do not push to GitHub, merge, or change the friend's server.
- Existing backend tests (`cd backend && npm test`) must pass at the end of every task.

## Review Focus

1. **Reconnect mid-match.** Wi-Fi drops for 5 s during a battle. The client reconnects with a new socket id, App's
   existing `reconnect-game` flow restores the match, and messages emitted while disconnected are sent after the
   reconnect, not lost. (Pinned in Task 6.)
2. **Messages to a socket id.** `io.to(socketId).emit(...)` must reach that socket, because socket.io auto-joins every
   socket to a room named after its own id and the server relies on it, for example in `draft-abandoned`.
   (Pinned in Task 3.)
3. **Bad input over the wire.** A non-JSON frame, an unknown event or an oversized frame (over 64 KB) must not crash the
   Durable Object. It is ignored and the socket stays usable. (Pinned in Task 3.)
4. **Takeover login.** Logging in from a second tab calls `existingSocket.disconnect()`. The old tab must get
   `force-logout`, then close, and must **not** auto-reconnect. (Pinned in Task 3 for the server, Task 6 for the
   client.)
5. **Callback ordering in the SQL shim.** `database.js` assumes sqlite3 callbacks run after the call returns and in
   call order. A synchronous driver must not call a callback before the caller's next line. (Pinned in Task 2.)

---

### Task 0: Branch and remove the stray Vercel link

**Files:**
- Delete: `.vercel/` (directory) and `.env.local`. Both are ignored by git, so nothing to commit.
- Add: `docs/superpowers/specs/2026-11-04-cloudflare-hosting-design.md`,
  `docs/superpowers/plans/2026-11-04-cloudflare-hosting.md`

- [ ] **Step 1:** Create the branch: `git -C "<Game>" switch -c cloudflare-hosting`. Expected: `Switched to a new branch`.
- [ ] **Step 2:** Delete `<Game>\.vercel` and `<Game>\.env.local` with `Remove-Item` only. **Do not run any Vercel
      CLI command.**
- [ ] **Step 3:** Verify with `Test-Path "<Game>\.vercel","<Game>\.env.local"`. Expected: `False False`.
- [ ] **Step 4:** Commit the spec and the plan: `docs: Cloudflare hosting design and plan`.

### Task 1: PBKDF2 passwords and WebCrypto tokens

**Files:**
- Create: `backend/passwords.js`, `backend/test/passwords.test.js`
- Modify: `backend/database.js` (bcrypt at lines ~250, ~313, ~1462), `backend/server.js:322` (admin-login hash),
  `backend/auth.js` (token randomness), `backend/package.json` (remove `bcryptjs`)

**Interfaces:**
- Produces:
  - `hashPassword(password: string): Promise<string>`, returning `"pbkdf2$100000$<saltB64>$<hashB64>"`
  - `verifyPassword(password: string, stored: string): Promise<boolean>`
  - `randomPasswordHash(): Promise<string>`, the hash of 32 random bytes (an unusable password)
  - All three exported from `backend/passwords.js` as CommonJS.

- [ ] **Step 1: Write the failing tests** in `passwords.test.js`:
  - `hashPassword('secret1')` matches `/^pbkdf2\$100000\$[A-Za-z0-9+/=]+\$[A-Za-z0-9+/=]+$/`
  - Two hashes of the same password differ (random salt).
  - `verifyPassword('secret1', h)` is `true`, and `verifyPassword('secret2', h)` is `false`.
  - `verifyPassword('x', 'garbage')` is `false`; it must not throw.
  - `verifyPassword(anything, await randomPasswordHash())` is `false`.
- [ ] **Step 2:** Run `cd backend; node --test test/passwords.test.js`. Expected: FAIL, cannot find module
      `../passwords`.
- [ ] **Step 3: Implement `passwords.js`.**
  - Use `globalThis.crypto.subtle`: `importKey('raw', …, 'PBKDF2')`, then `deriveBits({name:'PBKDF2',
    hash:'SHA-256', salt, iterations:100000}, key, 256)`.
  - Salt is 16 bytes. Cloudflare caps PBKDF2 at 100,000 iterations, so use exactly 100,000.
  - Compare hashes in constant time.
  - Use `btoa`/`atob` or `Buffer`; both exist in Node 22 and in Workers with `nodejs_compat`.
- [ ] **Step 4:** Swap bcrypt for these functions:
  - In `database.js`: `createUser` uses `hashPassword`, `authenticateUser` uses `verifyPassword`.
  - `createAdminAccounts(adminPassword)` takes the password as an argument. If it is empty or missing, it uses
    `randomPasswordHash()`.
  - In `server.js:322`, the admin-login account creation uses the same rule. Its password comes from a
    module-level `ADMIN_PASSWORD` constant (`process.env.ADMIN_PASSWORD` for now; Task 4 turns it into a factory
    argument).
  - Remove every `'admin'` password literal.
  - Remove `bcryptjs` from `backend/package.json` and run `npm install`.
- [ ] **Step 5:** In `auth.js`, replace `crypto.randomBytes(32).toString('hex')` with a hex string built from
      `globalThis.crypto.getRandomValues(new Uint8Array(32))`, and drop `require('crypto')`.
- [ ] **Step 6:** Run `cd backend; npm test`. Expected: all tests pass, including `trust.test.js` and
      `rewards.test.js`, which create users.
- [ ] **Step 7:** Commit: `feat(backend): PBKDF2 passwords via WebCrypto, no hard-coded admin password`.

### Task 2: sqlite3-compatible adapter with two drivers

**Files:**
- Create: `backend/sql/compat.js`, `backend/sql/nodeDriver.js`, `backend/test/sql-compat.test.js`
- Modify: `backend/database.js` (constructor, `init`, `createTables`, remove the `sqlite3` and `path` requires),
  `backend/test/support/db.js`, `backend/package.json` (remove `sqlite3`)

**Interfaces:**
- Driver interface (used by Task 5's Durable Object driver):
  `{ query(sql: string, params: any[]): { rows: object[], lastID: number, changes: number }, execScript(sql: string): void }`
- `createNodeDriver(filename: string = ':memory:')` uses `node:sqlite` `DatabaseSync`. Export it from
  `sql/nodeDriver.js`.
- `createCompatDb(driver)`, exported from `sql/compat.js`, returns an object with the sqlite3 shapes `database.js`
  uses:
  - `run(sql, params?, cb?)`, where `cb` is called with `this = { lastID, changes }`
  - `get(sql, params?, cb)`, giving the first row or `undefined`
  - `all(sql, params?, cb)`, giving the rows
  - `serialize(fn)` (just calls `fn`), `on(event, fn)` (no-op), `close(cb?)`
  - `params` may be an array or omitted.
- `new Database(compatDb)`: the constructor takes the compat object. `database.db` is that object, so
  `server.js`'s `database.db.run(...)` keeps working.

- [ ] **Step 1: Write the failing tests** in `sql-compat.test.js`, using `createCompatDb(createNodeDriver())`:
  - `run` INSERT: the callback's `this.lastID === 1` and `this.changes === 1`.
  - `run` UPDATE of two rows: `this.changes === 2`.
  - `get` with no match calls back `(null, undefined)`. `all` returns rows as plain objects.
  - SQL errors go to `cb(err)` and do not throw.
  - **Ordering (Review Focus 5):** `let order=[]; db.run('INSERT…', [], () => order.push('cb')); order.push('after');`.
    After `await new Promise(r => setTimeout(r))`, `order` deep-equals `['after','cb']`.
  - Two `run` calls issued back to back call back in issue order.
- [ ] **Step 2:** Run `node --test test/sql-compat.test.js`. Expected: FAIL, module missing.
- [ ] **Step 3: Implement.**
  - Run SQL synchronously at call time, so statements execute in order. Defer every callback with `queueMicrotask`.
  - In `nodeDriver`, `lastID` and `changes` come from `StatementSync.run()`'s `lastInsertRowid` and `changes`.
  - `execScript` calls `DatabaseSync.exec`.
- [ ] **Step 4: Rework `database.js`.**
  - The constructor is `constructor(db) { this.db = db; this.createTables(); }`.
  - `createTables()` builds the schema with one `this.db` call per `CREATE TABLE IF NOT EXISTS`. Fold the four
    `ALTER TABLE users ADD COLUMN …` columns (`favorite_heroes TEXT DEFAULT '[]'`, `best_gauntlet_trial INTEGER
    DEFAULT 0`, `player_id TEXT`, `tutorial_completed INTEGER DEFAULT 1`) into the `users` CREATE statement. Keep
    every other column and table exactly as it is today.
  - Remove the `DATA_DIR`/file-path logic and `close()`'s sqlite3 specifics. `close` delegates to `this.db.close`.
- [ ] **Step 5:** Update `test/support/db.js`:
  - `new Database(createCompatDb(createNodeDriver(path.join(dir,'test.sqlite'))))`
  - Remove the readiness polling loop, since tables now exist when the constructor returns.
  - `cleanup` still removes `dir`.
  - Remove `sqlite3` from `package.json` and run `npm install`.
  - Node 22 may print an ExperimentalWarning for `node:sqlite`. That is acceptable.
- [ ] **Step 6:** Run `npm test`. Expected: all pass.
- [ ] **Step 7:** Commit: `feat(backend): sqlite3-compatible adapter over a sync driver; node:sqlite for tests`.

### Task 3: Realtime hub (socket.io-compatible server side)

**Files:**
- Create: `backend/realtime/hub.js`, `backend/test/hub.test.js`

**Interfaces:**
- Wire format, JSON text frames:
  - Client to server: `{ t: string, d: any[], a?: number }`. `a` is an ack id.
  - Server to client: `{ t: string, d: any[] }`.
  - Ack reply: `{ t: '__ack', a: number, d: any[] }`.
  - On connect the server first sends `{ t: '__welcome', d: [socketId] }`.
  - Before a server-initiated close, the server sends `{ t: '__kick', d: [] }`. The client must not auto-reconnect
    after it.
- `createHub({ maxFrameBytes = 65536 } = {})` returns `io` with:
  - `io.on('connection', fn)`
  - `io.emit(ev, ...args)`
  - `io.to(room)` returning `{ emit }`. `to` is chainable: `io.to(a).to(b).emit` sends to the union.
  - `io.sockets.sockets`, a `Map<id, socket>`
  - `io.attach(transport: { send(text: string): void, close(code?: number, reason?: string): void })`, returning
    `{ receive(text: string): void, closed(reason?: string): void }`
- Socket object:
  - `id` (uuid), `data` (`{}`), `connected` (boolean), `rooms` (a Set that starts as `{id}`)
  - `join(room)`, `leave(room)`, `emit(ev, ...args)`, `to(room)` returning `{ emit }` (sends to the room minus this
    socket), `broadcast.emit(ev, ...args)` (sends to all minus this socket)
  - `on(ev, fn)`, `once`, `off`, `disconnect()` (sends `__kick`, then `transport.close(1000)`, then fires
    `'disconnect'` with `'server namespace disconnect'`)
  - `closed()` fires the socket's `'disconnect'` handlers with `'transport close'`, removes the socket from all rooms
    and from `io.sockets.sockets`, and sets `connected=false`.
- When an incoming frame has `a`, the handler gets a trailing callback `(...res) => send __ack`.
- Handler errors (sync throws or rejected promises) are caught and logged with `console.error`. They never propagate.

- [ ] **Step 1: Write the failing tests**, with fake transports that record `send`:
  - attach sends `__welcome` with the socket id first.
  - `io.to(socket.id).emit('x', 1)` reaches that socket **(Review Focus 2)**.
  - After `join('g1')`, `io.to('g1').emit` reaches only members. `socket.to('g1').emit` skips the sender.
  - `broadcast.emit` reaches every socket except the sender.
  - `receive('{"t":"latency-ping","d":[],"a":7}')` with a handler `(cb) => cb()` sends
    `{"t":"__ack","a":7,"d":[]}`.
  - **Review Focus 3:** `receive('not json')`, an unknown event, a frame of 70,000 bytes and a handler that throws all
    leave the socket connected, and a later valid frame is still handled.
  - **Review Focus 4:** `disconnect()` sends `__kick`, then calls `transport.close`, then fires `'disconnect'` once,
    and the socket leaves `io.sockets.sockets`.
  - `closed()` fires `'disconnect'` once and removes the socket from rooms. A second `closed()` is a no-op.
- [ ] **Step 2:** Run `node --test test/hub.test.js`. Expected: FAIL.
- [ ] **Step 3:** Implement `hub.js`. Rooms are a `Map<room, Set<socketId>>`. Use `uuid` v4 for ids, already a
      dependency.
- [ ] **Step 4:** Run `npm test`. Expected: all pass.
- [ ] **Step 5:** Commit: `feat(backend): socket.io-compatible realtime hub over plain WebSockets`.

### Task 4: HTTP router and the `createGameServer` factory

**Files:**
- Create: `backend/http/router.js`, `backend/gameServer.js`, `backend/test/gameServer.test.js`
- Modify: `backend/shop.js` (`express.Router()` becomes `createRouter()`), `backend/test/trust.test.js` (lines
  ~100–117: drop express and `listen`, call `handleFetch`), `backend/gameManager.js:18` and `backend/utils.js:4` (DEBUG
  flag tolerant of a missing `process`)
- Delete: `backend/server.js` (its body moves into `gameServer.js`), `backend/reset-admins.js`
- `package.json`: remove `express`, `cors`, `socket.io`, `nodemon`.

**Interfaces:**
- `createRouter()`, from `http/router.js`, returns `router` with:
  - `get(path, ...handlers)`, `post(path, ...handlers)`
  - `use(handler)` and `use(prefix, subRouter)`
  - Paths support `:param` segments. Handlers are express-style `(req, res, next)` and may be async.
  - `req` has `{ method, path, params, query, headers, body }`. `headers` is a plain object with lower-cased keys.
    `auth.js` reads `req.headers.authorization`.
  - `res` has `status(n)` (chainable), `json(obj)` and `set(name, value)`.
- `handleFetch(router, request: Request): Promise<Response>`, also from `http/router.js`:
  - Parses a JSON body when the content-type is JSON.
  - Returns `404 {error:'Not found'}` when nothing matches.
  - Returns `500 {success:false,message:'Server error'}` when a handler throws.
- `createGameServer({ io, router, database, env })`, from `gameServer.js`, returns `Promise<{ gameManager }>`.
  - `env` is `{ ADMIN_PASSWORD?: string }`.
  - It registers every route from today's `server.js` (18 routes plus `/api/shop`) on `router`, and the `connection`
    handler on `io`.
  - It calls `gameManager.setIo(io)` and `await database.createAdminAccounts(env.ADMIN_PASSWORD)`.
  - It starts the draft-clock `setInterval` with no `.unref()`.
- Moving `server.js` into `gameServer.js`:
  - Move the body unchanged except for:
    - removing the express/http/socket.io/cors setup, `express.static` mounts, `server.listen`, `process.on`
      handlers, the 5 s and 10 s startup waits, the post-listen admin `player_id` migration (fresh DB) and the
      `delete require.cache` trick (load `heros.json` once)
    - `ADMIN_PASSWORD` now comes from `env`
  - CORS moves to the Worker in Task 5.

- [ ] **Step 1: Write the failing test** `gameServer.test.js`. It builds `createHub()`, `createRouter()`, a test
      database (`support/db.js`) and `createGameServer({ io, router, database, env:{ ADMIN_PASSWORD:'pw123456' } })`,
      then asserts:
  - `POST /api/register {username:'alice1', password:'secret1'}` via `handleFetch` returns `success:true`.
  - `POST /api/login` returns a `token` and a `user.id`.
  - A fake transport attached to `io` that receives `authenticate {userId, token}` gets `authentication-success`.
  - Two sockets that authenticate and each send `join-game {name, mode:'draft'}` both receive a `join-result` with the
    same `gameId`.
  - `POST /api/login {username:'Admin1', password:'pw123456'}` succeeds.
  - `GET /api/nope` returns 404.
  - Call `gameManager`'s timers cleanup, or clear the interval, in `after` so the test exits. Expose whatever is
    needed for that on the returned object.
- [ ] **Step 2:** Run `node --test test/gameServer.test.js`. Expected: FAIL.
- [ ] **Step 3:** Implement `router.js` and `gameServer.js`, port `shop.js` to `createRouter`, and update
      `trust.test.js` to call `handleFetch(router, new Request('http://t' + path, …))`. Assertions stay unchanged.
- [ ] **Step 4:** Run `npm test`. Expected: all pass, including every `trust.test.js` case. Also run
      `grep -n "require('express')\|socket.io\|bcrypt\|sqlite3" backend/*.js`. Expected: no hits.
- [ ] **Step 5:** Commit: `feat(backend): createGameServer factory on the hub and router shims; drop express/socket.io`.

### Task 5: Worker, Durable Object and local `wrangler dev` smoke

**Files:**
- Create:
  - `backend/worker/index.js` (Worker entry, ESM)
  - `backend/worker/GameServer.js` (Durable Object class)
  - `backend/worker/doSqlDriver.js`
  - `backend/wrangler.toml`
  - `backend/scripts/smoke.mjs`
- Modify: `backend/package.json`:
  - add `wrangler` (exact current 4.x) as a devDependency
  - scripts: `"dev": "wrangler dev"`, `"deploy": "wrangler deploy"`, `"smoke": "node scripts/smoke.mjs"`

**Interfaces:**
- `wrangler.toml`:
  - `name="heroscall-server"`, `main="worker/index.js"`, `compatibility_date="2026-10-01"`,
    `compatibility_flags=["nodejs_compat"]`
  - `[[durable_objects.bindings]] name="GAME" class_name="GameServer"`
  - `[[migrations]] tag="v1" new_sqlite_classes=["GameServer"]`
  - `[vars] ALLOWED_ORIGINS="https://heroscall.pages.dev,http://localhost:5173,http://127.0.0.1:5173"`
- `createDoSqlDriver(sql: SqlStorage)`, from `doSqlDriver.js`, implements Task 2's driver interface:
  - `rows = sql.exec(q, ...params).toArray()`
  - `lastID` and `changes` from `sql.exec('SELECT last_insert_rowid() AS id, changes() AS n').one()`, read right
    after a write
  - `execScript` calls `sql.exec(script)`
- `GameServer extends DurableObject`:
  - The constructor runs `ctx.blockConcurrencyWhile(async () => …)` to build the driver, compat db, `Database`, hub,
    router and `await createGameServer({…, env:{ ADMIN_PASSWORD: env.ADMIN_PASSWORD }})`.
  - `fetch(request)`: a `/ws` request with `Upgrade: websocket` creates a `new WebSocketPair()` and calls
    `server.accept()`. It wires `io.attach({ send: t => server.send(t), close: (c,r) => server.close(c ?? 1000, r) })`,
    with `message` going to `receive` and `close`/`error` going to `closed`. It returns
    `new Response(null, {status:101, webSocket: client})`.
  - Any other request goes to `handleFetch(router, request)`.
- Worker `fetch(request, env)`:
  - Answers an `OPTIONS` preflight itself.
  - Forwards `/api/*` and `/ws` to `env.GAME.get(env.GAME.idFromName('main')).fetch(request)`. Everything else gets 404.
  - On non-101 responses whose `Origin` is in `ALLOWED_ORIGINS`, adds `Access-Control-Allow-Origin: <origin>`,
    `Vary: Origin`, `Access-Control-Allow-Headers: Content-Type, Authorization` and
    `Access-Control-Allow-Methods: GET, POST, OPTIONS`.
  - Rejects a `/ws` upgrade whose `Origin` is present and not allowed, with status 403.
  - Re-export `GameServer` from `index.js`.
- `smoke.mjs <baseUrl>` exits 0 on success and non-zero with a message on failure:
  - Register and log in two random users (`s` plus 8 random digits, password `secret123`).
  - Open two global `WebSocket`s to `<base>/ws` and wait for `__welcome`.
  - `authenticate`, then expect `authentication-success`.
  - Both send `join-game {mode:'draft'}`, then expect matching `join-result.gameId`.
  - Expect at least 2 `draft-timer` events within 4 s, which proves timers fire.
  - Both send `auto-draft`, then expect `auto-draft-complete`.
  - Send `latency-ping` with an ack and expect the ack within 2 s.
  - Print the round-trip ms for each step.

- [ ] **Step 1:** Write `smoke.mjs` first and run it against nothing: `node scripts/smoke.mjs http://127.0.0.1:8787`.
      Expected: non-zero exit, connection refused.
- [ ] **Step 2:** Implement the driver, the Durable Object, the Worker and `wrangler.toml`. For local runs, create
      `backend/.dev.vars` containing `ADMIN_PASSWORD=localdev123` and add `.dev.vars` to `.gitignore`.
- [ ] **Step 3:** Start `npx wrangler dev --port 8787` in the background, then run `npm run smoke --
      http://127.0.0.1:8787`. Expected: exit 0 with all steps printed.
- [ ] **Step 4:** Run `npm test`. Expected: all pass.
- [ ] **Step 5:** Commit: `feat(worker): GameServer Durable Object and Worker front door; smoke script`.

### Task 6: Frontend realtime client

**Files:**
- Create: `frontend/src/realtime/client.ts`, `frontend/src/realtime/client.test.ts`
- Modify:
  - `frontend/src/socketService.ts`: `io(...)` becomes `createSocket(...)`, and `Socket` is imported from
    `./realtime/client`
  - `frontend/src/config.ts`: drop the `window.ENV` runtime path. Order is `VITE_*` then the defaults.
  - `frontend/package.json`: remove `socket.io-client`, add a `vitest` devDependency and `"test": "vitest run"`
- Any file importing types from `socket.io-client` switches to `./realtime/client` (check with grep).

**Interfaces:**
- `createSocket(url: string, opts?: { reconnectionAttempts?: number; reconnectionDelay?: number; WebSocketImpl?: typeof WebSocket }): Socket`
  - `url` is the http(s) server URL. The client connects to `url` with `http`→`ws` and `https`→`wss`, plus `/ws`.
- `Socket<E = any>` exposes:
  - `connected: boolean`, `id: string | undefined` (set from `__welcome`)
  - `emit(ev, ...args)`, where a trailing function becomes an ack
  - `on`, `off(ev, fn?)`, `once`
  - `timeout(ms)` returning `{ emit(ev, ...args, cb(err, ...res)) }`. `err` is an `Error` on timeout.
  - `disconnect()`, which closes without reconnecting
  - The generic is a loose type alias so `Socket<SocketEvents>` in `socketService.ts` still compiles.
- Client lifecycle events, mirroring socket.io:
  - `'connect'` after `__welcome`
  - `'disconnect'(reason)` with `'io server disconnect'` after `__kick`, otherwise `'transport close'`
  - `'reconnect'(attempt)` and `'reconnect_error'(err)`
- Reconnect: exponential backoff starting at `reconnectionDelay`, capped at 5 s, up to `reconnectionAttempts`.
  Never reconnect after `disconnect()` or `__kick`.
- Emits made while disconnected are buffered in order and sent after the next `'connect'`. This matches socket.io's
  default.

- [ ] **Step 1: Write the failing tests** in `client.test.ts`, with a fake `WebSocketImpl` the test controls:
  - `connected` turns true and `id` is set only after `__welcome`.
  - `emit('a', 1)` sends `{"t":"a","d":[1]}`.
  - `emit('p', cb)` sends `a:1`, and a server `__ack a:1` calls `cb`.
  - `timeout(50).emit('p', cb)` with no reply calls `cb(err)` with an `Error`.
  - **Review Focus 1:** after the fake socket closes, `emit('b')` is buffered. The client reconnects, and after the new
    `__welcome` the `'connect'` handler fires, the `id` changes and `'b'` is sent.
  - **Review Focus 4:** after `__kick` and a close, `'disconnect'` gets `'io server disconnect'` and no reconnect is
    attempted. After `disconnect()`, no reconnect either.
  - `off(ev, fn)` stops delivery.
- [ ] **Step 2:** Run `cd frontend; npx vitest run`. Expected: FAIL.
- [ ] **Step 3:** Implement `client.ts` and switch `socketService.ts` and `config.ts` over.
- [ ] **Step 4:** Run `npx vitest run` and `npm run build`. Expected: tests pass, and the build succeeds with no
      reference to `socket.io-client`.
- [ ] **Step 5: Local end to end.**
  - With `wrangler dev` running on 8787, start `npm run dev` in `frontend` with
    `VITE_API_BASE_URL=http://127.0.0.1:8787` and `VITE_SOCKET_URL=http://127.0.0.1:8787`, using a temporary
    `frontend/.env.development.local` that is not committed.
  - In two browser windows: register two users, play a full draft match to the end, and use Quick admin login.
  - Expected: works exactly like before.
- [ ] **Step 6:** Commit: `feat(frontend): WebSocket client with the socket.io API the app uses; drop socket.io-client`.

### Task 7: Fit check on the owner's Cloudflare account (gate)

The controller runs this task, not a subagent, because it needs the owner.

- [ ] **Step 1:** In `backend`, run `npx wrangler login`. **Stop and ask the owner to finish the browser sign-in.**
      Then run `npx wrangler whoami`. Expected: the owner's account is shown.
- [ ] **Step 2:** Run `npx wrangler deploy`. Note the URL `https://heroscall-server.<sub>.workers.dev`. If the name is
      taken, change `name` in `wrangler.toml` to the closest free variant and tell the owner.
- [ ] **Step 3:** **Ask the owner to run** `npx wrangler secret put ADMIN_PASSWORD` in `backend` and type a password.
      Never see or echo it.
- [ ] **Step 4:** Start `npx wrangler tail heroscall-server --format json > <scratchpad>/tail.json` in the background.
      Then run `npm run smoke -- https://heroscall-server.<sub>.workers.dev` twice. Expected: exit 0 both times.
- [ ] **Step 5:** Stop the tail and inspect it:
  - Expected: no event with `outcome` of `exceededCpu`, `exceededMemory` or `exceededResources`.
  - Record the largest `cpuTime` seen, if the field exists. Otherwise check the dashboard: Workers → heroscall-server →
    Metrics → CPU time.
- [ ] **Gate:** if any CPU or resource limit was hit and cannot be fixed with a small change, **stop and report to the
      owner.** The fallback is Render or Railway (about $5–7/month). Do not go further without their decision.

### Task 8: Pages deploy and cleanup

**Files:**
- Create:
  - `frontend/public/_headers`: `/hero-images/*` with `Cache-Control: public, max-age=86400`, and `/assets/*` with
    `Cache-Control: public, max-age=31536000, immutable`
  - `frontend/.env.production`: `VITE_API_BASE_URL` and `VITE_SOCKET_URL`, both set to the workers.dev URL from
    Task 7
  - `docs/DEPLOY_CLOUDFLARE.md`
- Modify:
  - `frontend/package.json`: add `"deploy": "npm run build && node scripts/copy-assets.mjs && wrangler pages deploy
    dist --project-name heroscall --branch main"` and the `wrangler` devDependency
  - `frontend/index.html`: remove `<script src="/config.js">`
  - `frontend/scripts/copy-assets.mjs`: update the comment from Vercel to Pages
  - root `package.json`: replace the `docker:*` scripts with `"deploy:server"` (`cd backend && npm run deploy`) and
    `"deploy:site"` (`cd frontend && npm run deploy`)
  - `README.md`: update the hosting and run sections
- Delete:
  - `frontend/vercel.json`, `frontend/public/config.js`, `frontend/Dockerfile`, `frontend/docker-entrypoint.sh`
  - `backend/Dockerfile`, `docker-compose.yml`, `docs/DEPLOY_VERCEL.md`
  - `backend/game_database.sqlite` and `backend/data/` (only if tracked in git and unused; check with `git ls-files`)

- [ ] **Step 1:** Create the Pages project with `npx wrangler pages project create heroscall --production-branch main`
      (or a free variant, and tell the owner). Then run `npm run deploy` in `frontend`.
- [ ] **Step 2:** If the final Pages URL is not `https://heroscall.pages.dev`, update `ALLOWED_ORIGINS` in
      `wrangler.toml` and redeploy the Worker. Then
      `curl -I https://<pages-url>/hero-images/<any file in frontend/hero-images>`. Expected: 200 with the cache
      header.
- [ ] **Step 3:** `DEPLOY_CLOUDFLARE.md` covers:
  - the two deploy commands
  - the `ADMIN_PASSWORD` secret
  - local dev (`wrangler dev` plus `npm run dev`)
  - free-plan limits and what happens when one is exceeded
  - that a deploy restarts the server and ends live matches
- [ ] **Step 4:** Run `cd backend; npm test`, `cd ../frontend; npx vitest run; npm run build`. Expected: all pass.
      Also run `git grep -n "8363742\|vercel\|ericellb"`. Expected: no hits outside `docs/superpowers/`.
- [ ] **Step 5:** Commit: `feat(deploy): website on Cloudflare Pages; remove Docker and Vercel setup`.

### Task 9: Live end-to-end pass (controller, Playwright)

- [ ] **Step 1:** Open `https://heroscall.pages.dev` (or the final URL) in two separate browser contexts. Register two
      accounts.
- [ ] **Step 2:** Exercise every mode in the spec's Success list:
  - draft match to the end
  - random match
  - friendly room
  - survival
  - gauntlet trial plus camp, saving and returning to the lobby
  - tutorial
  - spectate a live match from a third context
  - friend request, challenge and message
  - shop purchase
  - quests
  - collection and favourites
  - profile icon
  - Quick admin login

  Expected: no console errors from the realtime client, and behaviour the same as on the old server.
- [ ] **Step 3:** Reconnect check: in a running battle, set one context offline for 5 s, then back online. Expected:
      the match resumes.
- [ ] **Step 4:** Check `wrangler tail` during this pass. Expected: no `exceeded*` outcomes.
- [ ] **Step 5:** Fix anything found, with a test where practical, redeploy and re-check. Then run the whole-branch
      review on Opus. Report to the owner. **Do not push or merge** without their go-ahead, and remind them to tell
      their friend the old server can be shut down.
