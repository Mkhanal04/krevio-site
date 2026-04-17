# John's Site — Assets

This folder holds the placeholder imagery wired into John's 3-variant prototype (Editorial / Utility / Warmth). Everything here is **preview-only**. No image in this folder represents real work John has done. The site signals that honestly via a SAMPLE badge on every rendered asset.

Decision record: Milan's blocking-list sign-off 2026-04-17 (B6) — Midjourney OK for hero compositions, Unsplash stock only for before/after galleries. See `_Workspace/clients/john-handyman/decisions-2026-04-17.md`.

---

## Two-track strategy

We run two tracks in parallel so the prototype renders with real photography *today* and can level up to bespoke Midjourney imagery *later* without a code change.

### Track A — Unsplash hotlinks (shipping now)

Every slot in `manifest.json` has a `current` value pointing at an Unsplash CDN URL in the format:

```
https://images.unsplash.com/photo-<id>?w=1600&q=80&auto=format&fit=crop
```

Frontend Eng reads `manifest.json`, pulls the `current` URL for the slot it needs, and sets the `<img src>` directly. No local image files. Vercel serves nothing — the browser fetches straight from Unsplash's CDN, which keeps this repo small and render times fast.

Attribution lives in `manifest.json` under each slot's `attribution` field and must be preserved. Unsplash's license does not require on-page credit, but we keep it in the manifest so it is never lost.

### Track B — Midjourney prompt briefs (for Milan to run)

Each hero slot carries a `midjourney_prompt` string tuned to that variant's aesthetic:

- **Editorial** — magazine-cover composition, muted earth tones, negative space for a serif headline, photojournalism aesthetic.
- **Utility** — clean product-catalog feel, neutral palette, Linear/Vercel/Raycast marketing sensibility, no humans.
- **Warmth** — over-the-shoulder craftsman, terracotta and linen, tactile Our Place / Cometeer brand-photo mood.

Portrait-John has a Midjourney prompt too — a silhouette placeholder that stays in place until John sends his real photo.

Gallery before/after pairs do NOT have Midjourney prompts. Per B6 they stay Unsplash-sourced for the life of the prototype; John's real project photos replace them directly once he sends any.

Milan runs the prompts in Midjourney v6+ when he has 10 minutes. Outputs save to `sites/john/assets/` with a descriptive filename (e.g. `hero-warmth.jpg`), then the manifest swaps to point at the local path.

---

## Swap flow — Unsplash to Midjourney

1. Milan generates an image in Midjourney using the `midjourney_prompt` string for the slot.
2. Save the output into this folder with the slot's matching filename (e.g. `hero-editorial.jpg`, `hero-warmth.jpg`). Keep landscape orientation for hero slots, 4:5 for portrait.
3. Open `manifest.json`. Change the slot's `current` from the Unsplash URL to the local relative path (e.g. `"./hero-editorial.jpg"`).
4. If the image is final production-quality (not preview), flip `placeholder` to `false`. This suppresses the SAMPLE badge for that slot.
5. Clear the `attribution` field if the image is no longer Unsplash-sourced. Keep the `midjourney_prompt` in place as provenance — it documents how the image was generated.
6. Commit the new file and the manifest diff together.

Frontend Eng does not need a code change to pick up the swap. The manifest is the contract.

---

## `data-placeholder` attribute contract

Every `<img>` rendered from a manifest slot with `placeholder: true` carries a `data-placeholder="true"` attribute on the element. Frontend Eng owns the badge rendering — CSS selector on `[data-placeholder="true"]` draws a small "SAMPLE" corner pill in neutral chrome tokens, positioned top-right of the image bounding box, z-indexed above the image but below any interactive control (slider handles, gallery pagination).

Recommended contract for Frontend Eng:

- Pill text: `SAMPLE` (uppercase, Inter 500, `--fs-cap`).
- Background: `--chrome-surface` with a 1px `--chrome-rule` border. Neutral — does not pick up variant accent color.
- Position: top-right, 12px inset from the image corner.
- Print media: hidden. The badge is a preview-environment signal and should not appear in any export or share capture.
- Accessibility: the badge is decorative; the underlying `<img alt>` already names the image as a placeholder.

When `placeholder: false` on a slot, Frontend Eng omits the `data-placeholder` attribute entirely and no badge renders.

---

## Slot inventory

| Slot | Use | Source track | Variant |
|---|---|---|---|
| `hero-editorial` | Full-bleed hero photo, headline overlay | Unsplash now, Midjourney later | Editorial |
| `hero-utility` | Optional hero photo (Utility's diagnostic-panel hero may not use it) | Unsplash now, Midjourney later | Utility |
| `hero-warmth` | Asymmetric hero image, overlaps headline | Unsplash now, Midjourney later | Warmth |
| `portrait-john` | About block portrait placeholder, silhouette until John sends his | Unsplash now, Midjourney later | Shared |
| `gallery-01-before` / `gallery-01-after` | Power washing / driveway transformation | Unsplash (permanent per B6) | Shared |
| `gallery-02-before` / `gallery-02-after` | Fencing install or repair | Unsplash (permanent per B6) | Shared |
| `gallery-03-before` / `gallery-03-after` | Landscaping / yard tidy-up | Unsplash (permanent per B6) | Shared |

Captions per variant live in `copy.md` §R5 — Frontend Eng reads both this manifest (for the image URL) and the copy file (for the caption) and pairs them by index.

---

## Non-negotiables

- Attribution preserved in `manifest.json` for every Unsplash URL.
- No trademarked logos visible in any sourced image.
- No identifiable faces in gallery photos — the gallery represents work, not clients.
- No emoji in this README or in `manifest.json`.
- No images downloaded to the repo for Track A. Unsplash hotlinks only. Repo stays small, Vercel stays fast.
- Gallery pairs must look like the same physical scene at different stages — same angle, same location, different state. If a true matched pair does not exist on Unsplash, the two selected photos must at least read as the same scene.

---

## Adding a new slot

1. Append the slot to `manifest.json` under `slots`, following the same schema as the existing entries (`current`, `attribution`, `midjourney_prompt`, `alt`, `placeholder`, `variant`, `aspect`, plus `pair` + `state` + `service` for gallery slots).
2. Verify the Unsplash URL resolves with `curl -I -L <url>` — expect HTTP 200.
3. If the slot is a gallery pair, add both before and after at the same time; never ship half a pair.
4. Update the slot inventory table above.
5. Commit manifest + README together.
