import { applyCors, isAllowedOrigin, getClientIp, rateLimit, bodyTooLarge } from './_lib/limits.js';

// Cost protection — Supabase free tier is generous but a spam loop can
// fill the demo_inquiries table fast and trigger Resend notifications
// every iteration. Limits:
// - Origin allowlist via _lib/limits.js
// - Rate limit: 5 req / min / IP (real submission is one-and-done)
// - Body cap: 8 KB
// Returns success-shape on rejection so probers can't enumerate the rules.

export default async function handler(req, res) {
  const origin = applyCors(req, res);

  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ success: false, message: 'Method not allowed' });

  if (!isAllowedOrigin(origin)) {
    console.warn('[Krevio Inquiry] origin rejected:', origin);
    return res.status(200).json({ success: true, message: "Thank you! We'll reach out within 24 hours." });
  }

  if (bodyTooLarge(req, 8 * 1024)) {
    console.warn('[Krevio Inquiry] body too large:', req.headers['content-length']);
    return res.status(200).json({ success: true, message: "Thank you! We'll reach out within 24 hours." });
  }

  const ip = getClientIp(req);
  if (rateLimit({ key: 'inquiry', ip, limit: 5, windowMs: 60_000 })) {
    console.warn('[Krevio Inquiry] rate-limited ip:', ip);
    return res.status(200).json({ success: true, message: "Thank you! We'll reach out within 24 hours." });
  }

  const body = req.body || {};
  const { name, email, industry } = body;

  // Validate required fields
  if (!name || !email || !industry) {
    return res.status(400).json({ success: false, message: 'Name, email, and industry are required.' });
  }

  // Basic email validation
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ success: false, message: 'Please enter a valid email address.' });
  }

  // Sanitize inputs
  const sanitize = (v) => typeof v === 'string' ? v.trim().slice(0, 500) : v;

  const inquiry = {
    name: sanitize(name),
    email: sanitize(email),
    phone: sanitize(body.phone || ''),
    business_name: sanitize(body.businessName || ''),
    industry: sanitize(industry),
    additional_notes: sanitize(body.additionalNotes || ''),
    source: ['krevio.net', 'krevio-chatbot', 'krevio-quote-flow'].includes(body.source) ? body.source : 'krevio.net',
    created_at: new Date().toISOString()
  };

  console.log('[Krevio Inquiry]', JSON.stringify(inquiry));

  // Insert into Supabase demo_inquiries table
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_KEY;

  if (supabaseUrl && supabaseKey) {
    try {
      const sbRes = await fetch(`${supabaseUrl}/rest/v1/demo_inquiries`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': supabaseKey,
          'Authorization': `Bearer ${supabaseKey}`,
          'Prefer': 'return=minimal'
        },
        body: JSON.stringify(inquiry),
        signal: AbortSignal.timeout(5000)
      });
      if (!sbRes.ok) {
        console.warn('[Krevio Inquiry] Supabase insert failed:', sbRes.status);
      }
    } catch (err) {
      console.warn('[Krevio Inquiry] Supabase error (non-fatal):', err.message);
    }
  }

  // Email notification via Resend (fire-and-forget, non-blocking).
  // api/notify.js handles the 'inquiry' type — graceful degradation when RESEND_API_KEY is unset.
  try {
    const host = req.headers.host || 'krevio.net';
    const proto = host.startsWith('localhost') || host.startsWith('127.0.0.1') ? 'http' : 'https';
    fetch(`${proto}://${host}/api/notify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'inquiry',
        name: inquiry.name,
        email: inquiry.email,
        phone: inquiry.phone,
        businessName: inquiry.business_name,
        industry: inquiry.industry,
        source: inquiry.source,
        description: inquiry.additional_notes || '',
        timestamp: inquiry.created_at,
      }),
      signal: AbortSignal.timeout(3000),
    }).catch((err) => console.warn('[Krevio Inquiry] Notify fetch failed (non-fatal):', err.message));
  } catch (err) {
    console.warn('[Krevio Inquiry] Notify setup failed (non-fatal):', err.message);
  }

  // Webhook notification (Discord or similar — separate channel)
  const webhookUrl = process.env.NOTIFICATION_WEBHOOK_URL;
  if (webhookUrl) {
    try {
      await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content: `🔔 **New Krevio Inquiry${inquiry.source !== 'krevio.net' ? ` (via ${inquiry.source === 'krevio-chatbot' ? 'Chatbot' : 'Quote Flow'})` : ''}**\n**Name:** ${inquiry.name}\n**Email:** ${inquiry.email}\n**Industry:** ${inquiry.industry}\n**Business:** ${inquiry.business_name || 'N/A'}\n**Phone:** ${inquiry.phone || 'N/A'}\n**Source:** ${inquiry.source}`
        }),
        signal: AbortSignal.timeout(3000)
      });
    } catch (err) {
      console.warn('[Krevio Inquiry] Webhook notification failed (non-fatal):', err.message);
    }
  }

  return res.status(200).json({
    success: true,
    message: "Thank you! We'll reach out within 24 hours."
  });
}
