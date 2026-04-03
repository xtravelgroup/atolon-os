# Atolon OS — Development Rules

## Stack
- React 18 + Vite SPA
- Supabase (PostgreSQL + Auth + Storage + Edge Functions)
- Inline CSS-in-JS (no Tailwind, no styled-components)
- Brand tokens in `src/brand.js` → `B` object
- Node path: `/usr/local/bin/node`
- Build: `cd /Users/erickern/Desktop/atolon-os && PATH="/usr/local/bin:$PATH" /usr/local/bin/node node_modules/.bin/vite build`

---

## ⚠️ MANDATORY: Responsive Design System

**Every component, screen, module, and feature — existing or new — MUST be fully responsive.**

This is a permanent architectural rule, not optional.

### Breakpoints (from `src/lib/responsive.js`)

| Name | Width | Devices |
|------|-------|---------|
| xs | < 375px | Small phones |
| sm | < 480px | Large phones |
| **md (mobile)** | **< 768px** | **All phones** |
| tablet | 768–1023px | Tablets |
| **desktop** | **≥ 1024px** | **Laptops+** |
| xl | ≥ 1280px | Large screens |

### Imports

```js
// For breakpoint detection:
import { useBreakpoint } from "../lib/responsive.js";
const { isMobile, isTablet, isDesktop, width } = useBreakpoint();

// For legacy components (boolean only):
import { useMobile } from "../lib/useMobile";
const isMobile = useMobile();

// Layout utilities:
import {
  pagePadding, cardPadding, container,
  responsiveGrid, flexRow, inputStyle,
  btnPrimary, btnSecondary,
  modalOverlay, modalBox,
  tableWrapper, sectionCard,
  labelStyle, imgResponsive, noOverflow,
  S, T, TOUCH_TARGET
} from "../lib/responsive.js";
```

### Rules — apply to every new component

1. **Mobile-first**: write mobile styles first, enhance for larger screens
2. **No fixed widths on containers** — use `width: "100%"`, `maxWidth`, or `minWidth` with flex
3. **No `height: Npx` on scrollable content** — use `minHeight` or let content flow
4. **Tables**: wrap in `tableWrapper` for horizontal scroll on mobile, or render as cards
5. **Modals**: use `modalOverlay` + `modalBox({isMobile})` — full-screen on phone
6. **Buttons**: minimum `minHeight: 44px` (TOUCH_TARGET) for tap comfort
7. **Forms**: vertical stack on mobile (`flexDirection: "column"`), grid on desktop
8. **Images**: always `maxWidth: "100%", height: "auto"`
9. **Grids**: use `responsiveGrid()` or `auto-fill minmax()` — never fixed column counts
10. **Padding**: use `pagePadding({isMobile})` for page areas, `cardPadding({isMobile})` for cards
11. **No horizontal overflow**: every container gets `overflowX: "hidden"` or explicit scroll
12. **Typography**: use T scale (T.xs=11 → T.h1=28), never hardcode font-sizes without breakpoint check
13. **Spacing**: use S scale (S.sm=8 → S.section=40), scale down 75% on mobile

### Patterns

```jsx
// ✅ Correct — responsive card grid
<div style={responsiveGrid({ cols: 3, minWidth: 240, gap: 16 })}>
  {items.map(i => <Card key={i.id} />)}
</div>

// ✅ Correct — stacking form
<div style={flexRow({ isMobile, gap: 12 })}>
  <input /> <input />
</div>

// ✅ Correct — modal
<div style={modalOverlay}>
  <div style={modalBox({ isMobile, maxWidth: 500 })}>...</div>
</div>

// ✅ Correct — table with mobile fallback
{isMobile
  ? rows.map(r => <MobileCard key={r.id} row={r} />)
  : <div style={tableWrapper}><table>...</table></div>
}

// ❌ Wrong — hardcoded width
<div style={{ width: 800 }}>

// ❌ Wrong — fixed height blocking scroll
<div style={{ height: 400, overflow: "hidden" }}>

// ❌ Wrong — no mobile check on grid
<div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr" }}>
```

### AtolanOS Layout
- Sidebar: fixed overlay on mobile (240px), collapsible on desktop (64/224px)
- Mobile: hamburger (☰) in top bar opens sidebar
- Content: `pagePadding({isMobile})` applied by AtolanOS wrapper
- Desktop max-width: no cap — fills available space

---

## Code Style
- Inline CSS-in-JS everywhere (no CSS files)
- All colors from `B` object in brand.js
- `logAccion()` for all user actions (audit log)
- Fire-and-forget: never `await logAccion()`
- SQL runner: `node supabase/run-sql.mjs <file>`
- Edge functions: Deno, deploy via Supabase Dashboard

## Git
- Push to GitHub → Vercel auto-deploys
- Primary domain: `www.atolon.co`
