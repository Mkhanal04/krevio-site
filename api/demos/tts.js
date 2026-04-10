// Google Cloud Text-to-Speech — Journey/Neural2 voices
// Uses the same GOOGLE_GENERATIVE_AI_API_KEY already in Vercel env
// Requires "Cloud Text-to-Speech API" enabled in the GCP project

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).end('Method Not Allowed');
  }

  const { text, lang = 'en-US' } = req.body || {};
  if (!text || typeof text !== 'string') {
    return res.status(400).json({ error: 'text is required' });
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
