// Krevio lead-notification endpoint
// - Per-tenant recipient routing (default tenant: 'krevio')
// - Strict Origin allowlist via shared _lib/limits.js (rejects foreign
//   browser POSTs; ALLOWS empty Origin for server-to-server calls from
//   api/inquiry.js — that's why this is the only endpoint that passes
//   `allowEmpty: true` to isAllowedOrigin)
// - In-memory IP rate limit (5 req / 60s) via shared token bucket
// - Body size cap (8 KB) via shared helper
// - Schema validation (name required; at least one of phone/email)
// - Always returns 200 {ok:true,queued:true} so attackers can't enumerate
//   the schema. Rejection reasons go to Vercel function logs only.

import { applyCors, isAllowedOrigin, getClientIp, rateLimit, bodyTooLarge } from './_lib/limits.js';

// Per-tenant notification routing. Add a customer here when they onboard.
// TD-016: graduate this to a real config source (env-backed or DB) when
// the second tenant arrives.
//
// Shape change 2026-04-17: values may be strings (just a `to:` address,
// legacy shape) or objects ({ to, subjectPrefix }). The handler normalizes
// below. New tenants should use the object form so subject prefixes are
// explicit per decisions-2026-04-17.
const TENANT_NOTIFY = {
  krevio: 'krevio@krevio.net',
  'johns-site': {
    to: 'krevio@krevio.net',       // Milan forwards to John manually — decisions §B3
    subjectPrefix: "[John's Site]"
  }
};
const DEFAULT_TENANT = 'krevio';

// Sender lives on the verified krevio.net domain (configured in Resend → Domains).
// `alerts@` is a virtual address — no real mailbox needed; it just needs the
// domain DKIM/SPF to validate. Replies route to krevio@krevio.net via Reply-To
// so a curious customer (or Milan testing) reaches a real inbox.
const NOTIFY_FROM = 'Krevio Alerts <alerts@krevio.net>';
const NOTIFY_REPLY_TO = 'krevio@krevio.net';

const TYPE_META = {
  emergency:   { label: '🚨 EMERGENCY',           typeLabel: 'Emergency Callback',  headerBg: '#ef4444' },
  appointment: { label: '📅 APPOINTMENT REQUEST', typeLabel: 'Appointment Request', headerBg: '#2563eb' },
  inquiry:     { label: '💬 NEW INQUIRY',         typeLabel: 'Inquiry',             headerBg: '#6366f1' },
};

// Human-readable source labels for the email template
const SOURCE_LABELS = {
  'krevio.net':       'Website form',
  'krevio-chatbot':   'AI chatbot',
  'krevio-quote-flow': 'Quote flow',
};

function escapeHtml(str) {
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function buildEmailHtml(data) {
  const meta = TYPE_META[data.type] || TYPE_META.inquiry;
  const receivedAt = new Date(data.timestamp || Date.now()).toLocaleString('en-US', {
    timeZone: 'America/Chicago', weekday: 'short', month: 'short', day: 'numeric',
    hour: 'numeric', minute: '2-digit', hour12: true,
  }) + ' CT';

  const rows = [
    ['Name', data.name || '—'],
    data.phone ? ['Phone', data.phone] : null,
    data.email ? ['Email', data.email] : null,
    data.industry ? ['Industry', data.industry.charAt(0).toUpperCase() + data.industry.slice(1)] : null,
    data.service ? ['Service', data.service] : null,
    data.date ? ['Preferred Date', data.date] : null,
    data.description ? ['Notes', data.description] : null,
    data.source ? ['Source', SOURCE_LABELS[data.source] || data.source] : null,
    ['Received', receivedAt],
  ].filter(Boolean);

  const tableRows = rows.map(([k, v]) =>
    `<tr><td style="padding:10px 16px;font-weight:600;color:#52525b;white-space:nowrap;background:#f4f4f5;border-bottom:1px solid #e4e4e7;">${k}</td><td style="padding:10px 16px;color:#18181b;border-bottom:1px solid #e4e4e7;">${escapeHtml(String(v))}</td></tr>`
  ).join('');

  // Quick-reply buttons: mailto link to respond directly, or tel link to call
  const actions = [];
  if (data.email) {
    actions.push(`<a href="mailto:${escapeHtml(data.email)}?subject=Re: Your inquiry to Krevio" style="display:inline-block;padding:10px 20px;background:#2563eb;color:#fff;font-size:13px;font-weight:700;border-radius:6px;text-decoration:none;margin-right:8px;">Reply via Email →</a>`);
  }
  if (data.phone) {
    actions.push(`<a href="tel:${escapeHtml(data.phone.replace(/[^+\d]/g, ''))}" style="display:inline-block;padding:10px 20px;background:#16a34a;color:#fff;font-size:13px;font-weight:700;border-radius:6px;text-decoration:none;">Call ${escapeHtml(data.phone)}</a>`);
  }
  const actionsHtml = actions.length
    ? `<div style="padding:16px 24px;text-align:center;">${actions.join('')}</div>`
    : '';

  return `<!DOCTYPE html>
<html>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;margin:0;padding:24px;background:#fafafa;color:#18181b;">
  <div style="max-width:520px;margin:0 auto;background:#fff;border-radius:12px;border:1px solid #e4e4e7;overflow:hidden;">
    <div style="padding:20px 24px;background:${meta.headerBg};color:#fff;">
      <div style="font-size:20px;font-weight:700;">${meta.label}</div>
      <div style="font-size:14px;opacity:0.9;margin-top:4px;">${data.businessName || 'krevio.net'}</div>
    </div>
    <table style="width:100%;border-collapse:collapse;font-size:14px;">
      ${tableRows}
    </table>
    ${actionsHtml}
    <div style="padding:14px 24px;background:#f4f4f5;font-size:12px;color:#71717a;text-align:center;">
      Sent by <strong>Krevio</strong> · <a href="https://krevio.net" style="color:#2563eb;">krevio.net</a>
    </div>
  </div>
</body>
</html>`;
}

// Always returns 200 success-shaped response so attackers can't enumerate
// validation rules. Rejection reasons are logged to Vercel function logs.
function silentReject(res, reason) {
  console.warn('[notify] rejected:', reason);
  return res.status(200).json({ ok: true, queued: true });
}

export default async function handler(req, res) {
  const origin = applyCors(req, res);

  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ success: false, message: 'Method not allowed' });

  // Origin gate — reject foreign browser POSTs. Empty Origin (server-to-server
  // calls from api/inquiry.js) is explicitly allowed via { allowEmpty: true }.
  if (!isAllowedOrigin(origin, { allowEmpty: true })) {
    return silentReject(res, `origin not allowed: ${origin}`);
  }

  if (bodyTooLarge(req, 8 * 1024)) {
    return silentReject(res, `body too large: ${req.headers['content-length']}`);
  }

  const ip = getClientIp(req);
  if (rateLimit({ key: 'notify', ip, limit: 5, windowMs: 60_000 })) {
    return silentReject(res, `rate-limited ip: ${ip}`);
  }

  const body = req.body || {};
  const sanitize = (v) => typeof v === 'string' ? v.trim().slice(0, 500) : '';

  // Tenant routing — defaults to 'krevio' for backwards compat with existing
  // callers (api/inquiry.js, demos/plumbing/index.html). Customer #1 sets
  // CONFIG.tenantId in their demo.
  //
  // Values can be a string (legacy: just a `to:` address) or an object
  // ({ to, subjectPrefix }). Normalize to { to, subjectPrefix }.
  const tenantId = sanitize(body.tenantId) || DEFAULT_TENANT;
  const tenantCfg = TENANT_NOTIFY[tenantId];
  if (!tenantCfg) {
    return silentReject(res, `unknown tenantId: ${tenantId}`);
  }
  const notifyTo = typeof tenantCfg === 'string' ? tenantCfg : tenantCfg.to;
  const subjectPrefix = typeof tenantCfg === 'string' ? '' : (tenantCfg.subjectPrefix || '');
  if (!notifyTo) {
    return silentReject(res, `tenant ${tenantId} has no notify address`);
  }

  const data = {
    type: sanitize(body.type) || 'inquiry',
    name: sanitize(body.name),
    phone: sanitize(body.phone),
    email: sanitize(body.email),
    industry: sanitize(body.industry),
    source: sanitize(body.source),
    service: sanitize(body.service),
    date: sanitize(body.date),
    description: sanitize(body.description),
    businessName: sanitize(body.businessName),
    timestamp: body.timestamp || new Date().toISOString(),
  };

  // Schema validation: name required, at least one contact method.
  if (!data.name) return silentReject(res, 'missing name');
  if (!data.phone && !data.email) return silentReject(res, 'missing phone and email');

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.warn('[notify] RESEND_API_KEY not set — skipping email');
    return res.status(200).json({ ok: true, queued: true, skipped: 'RESEND_API_KEY not configured' });
  }

  const meta = TYPE_META[data.type] || TYPE_META.inquiry;
  const typeLabel = data.type === 'emergency' ? 'Emergency' : meta.typeLabel;
  const subject = subjectPrefix
    ? `${subjectPrefix} New ${typeLabel} — ${data.businessName || 'krevio.net'}`
    : `New ${typeLabel} — ${data.businessName || 'krevio.net'}`;

  try {
    const emailRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: NOTIFY_FROM,
        to: [notifyTo],
        reply_to: NOTIFY_REPLY_TO,
        subject,
        html: buildEmailHtml(data),
      }),
      signal: AbortSignal.timeout(8000),
    });

    if (!emailRes.ok) {
      const errText = await emailRes.text().catch(() => '');
      console.error('[notify] Resend error:', emailRes.status, errText);
      return res.status(200).json({ ok: true, queued: true, notified: false });
    }

    console.log('[notify] Email sent to', notifyTo, '—', subject);
    return res.status(200).json({ ok: true, queued: true, notified: true });

  } catch (err) {
    console.error('[notify] Fetch error (non-fatal):', err.message);
    return res.status(200).json({ ok: true, queued: true, notified: false });
  }
}
