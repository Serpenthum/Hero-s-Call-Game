'use strict';
// Minimal express-style router over WHATWG Request/Response.
// No Node-only imports: bundled for Cloudflare Workers.

function compilePath(path) {
  const keys = [];
  const source = path
    .split('/')
    .map(seg => {
      if (seg.startsWith(':')) {
        keys.push(seg.slice(1));
        return '([^/]+)';
      }
      return seg.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    })
    .join('/');
  return { keys, regex: new RegExp('^' + source + '/?$') };
}

function safeDecode(value) {
  try { return decodeURIComponent(value); } catch (_) { return value; }
}

function createRouter() {
  const stack = [];

  // Runs this router's layers in order; `done` is called when none responded.
  function handle(req, res, done) {
    let index = 0;
    const next = (err) => {
      if (err) return done(err);
      const layer = stack[index++];
      if (!layer) return done();
      if (layer.kind === 'route') return runRoute(layer, req, res, next);
      return runUse(layer, req, res, next);
    };
    next();
  }

  function runHandlers(handlers, req, res, next, onError) {
    let i = 0;
    const step = (err) => {
      if (err) return onError(err);
      const fn = handlers[i++];
      if (!fn) return next();
      try {
        const result = typeof fn === 'function' && fn.handle === undefined
          ? fn(req, res, step)
          : fn.handle(req, res, step);
        if (result && typeof result.then === 'function') result.then(undefined, onError);
      } catch (e) {
        onError(e);
      }
    };
    step();
  }

  function runRoute(layer, req, res, next) {
    if (layer.method !== req.method) return next();
    const match = layer.regex.exec(req.path);
    if (!match) return next();
    const saved = req.params;
    req.params = { ...saved };
    layer.keys.forEach((k, i) => { req.params[k] = safeDecode(match[i + 1]); });
    runHandlers(layer.handlers, req, res, (e) => { req.params = saved; next(e); }, res._fail);
  }

  function runUse(layer, req, res, next) {
    if (layer.prefix === null) {
      return runHandlers([layer.handler], req, res, next, res._fail);
    }
    const p = req.path;
    if (p !== layer.prefix && !p.startsWith(layer.prefix + '/')) return next();
    const savedPath = req.path;
    req.path = p.slice(layer.prefix.length) || '/';
    runHandlers([layer.handler], req, res, (e) => { req.path = savedPath; next(e); }, res._fail);
  }

  const router = {
    get(path, ...handlers) {
      const { keys, regex } = compilePath(path);
      stack.push({ kind: 'route', method: 'GET', keys, regex, handlers });
      return router;
    },
    post(path, ...handlers) {
      const { keys, regex } = compilePath(path);
      stack.push({ kind: 'route', method: 'POST', keys, regex, handlers });
      return router;
    },
    use(a, b) {
      if (typeof a === 'string') {
        stack.push({ kind: 'use', prefix: a.replace(/\/+$/, ''), handler: b });
      } else {
        stack.push({ kind: 'use', prefix: null, handler: a });
      }
      return router;
    },
    handle,
  };
  return router;
}

const MAX_BODY_BYTES = 102400; // 100 KB
const HANDLER_TIMEOUT_MS = 25000;

// Reads the request body as text, giving up (null) once it exceeds maxBytes.
async function readBodyCapped(request, maxBytes) {
  const declared = Number(request.headers.get('content-length'));
  if (declared > maxBytes) return null;
  if (!request.body) return '';
  const reader = request.body.getReader();
  const chunks = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      try { await reader.cancel(); } catch (_) { /* ignore */ }
      return null;
    }
    chunks.push(value);
  }
  const all = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) { all.set(c, offset); offset += c.byteLength; }
  return new TextDecoder().decode(all);
}

async function handleFetch(router, request) {
  const url = new URL(request.url);
  const headers = {};
  request.headers.forEach((value, name) => { headers[name.toLowerCase()] = value; });
  const query = {};
  url.searchParams.forEach((value, key) => { query[key] = value; });

  let body = {};
  const contentType = headers['content-type'] || '';
  if (request.method !== 'GET' && request.method !== 'HEAD' && contentType.includes('json')) {
    const text = await readBodyCapped(request, MAX_BODY_BYTES);
    if (text === null) {
      return jsonResponse(413, { success: false, message: 'Payload too large' }, {});
    }
    if (text.trim()) {
      try {
        body = JSON.parse(text);
      } catch (_) {
        return jsonResponse(400, { success: false, message: 'Invalid JSON' }, {});
      }
    }
  }

  const req = { method: request.method, path: url.pathname, params: {}, query, headers, body };

  return new Promise((resolve) => {
    let status = 200;
    const outHeaders = {};
    let finished = false;
    const timer = setTimeout(() => {
      console.error('Route handler timed out:', req.method, req.path);
      finish(jsonResponse(500, { success: false, message: 'Server error' }, {}));
    }, HANDLER_TIMEOUT_MS);
    const finish = (response) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      resolve(response);
    };
    const res = {
      status(n) { status = n; return res; },
      set(name, value) { outHeaders[name] = value; return res; },
      json(obj) { finish(jsonResponse(status, obj, outHeaders)); return res; },
      _fail(err) {
        console.error('Unhandled route error:', err);
        finish(jsonResponse(500, { success: false, message: 'Server error' }, {}));
      },
    };
    router.handle(req, res, (err) => {
      if (err) return res._fail(err);
      finish(jsonResponse(404, { error: 'Not found' }, {}));
    });
  });
}

function jsonResponse(status, obj, extraHeaders) {
  return new Response(JSON.stringify(obj === undefined ? null : obj), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', ...extraHeaders },
  });
}

module.exports = { createRouter, handleFetch };
