# Krevio Demos — Design System
**Last updated:** 2026-04-07
**Canonical source:** This document. The plumbing demo (`demos/plumbing/index.html`) is the reference implementation.

---

## 1. Theme Tokens

All colors use CSS custom properties on `[data-theme="light"]` and `[data-theme="dark"]`. Zero hardcoded hex in component code.

### Backgrounds
| Token | Light | Dark | Usage |
|-------|-------|------|-------|
| `--bg` | `#FAFAFA` | `#09090B` | Page background |
| `--bg1` | `#FFFFFF` | `#0F0F12` | Card/surface background |
| `--bg2` | `#F4F4F5` | `#17171C` | Hover/input background |
| `--bg3` | `#E4E4E7` | `#1E1E26` | Disabled/track background |

### Text
| Token | Light | Dark | Usage |
|-------|-------|------|-------|
| `--t0` | `#18181B` | `#F4F4F5` | Primary text, headings |
| `--t1` | `#3F3F46` | `#D4D4D8` | Secondary text |
| `--t2` | `#71717A` | `#A1A1AA` | Muted text, labels |
| `--t3` | `#D4D4D8` | `#3F3F46` | Disabled text, decorative |

### Borders
| Token | Light | Dark | Usage |
|-------|-------|------|-------|
| `--border` | `rgba(0,0,0,0.06)` | `rgba(255,255,255,0.06)` | Default border |
| `--borderH` | `rgba(0,0,0,0.12)` | `rgba(255,255,255,0.13)` | Hover border |
| `--overlay` | `rgba(0,0,0,0.4)` | `rgba(0,0,0,0.5)` | Modal/sidebar overlay |

### Accent
| Token | Light | Dark | Usage |
|-------|-------|------|-------|
| `--accent` | `#0891B2` (cyan-600) | `#22D3EE` (cyan-400) | Primary accent, links, active states |
| `--accentS` | `rgba(8,145,178,0.06)` | `rgba(34,211,238,0.08)` | Subtle accent background |
| `--accentB` | `rgba(8,145,178,0.14)` | `rgba(34,211,238,0.18)` | Accent border |

### Status Colors (S = Subtle bg, B = Border)
| Color | Token | Light | Dark |
|-------|-------|-------|------|
| Red | `--red` | `#DC2626` | `#F87171` |
| | `--redS` | `rgba(220,38,38,0.06)` | `rgba(248,113,113,0.08)` |
| | `--redB` | `rgba(220,38,38,0.14)` | `rgba(248,113,113,0.18)` |
| Amber | `--amber` | `#CA8A04` | `#EAB308` |
| | `--amberS` | `rgba(202,138,4,0.06)` | `rgba(234,179,8,0.08)` |
| | `--amberB` | `rgba(202,138,4,0.14)` | `rgba(234,179,8,0.18)` |
| Green | `--green` | `#16A34A` | `#22C55E` |
| | `--greenS` | `rgba(22,163,74,0.06)` | `rgba(34,197,94,0.08)` |
| | `--greenB` | `rgba(22,163,74,0.14)` | `rgba(34,197,94,0.18)` |
| Blue | `--blue` | `#2563EB` | `#3B82F6` |
| | `--blueS` | `rgba(37,99,235,0.06)` | `rgba(59,130,246,0.08)` |
| | `--blueB` | `rgba(37,99,235,0.14)` | `rgba(59,130,246,0.18)` |

### Shadows
| Token | Light | Dark |
|-------|-------|------|
| `--shadow-sm` | `0 1px 2px rgba(0,0,0,0.04)` | `0 1px 2px rgba(0,0,0,0.2)` |
| `--shadow-md` | `0 4px 12px rgba(0,0,0,0.06)` | `0 4px 12px rgba(0,0,0,0.3)` |
| `--shadow-lg` | `0 12px 32px rgba(0,0,0,0.08)` | `0 12px 32px rgba(0,0,0,0.4)` |

### Hero (dark gradient sections)
| Token | Usage |
|-------|-------|
| `--hero-bg` | Section gradient background |
| `--hero-card` | Card overlay on hero |
| `--hero-border` | Card border on hero |
| `--hero-text` | `#FFFFFF` — all text on hero |
| `--hero-text-muted` | `rgba(255,255,255,0.65)` — secondary text on hero |
| `--star-color` | `#FCD34D` — star ratings |

### Sidebar
| Token | Light | Dark |
|-------|-------|------|
| `--sidebar-active` | `#0891B2` | `#22D3EE` |
| `--sidebar-active-text` | `#FFFFFF` | `#09090B` |

---

## 2. Typography

### Fonts
- **Body/Headings:** `'DM Sans', system-ui, sans-serif`
- **Display/Logo:** `'DM Serif Display', serif`

### Font Size Scale (8 steps)
| Step | Size | Usage |
|------|------|-------|
| `--text-xs` | `11px` | Labels, badges, table headers, captions |
| `--text-sm` | `12px` | Secondary UI, descriptions, mobile body |
| `--text-base` | `13px` | Default UI text, table cells, card body |
| `--text-md` | `14px` | Card titles, button text, form labels |
| `--text-lg` | `16px` | Nav items, stat values |
| `--text-xl` | `22px` | Large stat values |
| `--text-2xl` | `clamp(1.3rem, 3vw, 1.6rem)` | Section/page headings |
| `--text-3xl` | `clamp(1.7rem, 5vw, 3.4rem)` | Hero heading |

### Font Weights
- `400` — Body text
- `500` — UI text, nav items
- `600` — Labels, button text, emphasis
- `700` — Headings, bold values, badges

---

## 3. Spacing

### Base Values
| Token | Value | Usage |
|-------|-------|-------|
| `--space-xs` | `4px` | Tight gaps, badge padding vertical |
| `--space-sm` | `8px` | Small gaps, compact padding |
| `--space-md` | `12px` | Default component gap |
| `--space-lg` | `16px` | Section padding, card padding compact |
| `--space-xl` | `20px` | Card padding standard |
| `--space-2xl` | `24px` | Section padding, generous spacing |
| `--space-3xl` | `40px` | Section vertical padding |

---

## 4. Border Radius Tiers

| Tier | Value | Usage |
|------|-------|-------|
| `--radius-sm` | `4px` | Badges (20px pill variant), scrollbar |
| `--radius-md` | `8px` | Buttons, inputs, nav items, pipeline cards |
| `--radius-lg` | `12px` | Stat cards, small component cards |
| `--radius-xl` | `14px` | Dashboard content cards |
| `--radius-2xl` | `16px` | Customer-view cards (services, gallery, reviews) |
| `--radius-full` | `99px` | Status pills, filter pills |
| `--radius-round` | `50%` | Avatars, dots |

---

## 5. Z-Index Scale

| Layer | Value | Usage |
|-------|-------|-------|
| Content | `0` | Default |
| Sticky | `100` | Sticky headers (if any) |
| Sidebar overlay | `199` | Background overlay |
| Sidebar / Demo bar | `200` | Fixed navigation |
| Hamburger | `201` | Above sidebar |
| Chat | `300` | Chat bubble + window |
| Toast | `400` | Notifications |

---

## 6. Component Patterns

### Card
Base: `background: var(--bg1); border-radius: var(--radius-xl); box-shadow: var(--shadow-sm);`

| Variant | Radius | Padding | Extra |
|---------|--------|---------|-------|
| `.card-cv` (customer view) | 16px | 24px | — |
| `.card-dashboard` | 14px | 22px 24px | — |
| `.card-stat` | 12px | 14px | `border: 1px solid var(--border)` |
| `.card-nested` | 8px | 12px | — |
| `.card-highlight` | 14px | 22px 24px | `background: var(--accentS); border: 1px solid var(--accentB)` |

### Badge / Status Pill
Base: `.badge { font-size: 11px; font-weight: 600; padding: 3px 10px; border-radius: 99px; display: inline-flex; align-items: center; }`

| Variant | Background | Color |
|---------|-----------|-------|
| `.badge--accent` | `var(--accentS)` | `var(--accent)` |
| `.badge--green` | `var(--greenS)` | `var(--green)` |
| `.badge--amber` | `var(--amberS)` | `var(--amber)` |
| `.badge--red` | `var(--redS)` | `var(--red)` |
| `.badge--muted` | `var(--bg2)` | `var(--t2)` |

### Data Table
Base: `.data-table { width: 100%; border-collapse: collapse; font-size: 13px; }`
- `th`: `padding: 10px 12px; font-size: 11px; text-transform: uppercase; color: var(--t2); border-bottom: 1px solid var(--border);`
- `td`: `padding: 10px 12px; border-bottom: 1px solid var(--border);`
- On mobile: wrap in `.scroll-x { overflow-x: auto; -webkit-overflow-scrolling: touch; }` and set `min-width` on table.

### Button
| Variant | Usage | Style |
|---------|-------|-------|
| `.btn-primary` | Hero CTA | `background: white; color: #134E4A` (hero-specific) |
| `.btn-accent` | Primary actions | `background: var(--accent); color: var(--bg); border-radius: 8px;` |
| `.btn-accent-outline` | Secondary actions | `background: var(--accentS); color: var(--accent); border: 1px solid var(--accentB);` |
| `.btn-ghost` | Tertiary | `background: var(--bg2); border: 1px solid var(--border); color: var(--t1);` |

### Filter Bar
`.filter-bar { display: flex; flex-wrap: wrap; gap: 10px; align-items: center; }`
- Contains `.filter-search-wrap`, `.filter-select`, `.filter-pill`
- On ≤600px: search takes full width, selects split 50/50, pills stay inline

### Empty State
`.empty-state { text-align: center; padding: 24px; color: var(--t2); font-size: 13px; }`

---

## 7. Responsive Breakpoints

| Breakpoint | Target | Approach |
|-----------|--------|----------|
| `≤ 900px` | Tablet | Sidebar → drawer, grids → 2-col, hide non-essential demo bar items |
| `≤ 600px` | Phone (430px viewport) | Single-col layouts, compact padding, horizontal scroll for tables/kanban |
| `≤ 375px` | Small phone (iPhone SE) | Minimal padding, smaller type |

### Rules
- **Mobile-first is non-negotiable.** Every screen must work at 375px.
- **Touch targets minimum 44x44px** on all interactive elements.
- **Minimum font size: 11px** on mobile. No 10px text.
- **No horizontal overflow** except intentional scroll areas (kanban, wide tables) which must have `.scroll-x` wrapper.
- **Tables on mobile:** Hide secondary columns with `.hide-mobile`. Wrap table in `.scroll-x` if still too wide.
- **Stat grids on mobile:** All variants collapse to `repeat(2, 1fr)` at ≤600px.
- **Filter bars on mobile:** Search full-width first row, selects below at 50% each.

---

## 8. Accessibility Requirements

- **Form validation:** All required fields must have `required` attribute. Use `type="tel"` for phone, `type="email"` for email.
- **Interactive elements:** Must be `<button>` or `<a>`, never `<div onclick>`. If semantic element isn't possible, add `tabindex="0"` + `role="button"` + `onkeydown` handler.
- **ARIA:** Dashboard tabs use `role="tablist"` / `role="tab"` / `role="tabpanel"`. Expandable sections use `aria-expanded`. Active nav uses `aria-current="page"`.
- **Focus indicators:** `:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }` — never suppress without replacement.
- **Color contrast:** All text must meet WCAG AA (4.5:1 for text < 18px, 3:1 for large text). Status badges at 11px must have sufficient contrast against their subtle backgrounds.
- **Phone numbers:** Always `<a href="tel:...">`. Email always `<a href="mailto:...">`.

---

## 9. Naming Convention

- Tokens use terse names: `--bg`, `--t0`, `--accentS` (not `--background-0`, `--text-color-primary`)
- Status suffixes: `S` = subtle/surface background, `B` = border variant
- CSS classes use kebab-case: `.metric-card`, `.dispatch-stat`, `.filter-pill`
- Modifier classes: `.active`, `.expanded`, `.show`, `.hidden`
- Mobile-hide: `.hide-mobile` (applied to table columns)
- View toggle: `.customer-view.active`, `.owner-view.active`
