# Krevio Demo Template — Quick-Start Guide

**Target time:** ~20 minutes for a Tier 1 demo  
**Reference:** `_Workspace/krevio-site/specs/template-extraction-analysis.md`

---

## Step-by-Step

### 1. Copy the template (30 sec)
```
cp demos/_template/index.html demos/[industry]/index.html
```
Example: `demos/remodeling/index.html`

---

### 2. Fill in CONFIG (5 min)

Open the new file and find the `CONFIG` block at the top of `<script>`.  
Replace every ALL_CAPS placeholder:

| Field | What to put |
|-------|-------------|
| `businessName` | "Green Valley Landscaping" |
| `businessNameShort` | "Green Valley" |
| `businessNameSub` | "Landscaping" |
| `businessType` | `"landscaping"` — must match a key in `api/demos/chat.js` AND a `[data-industry]` class in `css/industry-overrides.css` |
| `schemaType` | `"LandscapeService"`, `"Plumber"`, `"HVACBusiness"`, `"HomeAndConstructionBusiness"`, etc. |
| `emoji` | `"🌿"` |
| `tagline` | One-line business description |
| `phone` / `phoneRaw` | Display + digits-only |
| `address` / `city` / `state` / `zip` | Full address |
| `areasServed` | Array of city names |
| `hours` | `"Mon–Sat 8AM–6PM"` or `"24/7 Emergency"` |
| `rating` / `reviewCount` | Mock values that look realistic |

**Feature flags** — turn on Tier 2/3 features:

| Flag | What it unlocks |
|------|----------------|
| `hasEmergencyBooking: true` | Emergency / Schedule urgency toggle in booking form |
| `hasDispatch: true` | Dispatch tab in owner dashboard |
| `hasCustomerCRM: true` | Customers CRM tab |
| `hasMoney: true` | Money / Invoices tab |
| `hasReceipts: true` | Receipts & Expenses tab |
| `hasGallery: true` | Before/After gallery (default: true) |
| `hasLanguageToggle: true` | EN/ES toggle in demo bar |

For a **Tier 1 demo** (5 tabs): leave all false except `hasGallery`.  
For a **Tier 2 demo** (field service): set `hasEmergencyBooking`, `hasDispatch` to true.  
For a **Tier 3 demo** (full — like plumbing): also set `hasCustomerCRM`, `hasMoney`, `hasReceipts`.

---

### 3. Fill in DATA (10 min)

Find the `DATA` block. Replace placeholder content section by section:

#### Customer View (~5 min)
- `DATA.services` — 3–6 services with icon, name, price, desc, features
- `DATA.reviews` — 4 reviews with realistic customer names and text
- `DATA.gallery` — 3 before/after examples (can hide with `hasGallery: false`)

#### Owner Dashboard (~5 min)
- `DATA.metrics` — 4 KPI cards (revenue, jobs, outstanding, response)
- `DATA.todaySchedule` — 2–4 scheduled jobs for "today"
- `DATA.leads` — 4–7 leads across pipeline stages
- `DATA.geo.recommendations` — 4 business-specific GEO improvement tips
- `DATA.faqs` — 5 Q&As relevant to this industry
- `DATA.automation.campaigns` — 2–3 active automated campaigns

#### If Tier 2/3 tabs are enabled:
Add `DATA.dispatch`, `DATA.customers`, `DATA.money`, `DATA.receipts` objects.  
Copy the structure from `demos/plumbing/index.html` — it's the reference implementation.

---

### 4. Update TRANS_ES (3 min)
Only needed if `hasLanguageToggle: true`.

Find the `TRANS_ES` block. Update:
- `heroHeadline` — Spanish hero headline
- `heroSub` — Spanish hero subline
- `chatGreeting` — already references `CONFIG.businessName` ✓
- `chatPlaceholder` — Spanish chat input placeholder

---

### 5. Add system prompt to API (2 min)

Open `api/demos/chat.js`. Find the `SYSTEM_PROMPTS` object and add an entry:

```javascript
[CONFIG.businessType]: `
You are a helpful assistant for ${businessName}, a ${description} in ${city}, TX.
Services: [list]
Phone: [phone]
Hours: [hours]
...
`
```

The `businessType` key must match `CONFIG.businessType` exactly.

---

### 6. Test

Open the demo locally or push to Vercel preview branch.  
Check:
- [ ] Hero gradient matches industry (set by `data-industry` + `css/industry-overrides.css`)
- [ ] Business name appears in: demo bar, chat header, sidebar logo, footer
- [ ] Services render in customer view and booking dropdown
- [ ] Owner dashboard metrics, schedule, and pipeline populate
- [ ] Theme toggle works (dark/light)
- [ ] Chatbot opens and responds (fallback + API)
- [ ] Mobile view at 375px — no overflow

---

## Industry Color Reference

| Industry | `data-industry` | Accent (light) | Hero gradient |
|----------|----------------|----------------|---------------|
| Plumbing | `plumbing` | `#0891B2` teal | `#134E4A → #0F766E` |
| Landscaping | `landscaping` | `#16A34A` green | `#14532D → #15803D` |
| HVAC | `hvac` | `#2563EB` blue | `#1E3A8A → #2563EB` |
| Real Estate | `realestate` | `#9333EA` purple | `#3B0764 → #7C3AED` |
| Remodeling | `remodeling` | `#CA8A04` amber | `#78350F → #B45309` |

To add a new industry: add a `[data-industry="slug"]` block to `css/industry-overrides.css`.

---

## File Structure

```
krevio-site/
├── css/
│   ├── krevio-tokens.css       ← All base tokens (bg, text, shadows, etc.)
│   └── industry-overrides.css  ← Per-industry accent + hero colors
├── demos/
│   ├── _template/
│   │   ├── index.html          ← THIS FILE — Tier 1 base skeleton
│   │   └── README.md           ← This guide
│   ├── plumbing/               ← Tier 3 reference implementation (all 9 tabs)
│   ├── landscaping/
│   ├── hvac/
│   └── realestate/
└── api/demos/
    └── chat.js                 ← Add system prompt entry here
```

---

## Tips

- **Plumbing demo = reference.** When you need to see how a Tier 2/3 component is implemented, look in `demos/plumbing/index.html`.
- **All placeholder strings are ALL_CAPS.** After filling in CONFIG and DATA, search for remaining ALL_CAPS strings to catch anything missed.
- **The `--btn-primary-color` in the hero** comes from `css/industry-overrides.css`. It should be the darkest shade of the industry gradient so white text has sufficient contrast.
- **localStorage keys** are unified: `krevio-theme` and `krevio-lang`. Theme persists across all demos.
- **Do NOT edit `css/krevio-tokens.css`** for industry-specific changes — that file is shared by all pages including the landing page.
