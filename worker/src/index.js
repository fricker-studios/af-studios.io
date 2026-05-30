// BFE content Worker — fronts the private R2 bucket with a shared-secret check.
//
// Public surface:
//   GET https://<worker-url>/bfe/manifest.json
//   GET https://<worker-url>/bfe/batch-<n>.json
//
// Auth:
//   Authorization: Bearer <APP_SECRET>
//
// APP_SECRET is set as a Worker secret (`wrangler secret put APP_SECRET`) and
// is the SAME value baked into the Flutter app's kContentApiKey constant.
//
// R2 bucket binding "BFE_CONTENT" → bucket name "bfe-content" (see wrangler.toml).

const ALLOWED = /^batch-\d+\.json$|^manifest\.json$/;
const PREFIX = '/bfe/';

function unauthorized() {
  return new Response('Unauthorized', { status: 401 });
}

function notFound() {
  return new Response('Not Found', { status: 404 });
}

function methodNotAllowed() {
  return new Response('Method Not Allowed', { status: 405 });
}

function timingSafeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return result === 0;
}

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: {
          'access-control-allow-origin': '*',
          'access-control-allow-headers': 'authorization',
          'access-control-allow-methods': 'GET, OPTIONS',
          'access-control-max-age': '86400',
        },
      });
    }
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      return methodNotAllowed();
    }

    const expected = env.APP_SECRET;
    if (!expected) {
      // Misconfigured worker — fail closed.
      return new Response('Server misconfigured', { status: 500 });
    }
    const auth = request.headers.get('authorization') || '';
    const presented = auth.startsWith('Bearer ') ? auth.slice(7) : '';
    if (!timingSafeEqual(presented, expected)) return unauthorized();

    const url = new URL(request.url);
    if (!url.pathname.startsWith(PREFIX)) return notFound();
    const key = url.pathname.slice(PREFIX.length);
    if (!ALLOWED.test(key)) return notFound();

    const object = await env.BFE_CONTENT.get(key);
    if (object === null) return notFound();

    return new Response(object.body, {
      headers: {
        'content-type': 'application/json',
        'cache-control': 'public, max-age=300',
        etag: object.httpEtag,
        'access-control-allow-origin': '*',
      },
    });
  },
};
