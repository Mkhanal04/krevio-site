import { applyCors, isAllowedOrigin, getClientIp, rateLimit, bodyTooLarge } from '../_lib/limits.js';

// Cost protection — same playbook as api/inquiry.js, but this endpoint
// also accepts analytics events from page beacons. Higher rate limit
// (20/min) to leave room for legitimate event traffic; the inquiry path
// is still effectively gated by the slower form-fill cadence.

export default async function handler(req, res) {
  const origin = applyCors(req, res);

  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ success: false, message: 'Method not allowed' });

  if (!isAllowedOrigin(origin)) {
    console.warn('[Demo Inquiry] origin rejected:', origin);
    return res.status(200).json({ success: true });
  }

  if (bodyTooLarge(req, 8 * 1024)) {
    console.warn('[Demo Inquiry] body too large:', req.headers['content-length']);
    return res.status(200).json({ success: true });
  }

  const ip = getClientIp(req);
  if (rateLimit({ key: 'demos-inquiry', ip, limit: 20, windowMs: 60_000 })) {
    console.warn('[Demo Inquiry] rate-limited ip:', ip);
    return res.status(200).json({ success: true });
  }

  const body = req.body || {};
  const type = body.type || 'inquiry';

  // Analytics event — log only, return 200
  if (type === 'event') {
    console.log('[Analytics Event]', JSON.stringify({ event: body.event, data: body.data, ref: body.ref, timestamp: body.timestamp }));
    return res.status(200).json({ success: true });
  }

  // Inquiry submission
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
    team_size: sanitize(body.teamSize || ''),
    challenges: Array.isArray(body.challenges) ? body.challenges.map(sanitize) : [],
    services_interested: Array.isArray(body.servicesInterested) ? body.servicesInterested.map(sanitize) : [],
    additional_notes: sanitize(body.additionalNotes || ''),
    referral_code: sanitize(body.referralCode || ''),
    source: sanitize(body.source || ''),
    utm_source: sanitize(body.utmSource || ''),
    created_at: new Date().toISOString()
  };

  console.log('[Inquiry]', JSON.stringify(inquiry));

  // If Supabase is configured, insert row
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
        console.warn('[Inquiry] Supabase insert failed:', sbRes.status);
      }
    } catch (err) {
      console.warn('[Inquiry] Supabase error (non-fatal):', err.message);
    }
  }

  // Notification webhook (Option C) — fires for every inquiry regardless of Supabase state
  const webhookUrl = process.env.NOTIFICATION_WEBHOOK_URL;
  if (webhookUrl) {
    try {
      await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content: `🔔 **New Demo Inquiry (Krevio)**\n**Name:** ${inquiry.name}\n**Email:** ${inquiry.email}\n**Industry:** ${inquiry.industry}\n**Business:** ${inquiry.business_name || 'N/A'}\n**Phone:** ${inquiry.phone || 'N/A'}`
        }),
        signal: AbortSignal.timeout(3000)
      });
    } catch (err) {
      console.warn('[Inquiry] Webhook notification failed (non-fatal):', err.message);
    }
  }

  return res.status(200).json({
    success: true,
    message: "Thank you! We'll reach out within 24 hours."
  });
}
