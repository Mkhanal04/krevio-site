// Google Cloud Text-to-Speech — Journey/Neural2 voices
// Uses the same GOOGLE_GENERATIVE_AI_API_KEY already in Vercel env
// Requires "Cloud Text-to-Speech API" enabled in the GCP project
//
// Spend protection:
// - Per-IP rate limit (10 req / 60s, in-memory, per warm Vercel instance)
// - Hard text size cap (1000 chars; oversized rejected with 400)
// - Returns 429 with Retry-After header on rate limit
// Real KV-backed limiting comes in Wave 2.

const RATE_BUCKET = new Map();
const RATE_LIMIT = 10;
const RATE_WINDOW_MS = 60_000;
const MAX_TEXT_CHARS = 1000;

function getClientIp(req) {
  const xff = req.headers['x-forwarded-for'];
  if (typeof xff === 'string' && xff.length) return xff.split(',')[0].trim();
  return req.socket?.remoteAddress || 'unknown';
}

function rateLimited(ip) {
  const now = Date.now();
  const bucket = RATE_BUCKET.get(ip);
  if (!bucket || now - bucket.windowStart > RATE_WINDOW_MS) {
    RATE_BUCKET.set(ip, { count: 1, windowStart: now });
    return false;
  }
  bucket.count += 1;
  return bucket.count > RATE_LIMIT;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).end('Method Not Allowed');
  }

  const ip = getClientIp(req);
  if (rateLimited(ip)) {
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

  const apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'TTS API key not configured' });
  }

  const isSpanish = lang.startsWith('es');
  const voiceName    = isSpanish ? 'es-US-Neural2-A' : 'en-US-Journey-F';
  const languageCode = isSpanish ? 'es-US'           : 'en-US';

  const payload = {
    input: { text: text.slice(0, 1000) },
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
  res.setHeader('Content-Type', 'audio/mpeg');
  res.setHeader('Content-Length', buffer.length);
  res.setHeader('Cache-Control', 'no-store');
  res.send(buffer);
}
