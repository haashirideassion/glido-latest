# Glido Dashboard Redesign — Grand Plan

> Scope: **Reception portal + Visitor portal dashboards only.** Onboarding flows and the kiosk are explicitly out of scope.
> Audience: freight-industry operators, many 45–55, fluent in CargoWise. They want **information density** (lots on one screen) *and* a **modern, good-looking** product. Those two goals are not in conflict — this plan resolves them.
> Method: I logged into both portals with the supplied credentials, walked every dashboard screen live (desktop 1440px + tablet 768px), and did a full source-code audit of the layout shell, list/detail patterns, spacing values, and animation/3D infrastructure.

---

## 1. The core diagnosis

The client's three complaints — *too much whitespace, too many clicks, not enough motion/personality* — are all real, and they share **one root cause and one big opportunity**:

- **Root cause of the "airy but empty" feel:** the dashboard is built from **big white cards with large internal padding, stacked vertically with large gaps**, holding very little data each. A booking card is ~135px tall to show 2 lines. A "Visitor Details" card on the detail page is ~90px tall to show *one* field. KPI tiles are ~120px tall to show a single number. The content is full-width (good — no giant side margins on reception), so **the whitespace is entirely internal**: padding, gaps, header height, oversized type. This is fixable with a systematic density pass, no redesign required.
- **Root cause of "too many clicks":** every list → detail is a **full-page navigation**. Open a booking and the list *vanishes*; to check the next one you hit Back, then click again. Reviewing 10 bookings = ~30 clicks and 10 context losses.
- **The big opportunity:** the Apple-Mail split view the client asked for is **already 80% built in the codebase and sitting unused.** More on this below — it's the single highest-leverage change.

### The audience principle that ties it together
CargoWise users don't fear density — they fear *hunting*. The modern move isn't to add more whitespace (Glido already over-did that); it's **more data per screen, laid out with clear hierarchy, and reachable in fewer clicks** — with motion used to explain *what changed* rather than to decorate. Every recommendation below is filtered through "does this help a 52-year-old ops lead see and act on more, faster?"

---

## 2. What I saw, screen by screen (the evidence)

| Screen | What's wrong today | Density today |
|---|---|---|
| **Reception Dashboard** | 4 giant KPI tiles, then huge "Today's Bookings" and "Recent Visitors" cards mostly empty, then a chart. One long vertical scroll. Floating sidebar leaves a large empty left column. | ~1 KPI number per 120px; must scroll for the day's shape |
| **Bookings list** | Card list. Each booking = ~135px card for 2 lines. Only ~4 visible at once. Rich 54-field records reduced to ~8 fields. | ~4 rows/screen (a table would show 20+) |
| **Booking detail** | **Full-page** — list is gone. "Visitor Details" card holds a single field; "Driver Details" holds two. Right rail (Charges/Timeline/Actions) is actually good and dense. | 1 record fills a full screen-height |
| **Visitors / Walk-ins** | Two KPI tiles each ~640px wide showing a single "0". Card list identical to Bookings. | ~4 rows/screen |
| **New Booking (reception)** | **7-step wizard** (Details → Service → Load → Slot → Details → Document → Payment). "How many slots?" gets its own full-height card for a number stepper. | 1 field-group per full screen |
| **Reports & Analytics** | The best page — real ECharts line/donut, trend deltas, breakdown bars. Still airy, but content-rich. | Good; prime target for animated chart draws |
| **Settings** | 4 top tabs; inside each, a long vertical scroll of big padded cards. ~1.5 sections per screen. Multiple independent "Save changes" buttons. | ~1.5 sections/screen |
| **Visitor "My Bookings"** | Worse than reception: content centered in a ~1120px column (big empty side margins), each card ~250px tall with a full-width "View Details" button. ~2 cards/screen. At **tablet** width, ~1.5 cards/screen. | ~2 rows/screen |

---

## 3. The infrastructure reality (why this is lower-risk than it looks)

The source audit turned up findings that make the ambitious parts cheap:

1. **A finished split-view pane already exists, unused.** `components/reception/BookingSlideOver.tsx` is a complete 480px right-hand detail+actions panel (check-in / complete / reschedule / cancel with confirm modals). It is imported **nowhere** — dead code. It is essentially the Apple-Mail detail pane, pre-built.
2. **The split-view pattern already ships in one page.** `VisitorLogPage` already does row-click → 480px slide-over with a `slideIn` keyframe. We have a proven in-repo pattern to copy.
3. **Dead plumbing for list-scoped panels exists.** `ReceptionLayout` exposes `setSidebarExtra` via Outlet context — no page consumes it. Free channel for split-view filters/detail.
4. **Lists already hold the full record objects in local state.** Adding a right pane needs only a `selectedId` — **no new API calls, no state-management migration.** Split view is genuinely low-risk.
5. **A complete, production-quality design-token system exists — and is dead.** `styles/globals.css` (488 lines: oklch palette, 6-step shadow scale, radius scale, a full keyframe library) is **never imported**. The live app uses only ~53 lines of `index.css` plus **inline `style={{}}` objects everywhere**. (Caveat: globals.css's `--primary` is teal, which clashes with the live tenant-themable orange `--brand-color` — must be reconciled, not blindly revived.)
6. **No animation or 3D libraries are installed at all.** No framer-motion/motion, no three/r3f, no Lottie. The rich `transitions.js` engine (FLIP, tilt-cards, counters) is imperative DOM quarantined to the marketing landing page — not reusable in React. So animation/3D is **greenfield** — a clean install, not a fight with legacy.
7. **Two bugs to fix in passing:** the dashboard forces `Red Hat Display` (`ReceptionLayout.tsx:163`) which is **never loaded** (silent fallback to system font); and `BookingKpiTiles` shows **hardcoded placeholder trend %** with a `TODO: wire real data`.

---

## 4. The plan — five workstreams

### Workstream A — Density pass (the "reduce whitespace" win) · *highest ROI, lowest risk*
A systematic tightening, driven by a **density token set** rather than ad-hoc edits, so it's consistent and reversible.

- Introduce spacing/size tokens in the live `@theme` (`index.css`) and a single `--density` multiplier. Targets, all from the audit:
  - Header height `72px → ~52px`
  - `main` padding `22px → 12–16px`
  - Card padding `20–24px → 12–16px`; card `marginBottom 16–20px → 8–10px`
  - KPI tile padding `22×26px → 14×18px`; KPI number `40px → 28–30px`
  - Section gaps `20px → 10–12px`
- **KPI tiles → a single compact metric strip.** Replace 4 tall cards with one horizontal band of inline metrics (icon · number · label · trend), reclaiming ~80px of vertical space and reading like an ops cockpit, not a marketing page.
- **Reception Dashboard reflow to a grid**, not a vertical stack: metric strip on top, then a 2-up region (Today's Bookings | Recent Visitors) side by side, with the day chart beside or below. Fills the empty left column left by the floating sidebar.
- **Offer a density toggle** ("Comfortable / Compact") persisted per user. This directly serves *both* audiences — the CargoWise crowd flips to Compact for max rows; anyone who wants air keeps Comfortable. Cheap given the `--density` var.

*Effort: ~2–4 days. No new deps. Immediately visible.*

### Workstream B — Split views + list→detail (the "reduce clicks" win) · *highest leverage*
Turn the master→detail full-page navigations into **persistent split views** (Apple Mail): compact list on the left, live detail on the right, selection driven by URL so deep links still work.

- **Bookings & Walk-ins:** convert card lists to **dense tables** (reclaim the 54 fields — reference, driver, rego, slot, service/load, ICS status, payment, totals) and add a docked right pane. Row click sets `selectedId` and renders the **already-built `BookingSlideOver`** — no new fetch. Reviewing 10 bookings goes from ~30 clicks to ~10, with zero context loss.
- **Settings:** replace long-scroll-within-tab with a **left section nav (group → section tree) + right form pane**, and consolidate the multiple per-section save buttons into one sticky save bar.
- **Tablet:** the split view is *especially* valuable here — today a tablet shows ~1.5 fat cards; a split view shows a full list + detail. Use a responsive rule: split view ≥ ~900px, stack/drawer below.
- **New Booking wizard:** collapse the 7 steps toward **3 denser steps** (or a single scannable form with inline slot-picking) for staff who do this repeatedly. Keep progressive disclosure for first-timers.
- Wire the dead `setSidebarExtra` outlet context for list filters so the split view's list column stays clean.

*Effort: ~1–2 weeks. Reuses `BookingSlideOver`, `VisitorLog` slide-over pattern, existing data. Low risk.*

### Workstream C — Motion & delight · *the "more animation" win*
Install **`motion`** (the React-first successor to framer-motion; works with this React 18 app) and apply it with restraint tuned to the audience.

- **Functional motion first (explains change):** `AnimatePresence` for the split-view detail swap; layout animations for the sidebar (replacing the hand-tuned CSS); staggered row entrance on tables/KPIs; animated number count-ups on KPIs; shared-layout transition from list row → detail pane header.
- **Chart draw-ins** on the Analytics page (ECharts already there) — line grows, donut sweeps, bars fill.
- **Status transitions:** when a booking flips to Checked-In/Completed, animate the row's status pill + a subtle color wash so the operator *sees* what changed in a live-polling table.
- **Delight, sparingly:** a small success flourish on check-in/complete; skeleton shimmers on load.
- **Guardrails for the demographic:** short durations, calm easing (reuse the existing house `cubic-bezier(0.16,1,0.3,1)` spring), and honor `prefers-reduced-motion`. Motion should never delay an action.

*Effort: ~3–5 days for the core set, incremental after.*

### Workstream D — 3D illustration · *the "more 3D" win*
All greenfield, so pick by payoff-per-KB. Recommended blend:

- **Lottie (`lottie-react`) + animated SVG for functional delight** — lightweight, on-brand with the existing flat PNG illustration set: empty states ("No bookings today" → a gentle looping depot/container animation instead of a static icon), check-in success, loading. This is where 3D-ish life pays off daily.
- **One `@splinetool/react-spline` hero** for a signature moment — the reception Dashboard empty/hero state or the login — a real 3D container/truck/depot. Gate it to idle/empty states only (it's heavy) so it never slows a data view.
- Avoid full react-three-fiber unless we later want *data-driven* 3D (e.g. a 3D yard/bay map) — that's a separate, larger project.

*Effort: ~2–3 days for Lottie empty-states + one Spline hero.*

### Workstream E — Foundational cleanup (do first / alongside A)
Decisions that prevent the redesign from adding to the mess:

- **Pick the styling paradigm.** Recommended: **revive `globals.css`'s token system** (shadows, radii, spacing, keyframes) merged into `index.css`, keep the **runtime-themable orange `--brand-color`** as the primary (drop globals' teal), and migrate the touched dashboard surfaces from inline styles to tokens/utilities as we redesign them — not a big-bang rewrite, but no *new* untokenized inline styles.
- **Fix the font** (load Red Hat Display, or standardize on Inter — currently silently falling back).
- **Wire the real KPI trend data** (remove the hardcoded placeholder %).
- **Delete confirmed dead/legacy code** as we touch it: `SettingsView.tsx` (legacy Alpine duplicate), unused `ReportsView.tsx`/`VisitorLogView.tsx` copies.

---

## 5. Suggested sequencing

1. **Phase 0 — Foundations (parallel with Phase 1):** styling-paradigm decision, density tokens + `--density` var, font fix, revive/merge `globals.css` tokens. *Unblocks everything.*
2. **Phase 1 — Density pass (Workstream A):** metric strip, dashboard grid reflow, tightened cards, density toggle. *Ships a visible win in days.*
3. **Phase 2 — Split views (Workstream B):** Bookings/Walk-ins tables + `BookingSlideOver` right pane; then Settings master-detail; then New Booking condensation. *The click-count win.*
4. **Phase 3 — Motion (Workstream C):** install `motion`, wire detail-pane transitions, KPI count-ups, chart draws, status animations.
5. **Phase 4 — 3D/illustration (Workstream D):** Lottie empty-states, one Spline hero.

Each phase is independently shippable and independently valuable — we don't need to finish everything to demo progress to the client.

---

## 6. Principles to hold the line on (for this audience)

- **Density is a feature, not a compromise** — default to more-per-screen; let users opt *up* to whitespace, not down from it.
- **Never lose the list** — detail always appears beside context, never replacing it, on desktop/tablet.
- **Motion explains, it doesn't perform** — every animation should answer "what changed / where did this come from," and must respect reduced-motion.
- **3D is a garnish on idle surfaces** — heroes and empty states, never in the middle of a data-dense operating view.
- **One record, many fields, few clicks** — surface the 54 fields we already fetch; stop hiding them behind navigations.

---

*Appendix — key files:* `src/layouts/ReceptionLayout.tsx` (shell + inline motion), `src/components/reception/BookingSlideOver.tsx` (ready-made split pane), `src/components/reception/KpiTiles.tsx` + `BookingTable.tsx` (density targets), `src/pages/reception/SettingsPage.tsx` (master-detail target), `src/pages/reception/BookingsPage.tsx` / `WalkInsPage.tsx` (list→split targets), `src/pages/MyBookingsPage.tsx` (visitor list), `styles/globals.css` (dormant token system), `src/index.css` (live tokens), `vite.config.ts` (Tailwind v4 entry).
