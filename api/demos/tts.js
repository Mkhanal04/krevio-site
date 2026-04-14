// Google Cloud Text-to-Speech — Journey/Neural2 voices
// Uses GOOGLE_TTS_API_KEY (separate key restricted to Cloud TTS).
// Falls back to GOOGLE_GENERATIVE_AI_API_KEY if the TTS-specific key isn't set.
// Requires "Cloud Text-to-Speech API" enabled in the GCP project
//
// Cost protection (Cloud TTS Journey-F is $16/1M chars — a determined
// loop can rack up real money fast):
// - Origin allowlist via _lib/limits.js
// - Per-IP rate limit: 10 req / 60s
// - Hard text cap: 500 chars (was 1000; demo greetings + replies fit easily)
// - Body cap: 4 KB
// - In-memory LRU response cache keyed by sha256(text + voice + lang),
//   max 200 entries, 1 hr TTL. THIS IS THE BIGGEST WIN: demo replay
//   (greeting, quick replies, repeated bot answers) hits the same strings
//   over and over. Cache hits cost $0 — they don't touch Cloud TTS at all.
//
// Real KV-backed limiting + cache come in Wave 2 (TD-018).

import crypto from 'node:crypto';
import { applyCors, isAllowedOrigin, getClientIp, rateLimit, bodyTooLarge } from '../_lib/limits.js';

const MAX_TEXT_CHARS = 500;
const MAX_BODY_BYTES = 4 * 1024;

// LRU cache: hash -> { buffer, expiresAt }. Insertion order = LRU order
// (Map preserves insertion order in JS). On hit, delete + re-set to bump
// to most-recent. On overflow, drop oldest entry.
const CACHE_MAX = 200;
const CACHE_TTL_MS = 60 * 60 * 1000;
const cache = new Map();

function cacheKey(text, voiceName, languageCode) {
  return crypto.createHash('sha256').update(`${voiceName}|${languageCode}|${text}`).digest('hex');
}

function cacheGet(key) {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    cache.delete(key);
    return null;
  }
  // Bump to MRU
  cache.delete(key);
  cache.set(key, entry);
  return entry.buffer;
}

function cacheSet(key, buffer) {
  if (cache.size >= CACHE_MAX) {
    // Drop oldest (first key in insertion order)
    const oldest = cache.keys().next().value;
    if (oldest) cache.delete(oldest);
  }
  cache.set(key, { buffer, expiresAt: Date.now() + CACHE_TTL_MS });
}

export default async function handler(req, res) {
  const origin = applyCors(req, res);

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).end('Method Not Allowed');
  }

  // Origin gate — TTS is the most expensive endpoint per call. Reject any
  // POST that isn't from a known browser surface.
  if (!isAllowedOrigin(origin)) {
    console.warn('[TTS] origin rejected:', origin);
    return res.status(403).json({ error: 'origin not allowed' });
  }

  if (bodyTooLarge(req, MAX_BODY_BYTES)) {
    console.warn('[TTS] body too large:', req.headers['content-length']);
    return res.status(413).json({ error: 'payload too large' });
  }

  const ip = getClientIp(req);
  if (rateLimit({ key: 'tts', ip, limit: 10, windowMs: 60_000 })) {
    res.setHeader('Retry-After', '60');
    console.warn('[TTS] rate-limited ip:', ip);
    return res.status(429).json({ error: 'rate limit exceeded' });
  }

  const { text, lang = 'en-US' } = req.body || {};
  if (!text || typeof text !== 'string') {
    return res.status(400).json({ error: 'text is required' });
  }
  if (text.length > MAX_TEXT_CHARS) {
    console.warn('[TTS] oversized text:', text.length, 'chars from ip:', ip);
    return res.status(400).json({ error: 'text exceeds max length' });
  }

  const apiKey = process.env.GOOGLE_TTS_API_KEY || process.env.GOOGLE_GENERATIVE_AI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'TTS API key not configured' });
  }

  const isSpanish = lang.startsWith('es');
  const voiceName    = isSpanish ? 'es-US-Neural2-A' : 'en-US-Journey-F';
  const languageCode = isSpanish ? 'es-US'           : 'en-US';

  // Cache lookup BEFORE we hit Cloud TTS. The cache key includes voice +
  // lang so en/es and any future voice swap don't collide.
  const key = cacheKey(text, voiceName, languageCode);
  const cached = cacheGet(key);
  if (cached) {
    res.setHeader('Content-Type', 'audio/mpeg');
    res.setHeader('Content-Length', cached.length);
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Krevio-Cache', 'hit');
    return res.send(cached);
  }

  const payload = {
    input: { text },
    voice: { languageCode, name: voiceName },
    audioConfig: {
      audioEncoding: 'MP3',
      speakingRate: 1.0,
      // pitch omitted — Journey voices reject it with 400
    },
  };

  const url = `https://texttospeech.googleapis.com/v1/text:synthesize?key=${apiKey}`;

  let gRes;
  try {
    gRes = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
  } catch (err) {
    console.error('TTS fetch error:', err);
    return res.status(502).json({ error: 'upstream fetch failed' });
  }

  if (!gRes.ok) {
    const errBody = await gRes.json().catch(() => ({}));
    console.error('TTS API error:', gRes.status, errBody);
    return res.status(gRes.status).json({ error: errBody?.error?.message || 'TTS API error' });
  }

  const { audioContent } = await gRes.json();
  if (!audioContent) {
    return res.status(500).json({ error: 'no audio returned' });
  }

  const buffer = Buffer.from(audioContent, 'base64');
  cacheSet(key, buffer);

  res.setHeader('Content-Type', 'audio/mpeg');
  res.setHeader('Content-Length', buffer.length);
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Krevio-Cache', 'miss');
  res.send(buffer);
}
