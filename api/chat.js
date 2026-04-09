import { readFileSync } from 'fs';
import { join } from 'path';

const ALLOWED_ORIGINS = [
  'https://krevio.net',
  'https://www.krevio.net',
  'https://krevio-site.vercel.app',
  'http://localhost:3000',
  'http://localhost:5500',
  'http://127.0.0.1:5500'
];

// In-memory rate limiting: max 30 requests per IP per 5 minutes
const rateLimitMap = new Map();
const RATE_LIMIT_MAX = 30;
const RATE_LIMIT_WINDOW = 5 * 60 * 1000;

function checkRateLimit(ip) {
  const now = Date.now();
  const entry = rateLimitMap.get(ip);
  if (!entry || now - entry.start > RATE_LIMIT_WINDOW) {
    rateLimitMap.set(ip, { start: now, count: 1 });
    return true;
  }
  entry.count++;
  return entry.count <= RATE_LIMIT_MAX;
}

// Load knowledge base and build system prompt
let systemPrompt = '';
try {
  const kb = JSON.parse(readFileSync(join(process.cwd(), 'knowledge-base.json'), 'utf-8'));
  systemPrompt = `You are Krevio's AI assistant on krevio.net. You help prospects understand what Krevio builds and guide them toward getting a custom quote.

PERSONALITY:
- Friendly, confident, concise. Like a knowledgeable sales rep, not a corporate FAQ bot.
- Use short paragraphs. No walls of text.
- When relevant, ask a follow-up question to keep the conversation going.
- If someone mentions their industry, connect it to a specific demo or use case.

KNOWLEDGE:
${JSON.stringify(kb, null, 2)}

ACTIONS:
When the conversation reaches a natural point, include an action tag at the very end of your response (after all text):
- If the prospect seems interested or asks "how do I get started" → add [ACTION:collect_lead]
- If they ask about a specific industry with a demo → add [ACTION:show_demo:landscaping] or [ACTION:show_demo:realestate] or [ACTION:show_demo:plumbing] or [ACTION:show_demo:hvac]
- If they ask about pricing → explain the range, then add [ACTION:collect_lead]

RULES:
- Never make up features or prices not in your knowledge base.
- Never share Milan's personal info beyond what's in the knowledge base.
- If asked about something you don't know, say "That's a great question — I'd want Milan to answer that directly. Want me to connect you?"
- Keep responses under 3 sentences when possible. This is a chat, not an essay.
- If they speak Spanish, respond in Spanish (you're bilingual).
- Always place action tags on their own line at the very end of your message.`;
} catch (err) {
  console.warn('[Chat] Failed to load knowledge-base.json:', err.message);
}

function isAllowedOrigin(origin) {
  if (ALLOWED_ORIGINS.includes(origin)) return true;
  // Allow krevio-site Vercel preview subdomains
  if (/^https:\/\/krevio-site[a-z0-9-]*\.vercel\.app$/.test(origin)) return true;
  return false;
}

export default async function handler(req, res) {
  const origin = req.headers.origin || '';
  const corsOrigin = isAllowedOrigin(origin) ? origin : ALLOWED_ORIGINS[0];
  res.setHeader('Access-Control-Allow-Origin', corsOrigin);
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Vary', 'Origin');

  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ reply: 'Method not allowed' });

  // Check API key
  const apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
  if (!apiKey) {
    return res.status(200).json({
      reply: "Chat is being set up. Please use the contact form below to reach us!",
      action: null
    });
  }

  // Rate limiting
  const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket?.remoteAddress || 'unknown';
  if (!checkRateLimit(ip)) {
    return res.status(429).json({
      reply: "You're chatting faster than I can keep up! Give me a minute and try again.",
      action: null
    });
  }

  const body = req.body || {};
  const { message, history } = body;

  if (!message || typeof message !== 'string' || !message.trim()) {
    return res.status(400).json({ reply: "I didn't catch that. Could you try again?", action: null });
  }

  // Build conversation history (cap at last 20 messages)
  const safeHistory = Array.isArray(history) ? history.slice(-20) : [];
  const contents = safeHistory.map(msg => ({
    role: msg.role === 'user' ? 'user' : 'model',
    parts: [{ text: String(msg.content || '') }]
  }));
  contents.push({ role: 'user', parts: [{ text: message.trim().slice(0, 2000) }] });

  try {
    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          system_instruction: { parts: [{ text: systemPrompt }] },
          contents,
          generationConfig: {
            temperature: 0.7,
            maxOutputTokens: 500
          }
        }),
        signal: AbortSignal.timeout(15000)
      }
    );

    if (!geminiRes.ok) {
      const errText = await geminiRes.text().catch(() => '');
      console.error('[Chat] Gemini API error:', geminiRes.status, errText);
      return res.status(200).json({
        reply: "I'm having trouble connecting right now. Try again in a moment, or use the contact form below!",
        action: null
      });
    }

    const data = await geminiRes.json();
    let text = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';

    if (!text) {
      return res.status(200).json({
        reply: "I'm not sure how to answer that. Want me to connect you with Milan directly?",
        action: 'collect_lead'
      });
    }

    // Parse action tags from response
    let action = null;
    const actionMatch = text.match(/\[ACTION:(collect_lead|show_demo:(\w+))\]/);
    if (actionMatch) {
      if (actionMatch[1] === 'collect_lead') {
        action = 'collect_lead';
      } else if (actionMatch[2]) {
        action = `show_demo:${actionMatch[2]}`;
      }
      // Remove action tag from displayed text
      text = text.replace(/\[ACTION:[^\]]+\]/g, '').trim();
    }

    return res.status(200).json({ reply: text, action });
  } catch (err) {
    console.error('[Chat] Error:', err.message);
    return res.status(200).json({
      reply: "I'm having trouble connecting right now. Try again in a moment, or use the contact form below!",
      action: null
    });
  }
}
