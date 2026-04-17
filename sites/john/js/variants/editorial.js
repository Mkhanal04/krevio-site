// Editorial variant module — Frontend Eng (Editorial) owns this.
// Exports { mount, unmount } per architecture-spec §1 lifecycle contract.

let cleanupFns = [];

function on(target, event, handler, opts) {
  target.addEventListener(event, handler, opts);
  cleanupFns.push(() => target.removeEventListener(event, handler, opts));
}

function qs(root, sel) {
  return root.querySelector(sel);
}

function qsa(root, sel) {
  return Array.from(root.querySelectorAll(sel));
}

/* ────────────────
   Hero smooth-scroll
   ──────────────── */
function initHeroCTA(root) {
  const cta = qs(root, "[data-ed-hero-cta]");
  if (!cta) return;
  on(cta, "click", (e) => {
    const href = cta.getAttribute("href") || "";
    if (!href.startsWith("#")) return;
    const target = qs(root, href);
    if (!target) return;
    e.preventDefault();
    target.scrollIntoView({ behavior: "smooth", block: "start" });
    const firstInput = target.querySelector("input, textarea");
    if (firstInput) {
      setTimeout(() => firstInput.focus({ preventScroll: true }), 400);
    }
  });
}

/* ────────────────
   Services reveal list (single-open accordion)
   ──────────────── */
function initServiceList(root) {
  const items = qsa(root, "[data-ed-service]");
  items.forEach((item) => {
    const head = qs(item, ".ed-service-head");
    if (!head) return;
    on(head, "click", () => {
      const isOpen = item.getAttribute("data-open") === "true";
      items.forEach((other) => {
        other.setAttribute("data-open", "false");
        const h = qs(other, ".ed-service-head");
        if (h) h.setAttribute("aria-expanded", "false");
      });
      if (!isOpen) {
        item.setAttribute("data-open", "true");
        head.setAttribute("aria-expanded", "true");
      }
    });
  });
}

/* ────────────────
   FAQ accordion (independent open/close)
   ──────────────── */
function initFAQ(root) {
  const items = qsa(root, "[data-ed-faq]");
  items.forEach((item) => {
    const q = qs(item, ".ed-faq-q");
    if (!q) return;
    on(q, "click", () => {
      const isOpen = item.getAttribute("data-open") === "true";
      item.setAttribute("data-open", isOpen ? "false" : "true");
      q.setAttribute("aria-expanded", isOpen ? "false" : "true");
    });
  });
}

/* ────────────────
   Before/after drag-to-reveal slider
   ──────────────── */
function initBASlider(root) {
  const gallery = qs(root, "[data-ed-ba]");
  const slider = qs(root, "[data-ed-ba-slider]");
  const dataEl = qs(root, "[data-ed-ba-pairs]");
  if (!slider || !gallery) return;

  let pairs = [];
  try {
    pairs = dataEl ? JSON.parse(dataEl.textContent || "[]") : [];
  } catch (err) {
    pairs = [];
  }

  if (!Array.isArray(pairs) || pairs.length === 0) {
    gallery.classList.add("no-js-fallback");
    return;
  }

  const before = qs(slider, ".ed-ba-before");
  const after = qs(slider, ".ed-ba-after");
  const divider = qs(slider, ".ed-ba-divider");
  const handle = qs(slider, ".ed-ba-handle");
  const caption = qs(root, "[data-ed-ba-caption]");
  const countEl = qs(root, "[data-ed-ba-count]");
  const prevBtn = qs(root, "[data-ed-ba-prev]");
  const nextBtn = qs(root, "[data-ed-ba-next]");

  let idx = 0;
  let pct = 50;

  function fallbackBg(label) {
    // deterministic color per label so no asset → still reads as a distinct image
    let h = 0;
    for (let i = 0; i < label.length; i++) h = (h * 31 + label.charCodeAt(i)) & 0xff;
    return `linear-gradient(135deg, hsl(${h} 15% 30%), hsl(${(h + 40) % 360} 25% 18%))`;
  }

  function paint() {
    const pair = pairs[idx];
    if (!pair) return;
    const beforeBg = pair.before ? `url("${pair.before}")` : fallbackBg(pair.caption + ":before");
    const afterBg = pair.after ? `url("${pair.after}")` : fallbackBg(pair.caption + ":after");
    if (before) before.style.backgroundImage = beforeBg;
    if (after) after.style.backgroundImage = afterBg;
    if (caption) caption.textContent = pair.caption || "";
    if (countEl) countEl.textContent = `${idx + 1} / ${pairs.length}`;
    if (prevBtn) prevBtn.disabled = idx === 0;
    if (nextBtn) nextBtn.disabled = idx === pairs.length - 1;
    applyPct(50);
  }

  function applyPct(p) {
    pct = Math.max(0, Math.min(100, p));
    if (after) after.style.clipPath = `inset(0 0 0 ${pct}%)`;
    if (divider) divider.style.left = `${pct}%`;
    if (handle) {
      handle.style.left = `${pct}%`;
      handle.setAttribute("aria-valuenow", String(Math.round(pct)));
    }
  }

  function pctFromEvent(e) {
    const rect = slider.getBoundingClientRect();
    const x = (e.touches ? e.touches[0].clientX : e.clientX) - rect.left;
    return (x / rect.width) * 100;
  }

  let dragging = false;
  function onDown(e) {
    dragging = true;
    if (handle && e.target !== handle) handle.focus({ preventScroll: true });
    applyPct(pctFromEvent(e));
    e.preventDefault();
  }
  function onMove(e) {
    if (!dragging) return;
    applyPct(pctFromEvent(e));
  }
  function onUp() {
    dragging = false;
  }

  on(slider, "pointerdown", onDown);
  on(window, "pointermove", onMove);
  on(window, "pointerup", onUp);
  on(window, "pointercancel", onUp);

  if (handle) {
    handle.setAttribute("role", "slider");
    handle.setAttribute("aria-label", "Drag to reveal after photo");
    handle.setAttribute("aria-valuemin", "0");
    handle.setAttribute("aria-valuemax", "100");
    handle.setAttribute("aria-valuenow", "50");
    handle.setAttribute("tabindex", "0");
    on(handle, "keydown", (e) => {
      if (e.key === "ArrowLeft") {
        applyPct(pct - 5);
        e.preventDefault();
      } else if (e.key === "ArrowRight") {
        applyPct(pct + 5);
        e.preventDefault();
      } else if (e.key === "Home") {
        applyPct(0);
        e.preventDefault();
      } else if (e.key === "End") {
        applyPct(100);
        e.preventDefault();
      }
    });
  }

  if (prevBtn) {
    on(prevBtn, "click", () => {
      if (idx > 0) {
        idx -= 1;
        paint();
      }
    });
  }
  if (nextBtn) {
    on(nextBtn, "click", () => {
      if (idx < pairs.length - 1) {
        idx += 1;
        paint();
      }
    });
  }

  // Fallback tile backgrounds (in case CSS-only version is revealed)
  const fallbackTiles = qsa(gallery, ".ed-ba-fallback .ed-ba-layer");
  fallbackTiles.forEach((tile, i) => {
    const pair = pairs[i % pairs.length];
    if (!pair) return;
    const which = tile.getAttribute("data-state") || "before";
    const src = pair[which];
    tile.style.backgroundImage = src ? `url("${src}")` : fallbackBg(pair.caption + ":" + which);
  });

  paint();
}

/* ────────────────
   Contact form → /api/notify?tenantId=johns-site
   ──────────────── */
function initContactForm(root) {
  const form = qs(root, "[data-ed-form]");
  if (!form) return;
  const status = qs(root, "[data-ed-form-status]");
  const submit = qs(root, "[data-ed-form-submit]");

  function setStatus(text, state) {
    if (!status) return;
    status.textContent = text;
    if (state) status.setAttribute("data-state", state);
    else status.removeAttribute("data-state");
  }

  on(form, "submit", async (e) => {
    e.preventDefault();
    const data = new FormData(form);
    const name = String(data.get("name") || "").trim();
    const phone = String(data.get("phone") || "").trim();
    const email = String(data.get("email") || "").trim();
    const address = String(data.get("address") || "").trim();
    const message = String(data.get("message") || "").trim();
    const source = String(data.get("source") || "").trim();

    if (!name) {
      setStatus("Please tell me your name.", "error");
      return;
    }
    if (!phone && !email) {
      setStatus("Leave a phone number or email so I can get back to you.", "error");
      return;
    }

    if (submit) submit.disabled = true;
    setStatus("Sending…", null);

    try {
      const res = await fetch("/api/notify?tenantId=johns-site", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          phone,
          email,
          address,
          message,
          source,
          variant: "editorial",
          tenant: "johns-site",
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      form.reset();
      setStatus(
        "Got it — thanks. I'll call or text you back today. If it's urgent, go ahead and call (214) 555-0134.",
        "ok"
      );
    } catch (err) {
      setStatus(
        "Something went sideways sending that. Try again or call (214) 555-0134.",
        "error"
      );
    } finally {
      if (submit) submit.disabled = false;
    }
  });
}

/* ────────────────
   Chat widget — lightweight panel → /api/demos/chat
   ──────────────── */
function initChat(root) {
  const pill = qs(root, "[data-ed-chat-pill]");
  const panel = qs(root, "[data-ed-chat-panel]");
  const closeBtn = qs(root, "[data-ed-chat-close]");
  const log = qs(root, "[data-ed-chat-log]");
  const form = qs(root, "[data-ed-chat-form]");
  const input = qs(root, "[data-ed-chat-input]");
  const sendBtn = qs(root, "[data-ed-chat-send]");
  if (!pill || !panel || !log || !form || !input) return;

  const OPENER =
    "Hey, I'm John's assistant. I can help with plumbing, handyman work, landscaping, fencing, power washing, electrical, and epoxy floors. Tell me what's going on at your place and I'll ask a couple quick questions, give you a rough ballpark based on typical Frisco and Celina jobs, and set you up for a free on-site estimate. John confirms final pricing when he sees it in person.";

  const history = [];
  let opened = false;

  function addMsg(role, text) {
    const el = document.createElement("div");
    el.className = "ed-chat-msg";
    el.setAttribute("data-role", role);
    el.textContent = text;
    log.appendChild(el);
    log.scrollTop = log.scrollHeight;
    return el;
  }

  function open() {
    panel.setAttribute("data-open", "true");
    pill.setAttribute("aria-expanded", "true");
    if (!opened) {
      addMsg("bot", OPENER);
      opened = true;
    }
    setTimeout(() => input.focus(), 50);
  }
  function close() {
    panel.setAttribute("data-open", "false");
    pill.setAttribute("aria-expanded", "false");
    pill.focus();
  }

  on(pill, "click", () => {
    const isOpen = panel.getAttribute("data-open") === "true";
    if (isOpen) close();
    else open();
  });
  if (closeBtn) on(closeBtn, "click", close);
  on(document, "keydown", (e) => {
    if (e.key === "Escape" && panel.getAttribute("data-open") === "true") {
      close();
    }
  });

  on(form, "submit", async (e) => {
    e.preventDefault();
    const text = input.value.trim();
    if (!text) return;
    addMsg("user", text);
    history.push({ role: "user", content: text });
    input.value = "";
    input.disabled = true;
    if (sendBtn) sendBtn.disabled = true;

    const pending = addMsg("bot", "…");
    try {
      const res = await fetch("/api/demos/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          businessType: "johns-site",
          message: text,
          history,
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const body = await res.json();
      const reply =
        body.reply ||
        body.message ||
        body.text ||
        "I can help — tell me a little more about the job and your zip code.";
      pending.textContent = reply;
      history.push({ role: "assistant", content: reply });
    } catch (err) {
      pending.setAttribute("data-role", "error");
      pending.textContent =
        "Chat hiccup on my end — try again, or call (214) 555-0134.";
    } finally {
      input.disabled = false;
      if (sendBtn) sendBtn.disabled = false;
      input.focus();
    }
  });
}

/* ────────────────
   Lifecycle
   ──────────────── */
export function mount(root) {
  const scope = root || document.querySelector('[data-variant-id="editorial"]');
  if (!scope) return;
  initHeroCTA(scope);
  initServiceList(scope);
  initFAQ(scope);
  initBASlider(scope);
  initContactForm(scope);
  initChat(scope);
}

export function unmount(/* root */) {
  cleanupFns.forEach((fn) => {
    try {
      fn();
    } catch (err) {
      /* noop */
    }
  });
  cleanupFns = [];
}

// Auto-mount when the Editorial section is present and not hidden.
// (app.js doesn't yet wire per-variant mount/unmount — safe fallback.)
if (typeof document !== "undefined") {
  const boot = () => {
    const scope = document.querySelector('[data-variant-id="editorial"]');
    if (scope && !scope.hasAttribute("hidden")) {
      mount(scope);
    }
  };
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot, { once: true });
  } else {
    boot();
  }
}
