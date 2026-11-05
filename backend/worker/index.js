export { GameServer } from './GameServer.js';

function allowedOrigins(env) {
  return (env.ALLOWED_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean);
}

function corsHeaders(origin) {
  return {
    'Access-Control-Allow-Origin': origin,
    'Vary': 'Origin',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  };
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const origin = request.headers.get('Origin');
    const allowed = origin && allowedOrigins(env).includes(origin);

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: allowed ? corsHeaders(origin) : {} });
    }

    const isWs = url.pathname === '/ws';
    if (!isWs && !url.pathname.startsWith('/api/')) {
      return new Response('Not found', { status: 404 });
    }
    if (isWs && request.headers.get('Upgrade') === 'websocket' && origin && !allowed) {
      return new Response('Forbidden', { status: 403 });
    }

    const stub = env.GAME.get(env.GAME.idFromName('main'));
    const response = await stub.fetch(request);
    if (response.status === 101 || !allowed) return response;

    const out = new Response(response.body, response);
    for (const [k, v] of Object.entries(corsHeaders(origin))) out.headers.set(k, v);
    return out;
  },
};
