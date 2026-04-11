// Shared rate-limit + origin-allowlist utility for all api/* endpoints.
//
// Why one file: every endpoint had its own copy of (a) the allowlist,
// (b) a token bucket, (c) an Origin check. Drift was inevitable. This
// centralizes the policy so the next agent only changes one place.
//
// Token bucket is in-memory, scoped to the warm Vercel function instance.
// It resets on cold start, so bursty attackers can amortize over restarts.
// Sufficient for current traffic; logged as TD-018 to graduate to Vercel KV
// once we have a paying customer worth protecting at that level.
//
// Filename note: Vercel only treats files at the top level of `api/` (and
// nested folders) as serverless functions IF they default-export a handler.
// `_lib/limits.js` exports named utilities only — Vercel will not deploy
// it as a route. The leading underscore is also a community convention for
// "this is a helper, not a route".

export const ALLOWED_ORIGINS = [
  'https://krevio.net',
  'https://www.krevio.net',
  'https://krevio-site.vercel.app',
  'http://localhost:3000',
  'http://localhost:5500',
  'http://127.0.0.1:5500',
];

const VERCEL_PREVIEW_RE = /^https:\/\/krevio-site[a-z0-9-]*\.vercel\.app$/;

/**
 * @param {string} origin - the value of req.headers.origin (may be empty)
 * @param {{ allowEmpty?: boolean }} [opts] - allowEmpty for server-to-server
 *   calls where Origin is not set (e.g. inquiry → notify internal fetch)
 */
export function isAllowedOrigin(origin, opts = {}) {
  if (!origin) return Boolean(opts.allowEmpty);
  if (ALLOWED_ORIGINS.includes(origin)) return true;
  if (VERCEL_PREVIEW_RE.test(origin)) return true;
  return false;
}

/**
 * Sets the standard CORS + Vary headers on the response. Falls back to the
 * canonical origin (krevio.net) when the caller's origin isn't allowed, so
 * the browser blocks the response without leaking which origins ARE allowed.
 */
export function applyCors(req, res) {
  const origin = req.headers.origin || '';
  const corsOrigin = isAllowedOrigin(origin) ? origin : ALLOWED_ORIGINS[0];
  res.setHeader('Access-Control-Allow-Origin', corsOrigin);
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Vary', 'Origin');
  return origin;
}

export function getClientIp(req) {
  const xff = req.headers['x-forwarded-for'];
  if (typeof xff === 'string' && xff.length) return xff.split(',')[0].trim();
  return req.socket?.remoteAddress || 'unknown';
}

// Per-bucket token storage. Each call site passes a unique `key` so e.g.
// the chat endpoint and the TTS endpoint maintain independent counters
// for the same IP.
const BUCKETS = new Map();

/**
 * In-memory token bucket. Returns true if the request is OVER the limit
 * (i.e. should be rejected), false if it's allowed.
 *
 *   if (rateLimit({ key: 'tts', ip, limit: 10, windowMs: 60_000 })) {
 *     return res.status(429)...
 *   }
 *
 * Buckets reset on cold start. Each bucket stores (count, windowStart) per
 * IP. We don't expire entries — Vercel kills the instance often enough that
 * the Map stays small in practice. If a single warm instance survives long
 * enough to accumulate 100K+ unique IPs, that's a real-traffic problem and
 * we should be on KV anyway.
 */
export function rateLimit({ key, ip, limit, windowMs }) {
  const bucketKey = `${key}:${ip}`;
  const now = Date.now();
  const bucket = BUCKETS.get(bucketKey);
  if (!bucket || now - bucket.windowStart > windowMs) {
    BUCKETS.set(bucketKey, { count: 1, windowStart: now });
    return false;
  }
  bucket.count += 1;
  return bucket.count > limit;
}

/**
 * Body size guard. Rejects payloads larger than `maxBytes` based on the
 * Content-Length header. Vercel may not always provide it (chunked
 * transfer), in which case we fall through and let the handler deal with
 * the parsed body. Returns true if the body is OVER the cap.
 */
export function bodyTooLarge(req, maxBytes) {
  const cl = parseInt(req.headers['content-length'] || '0', 10);
  return cl > maxBytes;
}
