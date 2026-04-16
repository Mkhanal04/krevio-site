// Health check endpoint — pinged by UptimeRobot every 5 minutes.
// No rate limiting or origin gating — monitoring services need open access.

export default function handler(req, res) {
  // CORS headers for monitoring services
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const checks = {
    google_api_key: !!process.env.GOOGLE_GENERATIVE_AI_API_KEY,
    resend_api_key: !!process.env.RESEND_API_KEY
  };

  // GOOGLE_GENERATIVE_AI_API_KEY is critical — chat and TTS depend on it.
  // RESEND_API_KEY is non-critical — email notifications degrade gracefully.
  const critical = checks.google_api_key;
  const status = critical ? 'healthy' : 'degraded';
  const httpCode = critical ? 200 : 503;

  return res.status(httpCode).json({
    status,
    version: '1.0.0',
    timestamp: new Date().toISOString(),
    checks
  });
}
