// Smoke test against a running server: node scripts/smoke.mjs http://127.0.0.1:8787
const base = (process.argv[2] || 'http://127.0.0.1:8787').replace(/\/$/, '');
const wsBase = base.replace(/^http/, 'ws');

function fail(msg) {
  console.error('SMOKE FAIL: ' + msg);
  process.exit(1);
}

async function step(name, fn) {
  const t0 = performance.now();
  try {
    const r = await fn();
    console.log(`ok  ${name} (${Math.round(performance.now() - t0)} ms)`);
    return r;
  } catch (e) {
    fail(`${name}: ${e && e.message ? e.message : e}`);
  }
}

async function post(path, body) {
  const res = await fetch(base + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const json = await res.json();
  if (!res.ok || json.success === false) throw new Error(`${path} -> ${res.status} ${JSON.stringify(json)}`);
  return json;
}

function client() {
  const ws = new WebSocket(wsBase + '/ws');
  const frames = [];
  const waiters = [];
  const acks = new Map();
  let nextAck = 1;
  ws.addEventListener('message', (ev) => {
    if (typeof ev.data !== 'string') return;
    const f = JSON.parse(ev.data);
    if (f.t === '__ack') {
      const r = acks.get(f.a);
      if (r) { acks.delete(f.a); r(f.d); }
      return;
    }
    frames.push(f);
    for (const w of waiters.slice()) w();
  });
  const opened = new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve);
    ws.addEventListener('error', () => reject(new Error('websocket error (connection refused?)')));
  });
  const waitFor = (t, pred = () => true, ms = 5000) =>
    new Promise((resolve, reject) => {
      const check = () => {
        const f = frames.find((x) => x.t === t && pred(x.d[0]));
        if (f) { cleanup(); resolve(f.d[0]); }
      };
      const timer = setTimeout(() => { cleanup(); reject(new Error(`timeout waiting for ${t}`)); }, ms);
      const cleanup = () => { clearTimeout(timer); const i = waiters.indexOf(check); if (i >= 0) waiters.splice(i, 1); };
      waiters.push(check);
      check();
    });
  return {
    ws, frames, opened, waitFor,
    send: (t, ...d) => ws.send(JSON.stringify({ t, d })),
    sendAck: (t, ms = 2000) => new Promise((resolve, reject) => {
      const a = nextAck++;
      const timer = setTimeout(() => { acks.delete(a); reject(new Error(`no ack for ${t}`)); }, ms);
      acks.set(a, (d) => { clearTimeout(timer); resolve(d); });
      ws.send(JSON.stringify({ t, d: [], a }));
    }),
  };
}

const rnd = () => 's' + String(Math.floor(Math.random() * 1e8)).padStart(8, '0');

const users = [];
await step('register + login 2 users', async () => {
  for (let i = 0; i < 2; i++) {
    const username = rnd();
    await post('/api/register', { username, password: 'secret123' });
    const l = await post('/api/login', { username, password: 'secret123' });
    users.push({ username, id: l.user.id, token: l.token });
  }
});

// Draft mode unlocks at level 3, so the game itself is played by two admin accounts
// (password from SMOKE_ADMIN_PASSWORD, default matches .dev.vars). The random users above
// prove register/login; their sockets are authenticated below too.
const adminPw = process.env.SMOKE_ADMIN_PASSWORD || 'localdev123';
const admins = [];
await step('login Admin2 + Admin3', async () => {
  for (const username of ['Admin2', 'Admin3']) {
    const l = await post('/api/login', { username, password: adminPw });
    admins.push({ username, id: l.user.id, token: l.token });
  }
});

const clients = [client(), client()];
await step('open 2 websockets + __welcome', async () => {
  await Promise.all(clients.map((c) => c.opened));
  await Promise.all(clients.map((c) => c.waitFor('__welcome')));
});

await step('authenticate', async () => {
  clients.forEach((c, i) => c.send('authenticate', { userId: admins[i].id, token: admins[i].token }));
  await Promise.all(clients.map((c) => c.waitFor('authentication-success')));
});

await step('authenticate random users on extra sockets', async () => {
  const extra = users.map(() => client());
  await Promise.all(extra.map((c) => c.opened));
  extra.forEach((c, i) => c.send('authenticate', { userId: users[i].id, token: users[i].token }));
  await Promise.all(extra.map((c) => c.waitFor('authentication-success')));
  extra.forEach((c) => c.ws.close());
});

await step('join-game draft (matching gameId)', async () => {
  clients.forEach((c, i) => c.send('join-game', { name: admins[i].username, mode: 'draft' }));
  const [a, b] = await Promise.all(clients.map((c) => c.waitFor('join-result', (d) => d && d.gameId)));
  if (a.gameId !== b.gameId) throw new Error(`gameId mismatch ${a.gameId} vs ${b.gameId}`);
});

await step('>=2 draft-timer events within 4s', async () => {
  // The server emits one draft-timer per round start (on a 1s interval tick), so count both sockets.
  const t0 = Date.now();
  const count = () => clients.reduce((n, c) => n + c.frames.filter((f) => f.t === 'draft-timer').length, 0);
  while (count() < 2) {
    if (Date.now() - t0 > 4000) throw new Error('fewer than 2 draft-timer events');
    await new Promise((r) => setTimeout(r, 50));
  }
});

await step('auto-draft -> auto-draft-complete', async () => {
  clients.forEach((c) => c.send('auto-draft'));
  await clients[0].waitFor('auto-draft-complete');
});

await step('latency-ping ack', async () => {
  await clients[0].sendAck('latency-ping', 2000);
});

clients.forEach((c) => c.ws.close());
console.log('SMOKE OK');
process.exit(0);
