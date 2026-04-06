const ALLOWED_ORIGINS = [
  'https://krevio.dev',
  'https://www.krevio.dev',
  'http://localhost:3000',
  'http://localhost:5500',
  'http://127.0.0.1:5500'
];

export default async function handler(req, res) {
  const origin = req.headers.origin || '';
  const corsOrigin = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  res.setHeader('Access-Control-Allow-Origin', corsOrigin);
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Vary', 'Origin');

  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ success: false, message: 'Method not allowed' });

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
    source: 'krevio.dev',
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

  // Webhook notification
  const webhookUrl = process.env.NOTIFICATION_WEBHOOK_URL;
  if (webhookUrl) {
    try {
      await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content: `🔔 **New Krevio Inquiry**\n**Name:** ${inquiry.name}\n**Email:** ${inquiry.email}\n**Industry:** ${inquiry.industry}\n**Business:** ${inquiry.business_name || 'N/A'}\n**Phone:** ${inquiry.phone || 'N/A'}\n**Source:** krevio.dev`
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
