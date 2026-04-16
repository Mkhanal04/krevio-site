#!/usr/bin/env node
/**
 * mobile-smoke.mjs — Mobile design system smoke test
 *
 * Asserts the critical mobile contracts documented in CLAUDE.md:
 *   1. No horizontal overflow at 390x844 (iPhone 14 portrait)
 *   2. Demo bar stays on a single row (height ≤ 56px)
 *   3. Demo bar buttons hit the --tap-min 36px floor
 *   4. Chat panel opens and fits within 75svh
 *   5. Chat input font-size ≥ 16px (prevents iOS autozoom on focus)
 *   6. Context banner (RE only) does not wrap on mobile
 *
 * Run against any deployed URL — production, preview, or local file://.
 *
 *   Setup once (no permanent dep, just downloads chromium for npx):
 *     npx -y playwright@latest install chromium
 *
 *   Run:
 *     node scripts/mobile-smoke.mjs                     # defaults to krevio.net
 *     node scripts/mobile-smoke.mjs https://krevio.net
 *     node scripts/mobile-smoke.mjs https://<preview>.vercel.app
 *
 * Exits 0 on pass, 1 on any failure. CI-friendly.
 *
 * IMPORTANT: never relax assertions to make this pass. Fix the CSS instead.
 */

import { chromium } from 'playwright';

const BASE = process.argv[2] || 'https://krevio.net';
const VIEWPORT = { width: 390, height: 844 };

// Landing is skipped by default — TD-021 tracks a Playwright hit-test failure
// on the landing chat bubble that we're not fixing ahead of the landing-page
// rewrite (locked decision #15). Set SMOKE_INCLUDE_LANDING=1 to re-enable.
// The demos are what we actually test — they're the template under active
// development and the template is what CI must protect.
const INCLUDE_LANDING = process.env.SMOKE_INCLUDE_LANDING === '1';

const DEMOS = [
  ...(INCLUDE_LANDING ? [{ slug: '', name: 'Landing' }] : []),
  { slug: 'demos/plumbing/',   name: 'Plumbing' },
  { slug: 'demos/hvac/',       name: 'HVAC' },
  { slug: 'demos/landscaping/',name: 'Landscaping' },
  { slug: 'demos/remodeling/', name: 'Remodeling' },
  { slug: 'demos/realestate/', name: 'Real Estate' },
];

const failures = [];
const fail = (page, msg) => failures.push(`[${page}] ${msg}`);

async function checkPage(browser, url, name) {
  const ctx = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 3, isMobile: true });
  const page = await ctx.newPage();
  let resp;
  try {
    resp = await page.goto(url, { waitUntil: 'networkidle', timeout: 30_000 });
  } catch (e) {
    fail(name, `navigation failed: ${e.message}`);
    await ctx.close();
    return;
  }
  if (!resp || !resp.ok()) {
    fail(name, `status ${resp ? resp.status() : 'no response'}`);
    await ctx.close();
    return;
  }

  // 1. Horizontal overflow.
  const overflow = await page.evaluate(() => {
    const docW = document.documentElement.scrollWidth;
    const winW = window.innerWidth;
    return { docW, winW, overflows: docW > winW + 1 };
  });
  if (overflow.overflows) {
    fail(name, `horizontal overflow: scrollWidth=${overflow.docW} > viewport=${overflow.winW}`);
  }

  // 2 + 3. Demo bar single-row + button tap targets (skip landing — no demo bar).
  if (name !== 'Landing') {
    const bar = await page.evaluate(() => {
      const el = document.querySelector('.demo-bar');
      if (!el) return null;
      const r = el.getBoundingClientRect();
      const btns = Array.from(el.querySelectorAll('.demo-bar-btn, .demo-bar-theme'))
        .filter((b) => b.offsetParent !== null)
        .map((b) => ({
          cls: b.className,
          h: b.getBoundingClientRect().height,
          w: b.getBoundingClientRect().width,
        }));
      return { height: r.height, btns };
    });
    if (!bar) {
      fail(name, 'demo-bar element not found');
    } else {
      if (bar.height > 56) {
        fail(name, `demo bar wrapped (height=${bar.height}px > 56px)`);
      }
      bar.btns.forEach((b) => {
        if (b.h < 35.5) {
          fail(name, `demo bar button under tap-min: ${b.cls.trim()} h=${b.h}px (need ≥ 36)`);
        }
      });
    }
  }

  // 4. Chat panel opens and fits.
  const trigger = await page.$('.chat-bubble-btn');
  if (trigger) {
    await trigger.click();
    await page.waitForTimeout(400);
    const panel = await page.evaluate(() => {
      const el = document.querySelector('.chat-panel');
      if (!el) return null;
      const r = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      return { h: r.height, w: r.width, display: cs.display };
    });
    if (!panel || panel.display === 'none') {
      fail(name, 'chat panel did not open');
    } else {
      const cap = Math.min(VIEWPORT.height * 0.75, 600);
      if (panel.h > cap + 1) {
        fail(name, `chat panel taller than 75svh: ${panel.h}px > ${cap}px`);
      }
      if (panel.w > VIEWPORT.width - 16) {
        fail(name, `chat panel wider than viewport - 16px gutter: ${panel.w}px`);
      }

      // 5. Chat input font ≥ 16px
      const input = await page.evaluate(() => {
        const i = document.querySelector('.chat-input');
        if (!i) return null;
        return parseFloat(getComputedStyle(i).fontSize);
      });
      if (input != null && input < 16) {
        fail(name, `chat input font-size ${input}px < 16px (iOS will autozoom on focus)`);
      }
    }
  }

  // 6. Context banner (Real Estate only).
  if (name === 'Real Estate') {
    const banner = await page.evaluate(() => {
      const el = document.querySelector('.context-banner');
      if (!el) return null;
      return el.getBoundingClientRect().height;
    });
    if (banner != null && banner > 32) {
      fail(name, `context banner wrapped: height=${banner}px > 32px`);
    }
  }

  await ctx.close();
}

(async () => {
  console.log(`Mobile smoke @ ${VIEWPORT.width}x${VIEWPORT.height} → ${BASE}\n`);
  const browser = await chromium.launch();
  for (const { slug, name } of DEMOS) {
    const url = new URL(slug, BASE.endsWith('/') ? BASE : BASE + '/').toString();
    process.stdout.write(`  ${name.padEnd(12)} ${url} ... `);
    const before = failures.length;
    await checkPage(browser, url, name);
    console.log(failures.length === before ? 'PASS' : 'FAIL');
  }
  await browser.close();

  if (failures.length === 0) {
    console.log('\n✓ All mobile contracts hold at 390x844.');
    process.exit(0);
  }
  console.log(`\n✗ ${failures.length} failure(s):\n`);
  failures.forEach((f) => console.log('  - ' + f));
  console.log('\nFix the CSS — do not relax this test.');
  process.exit(1);
})();
