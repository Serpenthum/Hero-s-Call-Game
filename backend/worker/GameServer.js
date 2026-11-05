import { DurableObject } from 'cloudflare:workers';
import { createCompatDb } from '../sql/compat.js';
import { createDoSqlDriver } from './doSqlDriver.js';
import Database from '../database.js';
import { createHub } from '../realtime/hub.js';
import { createRouter, handleFetch } from '../http/router.js';
import { createGameServer } from '../gameServer.js';

export class GameServer extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.ready = ctx.blockConcurrencyWhile(async () => {
      const driver = createDoSqlDriver(ctx.storage.sql);
      const database = new Database(createCompatDb(driver));
      this.io = createHub();
      this.router = createRouter();
      this.server = await createGameServer({
        io: this.io,
        router: this.router,
        database,
        env: { ADMIN_PASSWORD: env.ADMIN_PASSWORD },
      });
    });
  }

  async fetch(request) {
    await this.ready;
    const url = new URL(request.url);
    if (url.pathname === '/ws' && request.headers.get('Upgrade') === 'websocket') {
      const pair = new WebSocketPair();
      const [client, server] = Object.values(pair);
      server.accept();
      const conn = this.io.attach({
        send: (t) => server.send(t),
        close: (c, r) => server.close(c ?? 1000, r),
      });
      server.addEventListener('message', (ev) => {
        if (typeof ev.data === 'string') conn.receive(ev.data);
      });
      server.addEventListener('close', () => conn.closed());
      server.addEventListener('error', () => conn.closed());
      return new Response(null, { status: 101, webSocket: client });
    }
    return handleFetch(this.router, request);
  }
}
