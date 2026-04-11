import { applyCors, isAllowedOrigin, getClientIp, rateLimit, bodyTooLarge } from './_lib/limits.js';

// Cost protection — this endpoint writes to Supabase chatbot_conversations
// on every chat session end. A loop POSTing junk would fill the table and
// chew up Supabase row quota. Limits:
// - Origin allowlist via _lib/limits.js
// - Rate limit: 10 req / min / IP (real users end ~1 session per visit)
// - Body cap: 64 KB (messages_json itself can be 50 KB after the existing
//   sanitize step, plus session metadata)

export default async function handler(req, res) {
  const origin = applyCors(req, res);

  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ success: false, message: 'Method not allowed' });

  if (!isAllowedOrigin(origin)) {
    console.warn('[Krevio Conversation] origin rejected:', origin);
    return res.status(200).json({ success: true });
  }

  if (bodyTooLarge(req, 64 * 1024)) {
    console.warn('[Krevio Conversation] body too large:', req.headers['content-length']);
    return res.status(200).json({ success: true });
  }

  const ip = getClientIp(req);
  if (rateLimit({ key: 'log-conversation', ip, limit: 10, windowMs: 60_000 })) {
    console.warn('[Krevio Conversation] rate-limited ip:', ip);
    return res.status(200).json({ success: true });
  }

  // Parse body — sendBeacon may send as text/plain even with Blob
  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch (e) {
      return res.status(400).json({ success: false, message: 'Invalid JSON' });
    }
  }

  const { sessionId, messages, messageCount, industryMentioned, demoRequested, leadCaptured, language, durationSeconds } = body || {};

  // Validate required fields
  if (!sessionId || typeof sessionId !== 'string') {
    return res.status(400).json({ success: false, message: 'sessionId required' });
  }
  if (!Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ success: false, message: 'messages required' });
  }
  if (!messageCount || messageCount < 1) {
    return res.status(400).json({ success: false, message: 'messageCount must be >= 1' });
  }

  // Sanitize
  const sanitize = (v, max = 500) => typeof v === 'string' ? v.trim().slice(0, max) : v;
  const messagesJson = JSON.stringify(messages).slice(0, 50000); // cap at 50KB

  const conversation = {
    session_id: sanitize(sessionId),
    messages: messagesJson,
    message_count: Math.min(Number(messageCount) || 0, 999),
    industry_mentioned: sanitize(industryMentioned) || null,
    demo_requested: sanitize(demoRequested) || null,
    lead_captured: Boolean(leadCaptured),
    language: sanitize(language || 'en', 10),
    duration_seconds: Math.min(Math.max(Number(durationSeconds) || 0, 0), 86400),
    source: 'krevio.net',
    user_agent: (req.headers['user-agent'] || '').slice(0, 500),
    created_at: new Date().toISOString()
  };

  console.log('[Krevio Conversation]', JSON.stringify({
    session_id: conversation.session_id,
    message_count: conversation.message_count,
    industry_mentioned: conversation.industry_mentioned,
    demo_requested: conversation.demo_requested,
    lead_captured: conversation.lead_captured,
    duration_seconds: conversation.duration_seconds
  }));

  // Insert into Supabase
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_KEY;

  if (supabaseUrl && supabaseKey) {
    try {
      const sbRes = await fetch(`${supabaseUrl}/rest/v1/chatbot_conversations`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': supabaseKey,
          'Authorization': `Bearer ${supabaseKey}`,
          'Prefer': 'return=minimal'
        },
        body: JSON.stringify(conversation),
        signal: AbortSignal.timeout(5000)
      });
      if (!sbRes.ok) {
        console.warn('[Krevio Conversation] Supabase insert failed:', sbRes.status);
      }
    } catch (err) {
      console.warn('[Krevio Conversation] Supabase error (non-fatal):', err.message);
    }
  }

  return res.status(200).json({ success: true });
}
