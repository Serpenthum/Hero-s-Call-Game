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

async function handleFetch(router, request) {
  const url = new URL(request.url);
  const headers = {};
  request.headers.forEach((value, name) => { headers[name.toLowerCase()] = value; });
  const query = {};
  url.searchParams.forEach((value, key) => { query[key] = value; });

  let body = {};
  const contentType = headers['content-type'] || '';
  if (request.method !== 'GET' && request.method !== 'HEAD' && contentType.includes('json')) {
    const text = await request.text();
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
    const finish = (response) => {
      if (finished) return;
      finished = true;
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
