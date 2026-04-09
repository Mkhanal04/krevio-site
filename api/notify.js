const ALLOWED_ORIGINS = [
  'https://krevio.net',
  'https://www.krevio.net',
  'https://krevio-site.vercel.app',
  'http://localhost:3000',
  'http://localhost:5500',
  'http://127.0.0.1:5500'
];

function isAllowedOrigin(origin) {
  if (ALLOWED_ORIGINS.includes(origin)) return true;
  if (/^https:\/\/krevio-site[a-z0-9-]*\.vercel\.app$/.test(origin)) return true;
  return false;
}

const NOTIFY_TO = 'krevio@krevio.net';
// From address: uses Resend's default shared domain until krevio.net is verified in Resend.
// Once verified, change to: notifications@krevio.net
const NOTIFY_FROM = 'Krevio Alerts <onboarding@resend.dev>';

function buildEmailHtml(data) {
  const label = data.type === 'emergency' ? '🚨 EMERGENCY' : '📅 APPOINTMENT REQUEST';
  const rows = [
    ['Type', data.type === 'emergency' ? 'Emergency Callback' : 'Appointment Request'],
    ['Name', data.name || '—'],
    ['Phone', data.phone || '—'],
    ['Email', data.email || '—'],
    data.service ? ['Service', data.service] : null,
    data.date ? ['Preferred Date', data.date] : null,
    data.description ? ['Message', data.description] : null,
    ['Business', data.businessName || '—'],
    ['Received', new Date(data.timestamp || Date.now()).toLocaleString('en-US', { timeZone: 'America/Chicago' }) + ' CT'],
  ].filter(Boolean);

  const tableRows = rows.map(([k, v]) =>
    `<tr><td style="padding:8px 12px;font-weight:600;color:#52525b;white-space:nowrap;background:#f4f4f5;border-bottom:1px solid #e4e4e7;">${k}</td><td style="padding:8px 12px;color:#18181b;border-bottom:1px solid #e4e4e7;">${escapeHtml(String(v))}</td></tr>`
  ).join('');

  return `<!DOCTYPE html>
<html>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;margin:0;padding:24px;background:#fafafa;color:#18181b;">
  <div style="max-width:520px;margin:0 auto;background:#fff;border-radius:12px;border:1px solid #e4e4e7;overflow:hidden;">
    <div style="padding:20px 24px;background:${data.type === 'emergency' ? '#ef4444' : '#2563eb'};color:#fff;">
      <div style="font-size:20px;font-weight:700;">${label}</div>
      <div style="font-size:14px;opacity:0.9;margin-top:4px;">${data.businessName || 'Krevio Demo'}</div>
    </div>
    <table style="width:100%;border-collapse:collapse;font-size:14px;">
      ${tableRows}
    </table>
    <div style="padding:16px 24px;background:#f4f4f5;font-size:12px;color:#71717a;">
      Sent by Krevio · <a href="https://krevio.net" style="color:#2563eb;">krevio.net</a>
    </div>
  </div>
</body>
</html>`;
}

function escapeHtml(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export default async function handler(req, res) {
  const origin = req.headers.origin || '';
  const corsOrigin = isAllowedOrigin(origin) ? origin : ALLOWED_ORIGINS[0];
  res.setHeader('Access-Control-Allow-Origin', corsOrigin);
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Vary', 'Origin');

  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ success: false, message: 'Method not allowed' });

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.warn('[notify] RESEND_API_KEY not set — skipping email');
    return res.status(200).json({ success: true, skipped: true, reason: 'RESEND_API_KEY not configured' });
  }

  const body = req.body || {};
  const sanitize = (v) => typeof v === 'string' ? v.trim().slice(0, 500) : '';

  const data = {
    type: sanitize(body.type) || 'inquiry',
    name: sanitize(body.name),
    phone: sanitize(body.phone),
    email: sanitize(body.email),
    service: sanitize(body.service),
    date: sanitize(body.date),
    description: sanitize(body.description),
    businessName: sanitize(body.businessName),
    timestamp: body.timestamp || new Date().toISOString(),
  };

  const typeLabel = data.type === 'emergency' ? 'Emergency' : 'Appointment Request';
  const subject = `New ${typeLabel} — ${data.businessName || 'Demo'}`;

  try {
    const emailRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: NOTIFY_FROM,
        to: [NOTIFY_TO],
        subject,
        html: buildEmailHtml(data),
      }),
      signal: AbortSignal.timeout(8000),
    });

    if (!emailRes.ok) {
      const errText = await emailRes.text().catch(() => '');
      console.error('[notify] Resend error:', emailRes.status, errText);
      // Still return 200 — graceful degradation (form must not break)
      return res.status(200).json({ success: true, notified: false, reason: `Resend ${emailRes.status}` });
    }

    console.log('[notify] Email sent:', subject);
    return res.status(200).json({ success: true, notified: true });

  } catch (err) {
    console.error('[notify] Fetch error (non-fatal):', err.message);
    // Graceful degradation — don't fail the form
    return res.status(200).json({ success: true, notified: false, reason: err.message });
  }
}
