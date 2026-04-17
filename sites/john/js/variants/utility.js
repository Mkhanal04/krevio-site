// Utility variant module — Frontend Eng (Utility) owns this.
// Exports { mount, unmount } per architecture-spec §1 lifecycle contract.
//
// Scope: contact form -> POST /api/notify with tenantId=johns-site, and
// command-palette chat widget -> POST /api/demos/chat with
// businessType=johns-site. All listeners are attached inside mount(root)
// and detached inside unmount(root) so switching variants doesn't leak
// handlers (Architect §3 cleanup contract).

const NOTIFY_ENDPOINT = '/api/notify';
const CHAT_ENDPOINT = '/api/demos/chat';
const TENANT_ID = 'johns-site';
const BUSINESS_TYPE = 'johns-site';
const BUSINESS_NAME = "John's General Contracting";

// Opener line per copy package R6. Injected into the log the first time
// the user opens the chat panel so the experience starts conversational.
const CHAT_OPENER = "Hey, I'm John's assistant. Ask me what a typical job runs or what's included — I'll give you a ballpark and John confirms on-site.";

// Module-scoped cleanup registry. Populated in mount(), drained in unmount().
let cleanups = [];

function track(fn) { cleanups.push(fn); }

function on(el, evt, handler, opts) {
  if (!el) return;
  el.addEventListener(evt, handler, opts);
  track(() => el.removeEventListener(evt, handler, opts));
}

// ---------- Contact form ----------

function wireForm(root) {
  const form = root.querySelector('[data-ut-form]');
  if (!form) return;

  const successEl = root.querySelector('[data-form-success]');
  const errorEl = form.querySelector('[data-form-error]');
  const submitBtn = form.querySelector('[data-form-submit]');
  const submitLabel = submitBtn ? submitBtn.querySelector('span') : null;
  const originalSubmitText = submitLabel ? submitLabel.textContent : 'Send it';

  function showError(msg) {
    if (!errorEl) return;
    errorEl.textContent = msg;
    errorEl.hidden = false;
  }
  function clearError() {
    if (!errorEl) return;
    errorEl.textContent = '';
    errorEl.hidden = true;
  }

  on(form, 'submit', async (e) => {
    e.preventDefault();
    clearError();

    const fd = new FormData(form);
    const name = (fd.get('name') || '').toString().trim();
    const phone = (fd.get('phone') || '').toString().trim();
    const email = (fd.get('email') || '').toString().trim();
    const location = (fd.get('location') || '').toString().trim();
    const message = (fd.get('message') || '').toString().trim();
    const referral = (fd.get('referral') || '').toString().trim();

    // Client-side guard mirrors /api/notify contract: name required + at
    // least one contact method. Server silently rejects bad payloads
    // (returns 200 to avoid schema enumeration), so we validate here to
    // actually give the user useful feedback.
    if (!name) {
      showError('Add your name so John knows who called.');
      return;
    }
    if (!phone && !email) {
      showError('Leave a phone or email so John can get back to you.');
      return;
    }

    // Compose description; referral goes in-line so it lands in notify
    // email body without needing a schema change on the endpoint.
    const description = referral
      ? `${message}\n\nHeard about us: ${referral}`
      : message;

    const payload = {
      tenantId: TENANT_ID,
      type: 'inquiry',
      source: 'johns-site',
      name,
      phone,
      email,
      service: location,
      description,
      businessName: BUSINESS_NAME,
      timestamp: new Date().toISOString(),
    };

    if (submitBtn) {
      submitBtn.disabled = true;
      if (submitLabel) submitLabel.textContent = 'Sending…';
    }

    try {
      const res = await fetch(NOTIFY_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      // notify.js always returns 200 { ok, queued } for valid shape;
      // anything non-2xx is a genuine network/server error.
      if (!res.ok) throw new Error(`Network ${res.status}`);

      // Swap form -> success inset. Keep the form element in the DOM
      // so the unmount path can still find it, but hide it.
      form.hidden = true;
      if (successEl) {
        successEl.hidden = false;
        successEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    } catch (err) {
      console.warn('[utility] form submit failed:', err && err.message);
      showError("Couldn't reach the server. Call (214) 555-0134 or try again in a minute.");
      if (submitBtn) {
        submitBtn.disabled = false;
        if (submitLabel) submitLabel.textContent = originalSubmitText;
      }
    }
  });
}

// ---------- Chat widget ----------

function wireChat(root) {
  const chatRoot = root.querySelector('[data-chat-root]');
  if (!chatRoot) return;

  const openBtn = chatRoot.querySelector('[data-chat-open]');
  const closeBtn = chatRoot.querySelector('[data-chat-close]');
  const panel = chatRoot.querySelector('[data-chat-panel]');
  const log = chatRoot.querySelector('[data-chat-log]');
  const chatForm = chatRoot.querySelector('[data-chat-form]');
  const input = chatRoot.querySelector('[data-chat-input]');

  if (!panel || !log || !chatForm || !input) return;

  // Conversation history sent to /api/demos/chat on each turn so the
  // model has context. Kept module-local rather than persisted — fresh
  // session on page reload is the simpler and less-surprising behavior.
  const history = [];
  let openedOnce = false;
  let pending = false;

  function addMessage(role, text) {
    const el = document.createElement('div');
    el.className = `ut-chat-msg ut-chat-msg-${role}`;
    el.textContent = text;
    log.appendChild(el);
    log.scrollTop = log.scrollHeight;
    return el;
  }

  function addTypingIndicator() {
    const el = document.createElement('span');
    el.className = 'ut-chat-typing';
    el.setAttribute('aria-label', "John's assistant is typing");
    el.innerHTML = '<span></span><span></span><span></span>';
    log.appendChild(el);
    log.scrollTop = log.scrollHeight;
    return el;
  }

  function openPanel() {
    panel.hidden = false;
    panel.setAttribute('aria-hidden', 'false');
    if (openBtn) openBtn.setAttribute('aria-expanded', 'true');
    if (!openedOnce) {
      addMessage('bot', CHAT_OPENER);
      openedOnce = true;
    }
    // Defer focus so the panel animation can settle.
    setTimeout(() => { try { input.focus(); } catch (_) {} }, 50);
  }
  function closePanel() {
    panel.hidden = true;
    panel.setAttribute('aria-hidden', 'true');
    if (openBtn) {
      openBtn.setAttribute('aria-expanded', 'false');
      try { openBtn.focus(); } catch (_) {}
    }
  }
  function isOpen() { return !panel.hidden; }

  on(openBtn, 'click', () => { isOpen() ? closePanel() : openPanel(); });
  on(closeBtn, 'click', closePanel);

  // Keyboard: Escape closes; Cmd/Ctrl+K toggles; "/" focuses when not
  // typing into something else (command-palette ergonomics).
  on(document, 'keydown', (e) => {
    const variantActive = root.closest('#app') &&
      document.getElementById('app') &&
      document.getElementById('app').dataset.variant === 'utility';
    if (!variantActive) return;

    if (e.key === 'Escape' && isOpen()) {
      e.preventDefault();
      closePanel();
      return;
    }
    const isMac = /Mac|iPhone|iPad|iPod/.test(navigator.platform);
    const metaKey = isMac ? e.metaKey : e.ctrlKey;
    if (metaKey && (e.key === 'k' || e.key === 'K')) {
      e.preventDefault();
      isOpen() ? closePanel() : openPanel();
      return;
    }
    if (e.key === '/' && !isOpen()) {
      const t = e.target;
      const tag = t && t.tagName;
      const isField = tag === 'INPUT' || tag === 'TEXTAREA' || (t && t.isContentEditable);
      if (!isField) {
        e.preventDefault();
        openPanel();
      }
    }
  });

  on(chatForm, 'submit', async (e) => {
    e.preventDefault();
    if (pending) return;

    const text = (input.value || '').trim();
    if (!text) return;

    addMessage('user', text);
    history.push({ role: 'user', content: text });
    input.value = '';
    pending = true;

    const typingEl = addTypingIndicator();

    try {
      const res = await fetch(CHAT_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          businessType: BUSINESS_TYPE,
          messages: history,
          message: text,
        }),
      });

      if (!res.ok) throw new Error(`chat ${res.status}`);

      const data = await res.json().catch(() => ({}));
      const reply = (data && (data.reply || data.message || data.text)) ||
        "I'm not sure on that one — text John directly at (214) 555-0134 and he'll sort it.";

      if (typingEl && typingEl.parentNode) typingEl.parentNode.removeChild(typingEl);
      addMessage('bot', reply);
      history.push({ role: 'assistant', content: reply });
    } catch (err) {
      console.warn('[utility] chat failed:', err && err.message);
      if (typingEl && typingEl.parentNode) typingEl.parentNode.removeChild(typingEl);
      addMessage('bot', "Chat's offline right now. Call or text (214) 555-0134 and John will get right back to you.");
    } finally {
      pending = false;
      try { input.focus(); } catch (_) {}
    }
  });
}

// ---------- Lifecycle ----------

export function mount(root) {
  if (!root) return;
  // Defensive: if mount is called twice without an unmount, drain first.
  if (cleanups.length) unmount(root);
  wireForm(root);
  wireChat(root);
}

export function unmount(/* root */) {
  for (const fn of cleanups) {
    try { fn(); } catch (_) { /* best-effort */ }
  }
  cleanups = [];
}
