# John's General Contracting — Site Prototype

Single-URL prototype with three DOM-scoped design variants (Editorial, Utility, Warmth), switchable via top chrome. This is the scaffolding — Frontend Eng x3 land variant content next.

## What lives here

```
sites/john/
  index.html                  # shared chrome + three <section data-variant-id="..."> blocks
  rate-card.json              # estimation knowledge base (consumed by /api/demos/chat)
  README.md                   # this file
  assets/
    gallery/                  # before/after placeholders go here
    logo/                     # placeholder brand marks
  css/
    chrome.css                # shared chrome only — no variant styling, no .container/.row/.grid
    variants/
      editorial.css           # [data-variant-id="editorial"] ...
      utility.css             # [data-variant-id="utility"] ...
      warmth.css              # [data-variant-id="warmth"] ...
      _test-bad.css.skip      # deliberately-bad example for stylelint CI verification
  js/
    app.js                    # variant switch + theme toggle + localStorage + URL sync
    variants/                 # per-variant JS modules (empty until Frontend Eng lands)
```

## Source-of-truth docs

Read these in order before editing anything here:

1. `_Workspace/clients/john-handyman/architecture-spec.md` — structural decisions, data contracts, folder layout.
2. `_Workspace/clients/john-handyman/meeting-minutes-2026-04-17.md` — cross-functional sign-off; C1/C2/C6/C7 constrain what ships in this scaffolding.
3. `_Workspace/clients/john-handyman/decisions-2026-04-17.md` — Milan's sign-off on the blocking items (tenant key, email routing, estimation scope, placeholder imagery).
4. `_Workspace/context/config-schema.md` — CONFIG contract (updated 2026-04-17 to allow per-variant `hero.headline` / `hero.subhead`).
5. `_Workspace/context/css-enforcement-rules.md` — token discipline (shared across all of Krevio).
6. `CLAUDE.md` — tech-stack non-negotiables.

## Non-negotiables (repeat of CLAUDE.md + meeting-minutes §C7)

- Every selector in `css/variants/<variant>.css` MUST be prefixed with `[data-variant-id="<variant>"]`. Stylelint CI rejects otherwise.
- `.container`, `.section`, `.row`, `.grid`, `.col-*` are BANNED in `css/chrome.css`. Each variant defines its own layout primitives inside its variant-scoped stylesheet.
- Spacing tokens are per-variant (`--ed-space-*` / `--ut-space-*` / `--wc-space-*`). Do not introduce a shared `--space-unit` that variants override.
- Breakpoints locked to `600 / 900 / 1200` px. No other magic numbers.
- No emoji in code or copy.

## URLs

- Preview: `krevio-site.vercel.app/sites/john/?v=editorial&t=light`
- Variant query params: `?v=editorial|utility|warmth`, `?t=light|dark`.
- Variant switching is client-side. One URL serves all three.

## Backend wiring

- Chat: `/api/demos/chat` with `businessType: "johns-site"`. System prompt loaded from `rate-card.json` on server start and conditionally includes numeric ranges based on `CONFIG.chat.estimationMode` (`"ranges"` vs `"qualifiers-only"`).
- Lead email: `/api/notify` with `tenantId: "johns-site"` — routes to `krevio@krevio.net`. Subject prefixed `[John's Site]`. Milan forwards to John manually in Phase 1 (decisions-2026-04-17 §B3).
