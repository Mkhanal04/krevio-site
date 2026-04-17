// Health check endpoint — pinged by UptimeRobot every 5 minutes.
// No rate limiting or origin gating — monitoring services need open access.

export default function handler(req, res) {
  // CORS headers for monitoring services
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  // Critical env must be present for the site to function (chat + TTS).
  // Non-critical env (Resend) degrades gracefully — don't block healthy on it.
  // Env var names are deliberately NOT surfaced in the response body; we signal
  // health via HTTP status so monitors flag outages without advertising our
  // secret inventory.
  const healthy = !!process.env.GOOGLE_GENERATIVE_AI_API_KEY;

  return res.status(healthy ? 200 : 503).json({
    status: healthy ? 'healthy' : 'degraded',
    version: '1.0.0',
    timestamp: new Date().toISOString()
  });
}
