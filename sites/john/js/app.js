// app.js — shared chrome orchestration for John's site prototype.
//
// Responsibilities (per architecture-spec §2):
// - Variant switch via `data-variant` attribute swap (not DOM rebuild).
// - Theme toggle scoped to #app via `data-theme`.
// - localStorage persistence under keys: krevio.variant, krevio.theme.
// - URL sync with `history.replaceState` (?v=<variant>&t=<theme>).
// - Keyboard reachability for chrome tabs (arrow keys + Enter/Space).
//
// Per-variant mount/unmount lifecycle is intentionally stubbed. Frontend Eng
// fills in `js/variants/<variant>.js` modules later; this scaffolding just
// toggles the `hidden` attribute + `aria-hidden` so the chrome works today.

const VARIANTS = ['editorial', 'utility', 'warmth'];
const THEMES = ['light', 'dark'];
const LS_VARIANT = 'krevio.variant';
const LS_THEME = 'krevio.theme';

/** Read a query param from the current URL. */
function readQuery() {
  const params = new URLSearchParams(window.location.search);
  return {
    v: params.get('v'),
    t: params.get('t')
  };
}

/** Pick the initial variant: URL > localStorage > default 'editorial'. */
function resolveInitialVariant(query) {
  if (query.v && VARIANTS.includes(query.v)) return query.v;
  try {
    const saved = localStorage.getItem(LS_VARIANT);
    if (saved && VARIANTS.includes(saved)) return saved;
  } catch { /* localStorage unavailable — ignore */ }
  return 'editorial';
}

/** Pick the initial theme: URL > localStorage > prefers-color-scheme > 'light'. */
function resolveInitialTheme(query) {
  if (query.t && THEMES.includes(query.t)) return query.t;
  try {
    const saved = localStorage.getItem(LS_THEME);
    if (saved && THEMES.includes(saved)) return saved;
  } catch { /* localStorage unavailable — ignore */ }
  if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
    return 'dark';
  }
  return 'light';
}

/** Write variant + theme to the URL without adding a history entry. */
function syncUrl(variant, theme) {
  const params = new URLSearchParams({ v: variant, t: theme });
  const url = `${window.location.pathname}?${params}${window.location.hash || ''}`;
  try {
    window.history.replaceState(null, '', url);
  } catch { /* ignore — some sandboxed contexts disallow replaceState */ }
}

/** Apply a variant to the DOM (attribute, tab ARIA, visibility, scroll). */
function applyVariant(variantId) {
  const app = document.getElementById('app');
  if (!app) return;
  const prev = app.dataset.variant;
  if (prev === variantId) return;

  app.dataset.variant = variantId;

  // Variant-section visibility
  document.querySelectorAll('[data-variant-id]').forEach(el => {
    const on = el.dataset.variantId === variantId;
    el.hidden = !on;
    el.setAttribute('aria-hidden', String(!on));
  });

  // Tab ARIA state + roving tabindex
  document.querySelectorAll('.chrome-tab').forEach(tab => {
    const on = tab.dataset.variantTarget === variantId;
    tab.setAttribute('aria-selected', String(on));
    tab.tabIndex = on ? 0 : -1;
  });

  // TODO(Frontend Eng): call variantModules[prev]?.unmount / [variantId]?.mount
  // once per-variant modules exist at js/variants/*.js.

  // Persist
  try { localStorage.setItem(LS_VARIANT, variantId); } catch { /* ignore */ }

  // Scroll to top so the new hero is visible
  window.scrollTo({ top: 0, behavior: 'instant' in window ? 'instant' : 'auto' });
}

/** Apply a theme to the DOM (attribute, <html> attribute, toggle label). */
function applyTheme(theme) {
  const app = document.getElementById('app');
  if (!app) return;
  app.dataset.theme = theme;
  // Keep <html data-theme="..."> in sync so krevio-tokens.css theme blocks match.
  document.documentElement.dataset.theme = theme;

  const toggle = document.querySelector('[data-theme-toggle]');
  if (toggle) {
    toggle.setAttribute('aria-pressed', String(theme === 'dark'));
    const icon = toggle.querySelector('[data-theme-icon]');
    if (icon) icon.textContent = theme === 'dark' ? 'Dark' : 'Light';
  }

  try { localStorage.setItem(LS_THEME, theme); } catch { /* ignore */ }
}

/** Keyboard navigation for the variant tablist. */
function bindTabKeyboard() {
  const tabs = Array.from(document.querySelectorAll('.chrome-tab'));
  tabs.forEach((tab, idx) => {
    tab.addEventListener('keydown', (e) => {
      let nextIdx = null;
      if (e.key === 'ArrowRight') nextIdx = (idx + 1) % tabs.length;
      else if (e.key === 'ArrowLeft') nextIdx = (idx - 1 + tabs.length) % tabs.length;
      else if (e.key === 'Home') nextIdx = 0;
      else if (e.key === 'End') nextIdx = tabs.length - 1;
      if (nextIdx !== null) {
        e.preventDefault();
        tabs[nextIdx].focus();
      }
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        const target = tab.dataset.variantTarget;
        if (target) {
          applyVariant(target);
          syncUrl(target, document.getElementById('app').dataset.theme);
        }
      }
    });
    tab.addEventListener('click', () => {
      const target = tab.dataset.variantTarget;
      if (target) {
        applyVariant(target);
        syncUrl(target, document.getElementById('app').dataset.theme);
      }
    });
  });
}

/** Theme toggle click binding. */
function bindThemeToggle() {
  const toggle = document.querySelector('[data-theme-toggle]');
  if (!toggle) return;
  toggle.addEventListener('click', () => {
    const app = document.getElementById('app');
    const next = app.dataset.theme === 'dark' ? 'light' : 'dark';
    applyTheme(next);
    syncUrl(app.dataset.variant, next);
  });
}

/** Boot. */
function init() {
  const query = readQuery();
  const variant = resolveInitialVariant(query);
  const theme = resolveInitialTheme(query);

  applyVariant(variant);
  applyTheme(theme);
  syncUrl(variant, theme);

  bindTabKeyboard();
  bindThemeToggle();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
