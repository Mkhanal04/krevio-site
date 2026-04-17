// Warmth variant module — Frontend Eng (Warmth).
// Exports { mount, unmount } per architecture-spec §1 lifecycle contract.
// - Before/after slider with rope-textured handle (drag + keyboard + touch).
// - Contact form POSTs to /api/notify?tenantId=johns-site.
// - Chat widget POSTs to /api/demos/chat (businessType: 'johns-site'),
//   opener copy from copy.md R6 (default ranges mode).

const JOHNS_TENANT_ID = 'johns-site';
const NOTIFY_ENDPOINT = '/api/notify';
const CHAT_ENDPOINT = '/api/demos/chat';

const CHAT_OPENER =
  "Hey, I'm John's assistant. I can help with plumbing, handyman work, " +
  "landscaping, fencing, power washing, electrical, and epoxy floors. " +
  "Tell me what's going on at your place and I'll ask a couple quick questions, " +
  "give you a rough ballpark based on typical Frisco and Celina jobs, and " +
  "set you up for a free on-site estimate. John confirms final pricing in person.";

// Per-root teardown registry — idempotent unmount.
const teardowns = new WeakMap();

export function mount(root) {
  if (!root) return;
  if (teardowns.has(root)) return; // already mounted

  const offs = [];

  // Gallery sliders
  root.querySelectorAll('.wc-ba').forEach((fig) => {
    const off = initSlider(fig);
    if (off) offs.push(off);
  });

  // Contact form
  const off1 = initContactForm(root);
  if (off1) offs.push(off1);

  // Chat widget
  const off2 = initChat(root);
  if (off2) offs.push(off2);

  // FAQ items — tap-to-expand already handled by <details>; no listener needed.

  teardowns.set(root, () => {
    offs.forEach((fn) => {
      try { fn(); } catch { /* swallow teardown errors */ }
    });
  });
}

export function unmount(root) {
  if (!root) return;
  const teardown = teardowns.get(root);
  if (teardown) {
    teardown();
    teardowns.delete(root);
  }
}

// ──────────────────────────
// Before/after slider
// ──────────────────────────
function initSlider(fig) {
  const handle = fig.querySelector('.wc-ba-handle');
  if (!handle) return null;

  // Activate single-pane mode; CSS falls back to 2-grid if this class is absent.
  fig.classList.add('wc-ba-ready');

  let pct = 50;
  let raf = 0;
  const render = () => {
    fig.style.setProperty('--wc-ba-pos', pct + '%');
    handle.setAttribute('aria-valuenow', String(Math.round(pct)));
    raf = 0;
  };
  const queueRender = () => {
    if (!raf) raf = requestAnimationFrame(render);
  };
  render();

  const pctFromClientX = (clientX) => {
    const rect = fig.getBoundingClientRect();
    if (!rect.width) return pct;
    const rel = (clientX - rect.left) / rect.width;
    return Math.max(0, Math.min(100, rel * 100));
  };

  let dragging = false;

  const onPointerMove = (e) => {
    if (!dragging) return;
    pct = pctFromClientX(e.clientX);
    queueRender();
    // Prevent page scroll while dragging on touch.
    if (e.cancelable) e.preventDefault();
  };

  const onPointerUp = (e) => {
    if (!dragging) return;
    dragging = false;
    try { handle.releasePointerCapture(e.pointerId); } catch { /* ignore */ }
  };

  const onPointerDown = (e) => {
    dragging = true;
    pct = pctFromClientX(e.clientX);
    queueRender();
    try { handle.setPointerCapture(e.pointerId); } catch { /* ignore */ }
    if (e.cancelable) e.preventDefault();
  };

  // PointerEvents first; Touch fallback for ancient browsers.
  const usePointer = 'onpointerdown' in window;
  if (usePointer) {
    handle.addEventListener('pointerdown', onPointerDown);
    handle.addEventListener('pointermove', onPointerMove);
    handle.addEventListener('pointerup', onPointerUp);
    handle.addEventListener('pointercancel', onPointerUp);
    fig.addEventListener('pointerdown', (e) => {
      // Clicking the pane should jump the handle there.
      if (e.target === handle || handle.contains(e.target)) return;
      pct = pctFromClientX(e.clientX);
      queueRender();
    });
  } else {
    const onTouchStart = (e) => {
      const t = e.touches[0];
      if (!t) return;
      dragging = true;
      pct = pctFromClientX(t.clientX);
      queueRender();
    };
    const onTouchMove = (e) => {
      if (!dragging) return;
      const t = e.touches[0];
      if (!t) return;
      pct = pctFromClientX(t.clientX);
      queueRender();
      if (e.cancelable) e.preventDefault();
    };
    const onTouchEnd = () => { dragging = false; };
    handle.addEventListener('touchstart', onTouchStart, { passive: true });
    handle.addEventListener('touchmove', onTouchMove, { passive: false });
    handle.addEventListener('touchend', onTouchEnd);
    handle.addEventListener('touchcancel', onTouchEnd);
  }

  // Keyboard
  const onKeyDown = (e) => {
    let delta = 0;
    if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') delta = -5;
    else if (e.key === 'ArrowRight' || e.key === 'ArrowUp') delta = 5;
    else if (e.key === 'Home') { pct = 0; queueRender(); e.preventDefault(); return; }
    else if (e.key === 'End') { pct = 100; queueRender(); e.preventDefault(); return; }
    else if (e.key === 'PageDown') delta = -10;
    else if (e.key === 'PageUp') delta = 10;
    if (delta) {
      pct = Math.max(0, Math.min(100, pct + delta));
      queueRender();
      e.preventDefault();
    }
  };
  handle.addEventListener('keydown', onKeyDown);

  // ARIA
  handle.setAttribute('role', 'slider');
  handle.setAttribute('aria-label', 'Reveal before/after comparison');
  handle.setAttribute('aria-valuemin', '0');
  handle.setAttribute('aria-valuemax', '100');
  handle.setAttribute('aria-valuenow', '50');
  handle.tabIndex = 0;

  return () => {
    if (raf) cancelAnimationFrame(raf);
    fig.classList.remove('wc-ba-ready');
    // Element removal on variant switch cleans listeners; explicit removal is
    // non-critical, but we detach the keydown since the element persists in DOM.
    handle.removeEventListener('keydown', onKeyDown);
  };
}

// ──────────────────────────
// Contact form
// ──────────────────────────
function initContactForm(root) {
  const form = root.querySelector('.wc-form');
  if (!form) return null;
  const confirm = root.querySelector('.wc-form-confirm');

  const onSubmit = async (e) => {
    e.preventDefault();
    const fd = new FormData(form);
    const body = {
      tenantId: JOHNS_TENANT_ID,
      type: 'inquiry',
      businessName: "John's General Contracting",
      source: 'krevio.net',
      name: String(fd.get('name') || '').trim(),
      phone: String(fd.get('phone') || '').trim(),
      email: String(fd.get('email') || '').trim(),
      service: String(fd.get('address') || '').trim(),
      description: [
        String(fd.get('description') || '').trim(),
        fd.get('referral') ? `Heard about us: ${fd.get('referral')}` : ''
      ].filter(Boolean).join('\n'),
    };

    // Soft client-side check — server does authoritative validation.
    if (!body.name || (!body.phone && !body.email)) {
      return;
    }

    const submitBtn = form.querySelector('.wc-form-submit');
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.dataset.prevText = submitBtn.textContent;
      submitBtn.textContent = 'Sending…';
    }

    try {
      await fetch(`${NOTIFY_ENDPOINT}?tenantId=${JOHNS_TENANT_ID}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
    } catch {
      // Notify endpoint always returns 200 success-shaped; network failure
      // still shouldn't block the confirmation (the user has the phone number).
    }

    if (confirm) confirm.classList.add('is-on');
    form.reset();
    form.hidden = true;
  };

  form.addEventListener('submit', onSubmit);
  return () => form.removeEventListener('submit', onSubmit);
}

// ──────────────────────────
// Chat widget
// ──────────────────────────
function initChat(root) {
  const chat = root.querySelector('.wc-chat');
  if (!chat) return null;
  const fab = chat.querySelector('.wc-chat-fab');
  const closeBtn = chat.querySelector('.wc-chat-close');
  const body = chat.querySelector('.wc-chat-body');
  const input = chat.querySelector('.wc-chat-input');
  const sendBtn = chat.querySelector('.wc-chat-send');
  const form = chat.querySelector('.wc-chat-form');
  const preview = chat.querySelector('.wc-chat-preview');

  if (!fab || !body || !input || !sendBtn || !form) return null;

  const history = [];
  const MAX_HISTORY = 16;

  // Seed opener
  appendMsg('bot', CHAT_OPENER);

  // Auto-dismiss preview after 7s
  let previewTimer = 0;
  if (preview) {
    previewTimer = setTimeout(() => {
      preview.style.display = 'none';
    }, 7000);
  }

  const open = () => {
    chat.classList.add('is-open');
    if (preview) preview.style.display = 'none';
    setTimeout(() => input.focus(), 80);
  };
  const close = () => chat.classList.remove('is-open');

  const onFab = () => chat.classList.contains('is-open') ? close() : open();
  const onClose = () => close();

  function appendMsg(role, text) {
    const el = document.createElement('div');
    el.className = 'wc-chat-msg';
    el.dataset.role = role;
    el.textContent = text;
    body.appendChild(el);
    body.scrollTop = body.scrollHeight;
    history.push({ role, content: text });
    if (history.length > MAX_HISTORY) history.splice(0, history.length - MAX_HISTORY);
  }

  const onSubmit = async (e) => {
    e.preventDefault();
    const text = input.value.trim();
    if (!text) return;
    appendMsg('user', text);
    input.value = '';
    sendBtn.disabled = true;

    try {
      const res = await fetch(CHAT_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          businessType: 'johns-site',
          message: text,
          history: history.slice(0, -1), // exclude the just-added user msg
        }),
        signal: AbortSignal.timeout(15000),
      });
      if (res.ok) {
        const data = await res.json().catch(() => ({}));
        const reply = data.reply || data.message || "Got it — I'll pass that to John. Anything else?";
        appendMsg('bot', reply);
      } else {
        appendMsg('bot', "I'm having trouble reaching John's assistant right now. Give him a call at (214) 555-0134 and he'll get right back to you.");
      }
    } catch {
      appendMsg('bot', "Connection hiccup on my end — call or text John directly at (214) 555-0134 and he'll sort it out.");
    } finally {
      sendBtn.disabled = false;
    }
  };

  fab.addEventListener('click', onFab);
  if (closeBtn) closeBtn.addEventListener('click', onClose);
  form.addEventListener('submit', onSubmit);

  return () => {
    if (previewTimer) clearTimeout(previewTimer);
    fab.removeEventListener('click', onFab);
    if (closeBtn) closeBtn.removeEventListener('click', onClose);
    form.removeEventListener('submit', onSubmit);
  };
}
