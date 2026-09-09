# Glido Frontend — Architecture Migration Report (Revised)
**Prepared for:** Backend Developer  
**Date:** June 2026  
**Revision:** v3 — file count reconciled, realtime locked to polling, password migration owner added

---

## 0. Scope Clarification

**The goal is architectural parity, not tooling parity.**

We are adopting SRD-FleetSense's structure and data-flow discipline. We are not copying its tools, routes, or business logic.

| Adopt from SRD | Keep as Glido's own |
|---|---|
| Separated frontend + Express/pg backend layout | All features (kiosk, wizard, reception, walk-ins, bookings) |
| JWT Bearer auth flow (`jsonwebtoken` + `bcryptjs`) | All UI — pages, components, styling, UX |
| Request pipeline: `apiClient` → `fetcher` → `{success, data, error}` envelope | All business logic and domain |
| Layering discipline: components → hooks → API → pg → Postgres | The Postgres database (point pg at the existing Supabase DB) |

**Explicitly excluded:** SRD's actual routes — consignments, trip-sheets, zones, nodes, incoming-trucks, Freight Tiger sync, cron jobs. These are SRD's domain and must not be ported. They serve as a reference for shape, not content.

**Framework difference:** SRD's frontend is **Next.js**. Glido stays **Vite + React**. We adopt SRD's backend and its client data-flow pattern, not its frontend framework. SRD's `next.config.mjs` proxy is not replicated.

---

## 1. Current State — Glido Frontend

Glido is a **Vite + React SPA**. It communicates with the database exclusively through the Supabase JS client. There is no custom backend — Supabase acts as both the auth provider and the database API.

**Tech stack today:**
- Framework: Vite + React + React Router v6
- Auth: Supabase Auth (`supabase.auth.getSession`, `onAuthStateChange`)
- Database: Direct Supabase PostgREST calls (`supabase.from('table').select(...)`)
- Storage: `supabase.storage` for file uploads
- Realtime: `supabase.channel()` for live data subscriptions
- HTTP abstraction: None — all calls go through the `supabase` client
- State management: React Context only

**Supabase footprint — 36 files in scope:**

The original report assumed Supabase was contained in `lib/db/*` (6 modules) and that UI was a stable consumer. This was verified as inaccurate. Direct `supabase.from` / `auth` / `storage` / `channel` calls live inside UI components and pages, not only in `lib/db/`.

Note: the grep returns 37 matches — the 37th is `src/public/alpine-init.js`, a standalone Alpine.js script that is out of scope for the React migration and excluded from the table below.

| Category | Files | Count |
|---|---|---|
| DB abstraction layer | `lib/db/bookings.ts`, `lib/db/slots.ts`, `lib/db/walk-ins.ts`, `lib/db/tenants.ts`, `lib/db/checkin-records.ts`, `lib/db/cfs-shipments.ts` | 6 |
| Auth contexts | `contexts/AuthContext.tsx`, `contexts/ReceptionAuthContext.tsx`, `contexts/KioskContext.tsx`, `contexts/WizardContext.tsx` | 4 |
| Auth/lib helpers | `lib/supabase.ts`, `lib/auth.ts`, `lib/useTenantInfo.ts` | 3 |
| Login / auth pages | `pages/StaffLoginPage.tsx`, `pages/VisitorLoginPage.tsx`, `pages/ForgotPasswordPage.tsx` | 3 |
| Reception pages (inline DB calls) | `pages/reception/BookingsPage.tsx`, `pages/reception/DashboardPage.tsx`, `pages/reception/BookingDetailPage.tsx`, `pages/reception/VisitorDetailPage.tsx`, `pages/reception/SettingsPage.tsx`, `pages/reception/WalkInsPage.tsx`, `pages/reception/VisitorLogPage.tsx`, `pages/reception/ReportsConfigPage.tsx` | 8 |
| Portal wizard components (inline DB + storage) | `components/portal/Step1ServiceType.tsx`, `components/portal/Step4ShipmentDetails.tsx`, `components/portal/Step5Documents.tsx`, `components/portal/Step6ContactVehicle.tsx`, `components/portal/Step7Confirmation.tsx` | 5 |
| Layouts / guards (inline DB + realtime) | `layouts/ReceptionLayout.tsx`, `layouts/PublicLayout.tsx`, `components/ReceptionGuard.tsx` | 3 |
| Other pages / components | `pages/KioskPage.tsx`, `pages/LandingPage.tsx`, `pages/ProfilePage.tsx`, `components/kiosk/WelcomeScreen.tsx` | 4 |
| **Total (in scope)** | | **36** |

**Consequence:** The "UI untouched / swap hooks only" assumption does not hold. Migrating these requires editing UI files to first lift inline Supabase calls into custom hooks, then swap the hook internals. This is a per-component refactor, not a mechanical repetition.

---

## 2. Target Architecture

Glido's frontend will remain **Vite + React**. The backend will be a new **Express + PostgreSQL** service. The frontend never calls the database directly — all data access goes through the Express API over JWT Bearer auth.

**Target tech stack:**
- Auth: Custom JWT (`jsonwebtoken` + `bcryptjs`), token stored in `localStorage`
- HTTP layer: Centralised `apiClient()` — attaches `Authorization: Bearer <token>`, handles 401 redirect, deduplicates GET requests
- Fetcher wrappers: `fetcher`, `postFetcher`, `putFetcher`, `patchFetcher`, `deleteFetcher`
- State: Zustand (derived/shared state), React Query (server cache), Context (UI-only state)
- Dev routing: Vite `server.proxy` in development; CORS configured on Express for production

**Key principle:** The browser never holds database credentials. The JWT token is the only credential the frontend manages. Auth is Bearer-only — no cookies anywhere in the flow.

**Request pipeline:**
```
Component → Custom Hook → fetcher/apiClient → Express → Postgres
```

---

## 3. Gap Analysis — What Must Change on the Frontend

### 3.1 New Files to Create

#### `src/lib/api-client.ts`
The single HTTP entry point. Responsibilities:
- Reads JWT from `localStorage` (key: `glido_auth_token`)
- Attaches `Authorization: Bearer <token>` to every request
- Calls Express directly (CORS) — no proxy needed in production
- Deduplicates concurrent GET requests via an in-flight Map
- On 401: clears token, redirects to `/login`
- On 5xx: shows toast error
- On network failure: shows connection error toast

#### `src/lib/fetcher.ts`
Convenience wrappers around `apiClient`:
- `fetcher(url, options?)` — GET
- `postFetcher(url, body)` — POST
- `putFetcher(url, body)` — PUT
- `patchFetcher(url, body)` — PATCH
- `deleteFetcher(url)` — DELETE
- `rawFetcher(url, options?)` — for blob/file responses

#### `src/lib/jwt.ts`
Client-side JWT helpers (decode only — no signing, that's the backend's job):
- `decodeJwtPayload(token)` — decodes payload without verifying signature, for instant UI restore on reload
- `setToken(token | null)` — stores/removes token from `localStorage`
- `getToken()` — retrieves token from `localStorage`

---

### 3.2 Auth Layer — Rewrite (3 files)

#### `src/contexts/AuthContext.tsx` — Full rewrite
Remove all Supabase Auth dependency. The new version must:
1. On mount, read JWT from `localStorage` and decode it locally (no network) to instantly restore the session
2. Validate the `exp` claim — clear the token without a network call if expired
3. In the background, call `GET /api/v2/auth/me` to verify server-side (catches revocations)
4. Only redirect to `/login` on a definitive 401 — never on network errors or 5xx
5. Expose: `user`, `isAuthenticated`, `isLoading`, `login(email, password)`, `logout()`
6. `login()` calls `POST /api/v2/auth/login`, stores the returned JWT, sets user state
7. `logout()` clears the token from `localStorage` and redirects to `/login`

**Remove:** `src/contexts/ReceptionAuthContext.tsx` — consolidate into the single `AuthContext`. Role checking reads `user.role` from the JWT.

#### `src/pages/StaffLoginPage.tsx` — Edit
Replace `supabase.auth.signInWithPassword(...)` with `login(email, password)` from `useAuth()`.

#### `src/pages/VisitorLoginPage.tsx` — Edit
Same as above.

#### `src/pages/ForgotPasswordPage.tsx` — Edit
Replace `supabase.auth.resetPasswordForEmail(...)` with `POST /api/v2/auth/forgot-password`. Note: this is blocked by the password migration work item below.

---

### 3.3 DB Abstraction Layer — Mechanical Swap (6 files)

All files in `src/lib/db/` call Supabase directly. Each function is rewritten to call the corresponding Express endpoint via `fetcher`. Function signatures stay identical — only the implementation changes.

#### `src/lib/db/bookings.ts`

| Current | Replacement |
|---|---|
| `getBookings()` | `GET /api/v2/bookings` |
| `getBookingsByDateRange(from, to)` | `GET /api/v2/bookings?from=&to=` |
| `getBookingById(id)` | `GET /api/v2/bookings/:id` |
| `getBookingByRef(ref)` | `GET /api/v2/bookings?ref=` |
| `getBookingByRego(rego)` | `GET /api/v2/bookings?rego=&status=scheduled` |
| `findBooking(idOrRef)` | `GET /api/v2/bookings/find?q=` |
| `getTodayBookings()` | `GET /api/v2/bookings?date=today` |
| `getBookingsByDate(date)` | `GET /api/v2/bookings?date=` |
| `getDashboardStats()` | `GET /api/v2/dashboard` |
| `checkInBooking(id)` | `PATCH /api/v2/bookings/:id/checkin` |
| `completeBooking(id, notes?)` | `PATCH /api/v2/bookings/:id/complete` |
| `getBookingsByUserId(userId)` | `GET /api/v2/bookings?userId=` |
| `rescheduleBooking(id, date, start, end)` | `PATCH /api/v2/bookings/:id/reschedule` |
| `cancelBooking(id)` | `PATCH /api/v2/bookings/:id/cancel` |
| `createBooking(input)` | `POST /api/v2/bookings` |
| `getBookingsByGroupRef(groupRef)` | `GET /api/v2/bookings?groupRef=` |

#### `src/lib/db/slots.ts`

| Current | Replacement |
|---|---|
| `getSlots(date)` | `GET /api/v2/slots?date=` |
| `getSlotsByDateRange(from, to)` | `GET /api/v2/slots?from=&to=` |
| `getSlotBusyness(date)` | `GET /api/v2/slots/busyness?date=` |

#### `src/lib/db/walk-ins.ts`

| Current | Replacement |
|---|---|
| `getWalkIns()` | `GET /api/v2/walk-ins` |
| `createWalkIn(input)` | `POST /api/v2/walk-ins` |
| `updateWalkIn(id, updates)` | `PATCH /api/v2/walk-ins/:id` |

#### `src/lib/db/tenants.ts`

| Current | Replacement |
|---|---|
| `getTenant(id)` | `GET /api/v2/tenants/:id` |
| `updateTenant(id, updates)` | `PATCH /api/v2/tenants/:id` |

#### `src/lib/db/checkin-records.ts`

| Current | Replacement |
|---|---|
| `getCheckinRecords(bookingId)` | `GET /api/v2/checkin-records?bookingId=` |
| `createCheckinRecord(input)` | `POST /api/v2/checkin-records` |

#### `src/lib/db/cfs-shipments.ts`

| Current | Replacement |
|---|---|
| `getShipments()` | `GET /api/v2/shipments` |
| `getShipmentByBill(billNumber)` | `GET /api/v2/shipments?billNumber=` |

---

### 3.4 UI Component Refactors — Per-Component (21 files)

These files have inline `supabase.from` / `auth` / `storage` / `channel` calls embedded directly in component logic. Each requires a two-step refactor: (1) lift the inline Supabase call into a custom hook, (2) swap the hook's internals to use `fetcher`. The visual UI is preserved throughout — only the data layer changes.

| File | Inline calls to lift |
|---|---|
| `pages/reception/BookingsPage.tsx` | `supabase.from(...)` + realtime `.channel()` |
| `pages/reception/DashboardPage.tsx` | `supabase.from(...)` + realtime `.channel()` |
| `pages/reception/BookingDetailPage.tsx` | `supabase.from(...)` × 4 + `supabase.storage` |
| `pages/reception/VisitorDetailPage.tsx` | `supabase.from(...)` + `supabase.storage` |
| `pages/reception/SettingsPage.tsx` | `supabase.from(...)` + `supabase.storage` + auth inline |
| `pages/reception/WalkInsPage.tsx` | `supabase.from(...)` + realtime `.channel()` |
| `pages/reception/VisitorLogPage.tsx` | `supabase.from(...)` |
| `pages/reception/ReportsConfigPage.tsx` | `supabase.from(...)` |
| `components/portal/Step1ServiceType.tsx` | `supabase.from(...)` |
| `components/portal/Step4ShipmentDetails.tsx` | `supabase.from(...)` |
| `components/portal/Step5Documents.tsx` | `supabase.storage` |
| `components/portal/Step6ContactVehicle.tsx` | `supabase.from(...)` + `supabase.storage` |
| `components/portal/Step7Confirmation.tsx` | `supabase.from(...)` |
| `layouts/ReceptionLayout.tsx` | `supabase.from(...)` + realtime `.channel()` |
| `layouts/PublicLayout.tsx` | `supabase.auth` inline |
| `components/ReceptionGuard.tsx` | `supabase.auth` inline |
| `contexts/KioskContext.tsx` | `supabase.from(...)` |
| `contexts/WizardContext.tsx` | `supabase.from(...)` |
| `pages/KioskPage.tsx` | `supabase.from(...)` |
| `pages/LandingPage.tsx` | `supabase.from(...)` |
| `pages/ProfilePage.tsx` | `supabase.from(...)` + `supabase.auth` |

---

### 3.5 Vite Dev Config — `vite.config.ts`

In development, add a proxy entry so `/api` calls reach the local Express server:

```ts
server: {
  proxy: {
    '/api': {
      target: 'http://localhost:5000',
      changeOrigin: true,
    }
  }
}
```

In production, Express must have CORS configured to allow requests from the Glido frontend origin. There is no server-side proxy — this is Bearer-only auth, so CORS is the correct pattern.

---

### 3.6 Remove Supabase

Once all 36 files are migrated:
- Delete `src/lib/supabase.ts`
- Remove `@supabase/supabase-js` from `package.json`
- Remove `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` from all environment files

Note: `components/kiosk/WelcomeScreen.tsx` imports only the `DEFAULT_TENANT_ID` constant from `supabase.ts` — no DB calls. When `supabase.ts` is deleted, move this constant to a shared `src/lib/constants.ts` file and update the import. This is a one-line fix, not a component refactor.

---

## 4. Dedicated Work Items

These three items are launch-relevant and require their own planning. They are not covered by the standard migration sweep above.

### Work Item A — Storage Uploads

Glido currently uses `supabase.storage` for file uploads in 4 components. Each needs a backend upload/signed-URL endpoint and a client-side rewrite.

| File | Current usage |
|---|---|
| `pages/reception/BookingDetailPage.tsx` | Document uploads against a booking |
| `pages/reception/SettingsPage.tsx` | Logo / branding asset uploads |
| `pages/reception/VisitorDetailPage.tsx` | Visitor document uploads |
| `components/portal/Step6ContactVehicle.tsx` | Vehicle document uploads in booking wizard |

**Backend must expose:**
- `POST /api/v2/uploads` — accepts multipart/form-data, stores file, returns URL
- `GET /api/v2/uploads/signed-url?key=` — returns a time-limited signed URL for retrieval

**Frontend rewrite:** Replace each `supabase.storage.from(...).upload(...)` call with a `rawFetcher` POST to the upload endpoint.

---

### Work Item B — Realtime Subscriptions

Glido uses `supabase.channel()` for live data in 4 places. SRD has no realtime equivalent. **Decision locked: polling for launch. WebSockets deferred post-launch.**

| File | What it subscribes to | Polling replacement |
|---|---|---|
| `pages/reception/BookingsPage.tsx` | Booking status changes | `setInterval` → `GET /api/v2/bookings?date=today` every 15s |
| `pages/reception/WalkInsPage.tsx` | New walk-in arrivals | `setInterval` → `GET /api/v2/walk-ins` every 15s |
| `layouts/ReceptionLayout.tsx` | Walk-in count badge in navigation | `setInterval` → `GET /api/v2/walk-ins` every 15s |
| `pages/reception/DashboardPage.tsx` | Live KPI tile updates | `setInterval` → `GET /api/v2/dashboard` every 15s |

Each `.channel()` subscription is replaced with a `useEffect` + `setInterval` that calls the corresponding REST endpoint. No new backend work required — the existing endpoints are reused. Polling interval can be tuned per component.

---

### Work Item C — Password Migration ⚠️ Launch Blocker

**Owner:** To be assigned — backend lead + product must align before Phase 2 (auth cutover) begins.  
**Deadline:** Decision must be made and implementation complete before Phase 2 ships. Nobody can log in at cutover until this is resolved.

Supabase Auth holds the password hashes for all existing Glido users. These hashes use Supabase's internal format and cannot be exported or re-used in the new Express/bcrypt system.

**Consequence:** Every existing user will be unable to log in after cutover unless a migration path is in place.

**Choose one — decision must be made before Phase 2 coding begins:**

| Option | Description | Impact |
|---|---|---|
| Reset-email flow | At cutover, send all existing users a password-reset email. They set a new password on the new system before they can log in. | Requires email delivery working on launch day. Users get one email, expect some friction. |
| Forced reset at first login | Migrate user records (email, role) but not passwords. On first login attempt, detect missing hash and redirect to reset flow. | Smoother UX — users hit friction only when they actually log in. Requires a `password_reset_required` flag in the `app_users` table. |

---

## 5. API Endpoints the Backend Must Expose

All endpoints prefixed `/api/v2/`. All require `Authorization: Bearer <token>` except where marked public.

### Auth
| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/api/v2/auth/login` | Public | Returns `{ success, data: { token, user } }` |
| GET | `/api/v2/auth/me` | Required | Returns current user from JWT |
| POST | `/api/v2/auth/logout` | Required | Stateless JWT — optional, can be no-op |
| POST | `/api/v2/auth/forgot-password` | Public | Sends reset email |
| POST | `/api/v2/auth/reset-password` | Public | Accepts reset token + new password |

### Bookings
| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/api/v2/bookings` | Required | Supports: `date`, `from`, `to`, `ref`, `rego`, `userId`, `groupRef`, `status` |
| GET | `/api/v2/bookings/find?q=` | Required | Find by ID or reference number |
| GET | `/api/v2/bookings/:id` | Required | Single booking |
| POST | `/api/v2/bookings` | Required | Create booking |
| PATCH | `/api/v2/bookings/:id/checkin` | Required | Mark checked in |
| PATCH | `/api/v2/bookings/:id/complete` | Required | Mark completed — body: `{ notes? }` |
| PATCH | `/api/v2/bookings/:id/reschedule` | Required | Body: `{ date, startTime, endTime }` |
| PATCH | `/api/v2/bookings/:id/cancel` | Required | Guard: only if `status = scheduled` |

### Dashboard
| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/api/v2/dashboard` | Required | Returns `todaysVisitors`, `checkedIn`, `pending`, `icsHeld`, `recentVisitors` |

### Slots
| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/api/v2/slots` | Required | Supports `date`, `from`, `to` |
| GET | `/api/v2/slots/busyness?date=` | Required | Busyness level per slot |

### Walk-ins
| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/api/v2/walk-ins` | Required | All walk-in records |
| POST | `/api/v2/walk-ins` | Required | Create |
| PATCH | `/api/v2/walk-ins/:id` | Required | Update |

### Tenants
| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/api/v2/tenants/:id` | Required | Get tenant config |
| PATCH | `/api/v2/tenants/:id` | Required | Update settings |

### Check-in Records
| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/api/v2/checkin-records?bookingId=` | Required | Records for a booking |
| POST | `/api/v2/checkin-records` | Required | Create record |

### Shipments (CFS)
| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/api/v2/shipments` | Required | All shipments |
| GET | `/api/v2/shipments?billNumber=` | Required | Filter by bill number |

### Uploads (Work Item A)
| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/api/v2/uploads` | Required | Multipart upload — returns `{ url }` |
| GET | `/api/v2/uploads/signed-url?key=` | Required | Returns time-limited signed URL |

---

## 6. Standard API Response Envelope

```json
{ "success": true, "data": { ... } }
{ "success": false, "error": { "message": "Human-readable message" } }
```

HTTP status codes: `200` success, `400` validation error, `401` unauthenticated (triggers `/login` redirect), `403` forbidden, `404` not found, `500` server error (triggers toast).

---

## 7. JWT Token Shape

The frontend decodes the JWT payload client-side (without verifying signature) to restore the session on page reload. The backend (`jsonwebtoken` + `bcryptjs`) must sign tokens with a payload containing:

```json
{
  "id": "uuid",
  "email": "user@example.com",
  "name": "First Last",
  "role": "reception_admin | reception_staff | visitor_registered",
  "exp": 1234567890
}
```

Token expiry: `JWT_EXPIRATION || '1h'` (matches SRD backend pattern).

---

## 8. Revised Effort Estimate

| Area | Files | Type | Effort |
|---|---|---|---|
| New lib files (`api-client`, `fetcher`, `jwt`) | 3 | New | ~3 hrs |
| Auth context + login pages rewrite | 5 | Rewrite | ~4 hrs |
| `src/lib/db/` rewrites | 6 | Mechanical swap | ~1 day |
| UI component refactors (inline Supabase → hooks) | 21 | Per-component refactor | ~3–4 days |
| Vite dev config | 1 | Config | ~15 min |
| Storage uploads (Work Item A) | 4 | Refactor + new endpoints | ~2 days |
| Realtime replacement — polling (Work Item B) | 4 | Refactor | ~1 day |
| Password migration (Work Item C) | — | Decision + implementation | ~1–2 days |
| **Total frontend** | | | **~10–12 days** |
| **Backend (Express endpoints)** | | | **~5–7 days** |

**Key correction from v1:** The 21 UI component files require per-component refactoring (lift inline calls into hooks, then swap hook internals). This is not mechanical repetition and drives the majority of the frontend estimate.

---

*End of report — v3*
