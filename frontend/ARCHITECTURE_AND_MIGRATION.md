# Glido → SRD Flow Replication (full re-architecture)

**Goal:** make Glido's **data + auth + communication flow identical to SRD's**. The UI is **out of scope** — leave Glido's screens, components, styling, kiosk/wizard/reception UX **intact**. We are re-plumbing what happens *behind* the components, not how they look.

## What "replicate the flow" means here (decisions locked in — confirmed against the real SRD backend)

> These are no longer assumptions. They were read directly from the actual backend repo (`srd-fleetsense-backend`, `/Users/adeeb/Downloads/SRD_Backend`).

- **Server boundary: same as SRD.** A **standalone Express + Node backend** sits in front of the database. The browser **never touches the DB**. Flow: `frontend → backend API (/api/v2/*) → pg → Postgres`.
- **Auth: SRD's custom JWT, Bearer-only.** **`jsonwebtoken`** (`jwt.sign/verify`, HS256, `JWT_EXPIRATION` default `1h`) + **`bcryptjs`**. The token is sent as **`Authorization: Bearer <token>`** and stored client-side in `localStorage`. **There is NO httpOnly cookie at the backend** — the cookie in SRD was a *Next.js-only* artifact; the canonical Express backend is pure Bearer. Payload = `{ id, email, name, role }`, `role ∈ {admin, planner}`. Middleware: `requireJWT`, `requireAdmin`, `requireJWTOrToken` (latter also accepts a static `?token=` for webhooks). `/auth/me` does background verify. **Supabase Auth is removed.**
- **Cross-origin, not a proxy.** The backend enables **CORS with `credentials:true`** and an `ALLOWED_ORIGINS`/`FRONTEND_URL` allow-list. Because auth is Bearer (no cookie), Glido's Vite SPA can call the backend **cross-origin** (e.g. frontend `:5173`, backend `:5000`) with no same-origin proxy needed. (A Vite/Nginx proxy is optional convenience, not required.)
- **Database: raw `pg` via `DATABASE_URL`.** SRD uses a single `pg.Pool` against a plain Postgres (`DATABASE_URL` — local in dev, **Render Postgres** in prod; *not* Supabase). For Glido, point `DATABASE_URL` at your **Supabase Postgres connection string** (it's standard Postgres — `pg` connects fine) or migrate to a Render/own Postgres. Custom pg type parsers (NUMERIC→float, DATE/TIMESTAMP→string), retry/backoff, and `queryRows/queryOne/query/transaction` helpers.
- **Caching: Redis (optional).** SRD adds an `ioredis` cache with a **graceful in-memory fallback** (e.g. user-by-email cached 5 min on login). Optional for Glido — the fallback means it works without Redis.
- **Hardening built in:** `helmet`, global + auth **rate limiting** (`express-rate-limit`), `express-validator`, `trust proxy`, `/health` + `/health/detailed`, and **`node-cron`** background jobs.
- **Realtime: replaced.** No browser DB connection, so Supabase channels go away; freshness comes from React Query refetch/invalidation (+ optional `node-cron` server sync), matching SRD.
- **Frontend tooling unchanged:** Glido stays **Vite + React + react-router-dom + Tailwind**. No Next.js.

> Net effect on the stack — **add backend:** `express`, `pg`, `jsonwebtoken`, `bcryptjs`, `cors`, `helmet`, `express-rate-limit`, `express-validator`, `dotenv`, `node-cron`, `ioredis` (optional). **Add frontend:** `@tanstack/react-query` (+ optional `zustand`). **Remove frontend:** `@supabase/supabase-js` browser usage + Supabase Auth. **Keep:** all UI libs and the React/Vite app.

---

## Part 0 — Target flow at a glance

```
┌─────────────────────────── FRONTEND (Vite/React — UI untouched) ───────────────────────────┐
│ Component / page                                                                            │
│   └─ domain hook (useBookings, useSlots…)        ← query keys, endpoints, row→camel mapping │
│        └─ TanStack React Query                    ← cache, dedup, staleTime, invalidation   │
│             └─ fetcher (get/post/put/patch/del)                                             │
│                  └─ central apiClient             ← Bearer token (localStorage), base URL,    │
│                                                      GET dedup, 401→/login, error toasts     │
│                       └─ fetch(`${API}/api/v2/…`)                                            │
└───────────────────────────────────────────│───────────────────────────────────────────────┘
                                             │ cross-origin (CORS, credentials) + Bearer token
┌────────────────────────────────────────── BACKEND (Express — NEW) ─────────────────────────┐
│ helmet → cors → json → rate-limit → routes → 404 → error-handler                             │
│ Route handlers  /api/v2/auth/* , /api/v2/bookings , /api/v2/slots …                          │
│   ├─ requireJWT / requireAdmin / requireJWTOrToken  (verify Bearer; ?token= for webhooks)    │
│   ├─ (optional) Redis cache (ioredis + in-memory fallback)                                   │
│   ├─ envelope: buildSuccessResponse / buildErrorResponse                                     │
│   └─ data access  → pg Pool  (queryRows/queryOne/query/transaction, parameterized SQL)       │
└───────────────────────────────────────────│───────────────────────────────────────────────┘
                                             ▼
                          Postgres via DATABASE_URL (Supabase DB or Render/own Postgres)
```

This is SRD's flow, 1:1. The only substitution: SRD's BFF lives in Next.js route handlers; ours lives in an Express app reached through a proxy so the **frontend code is byte-for-byte the same pattern** (relative `/api/v2/*`, Bearer, envelope).

---

# Part 1 — SRD reference flow (the spec we implement)

## 1.1 The layered request pipeline

Components **never** touch the network or the DB directly. Data flows one way:

```
Component → domain hook → React Query → fetcher → apiClient → (proxy) → Express → pg → Postgres
```

Two invariants make it work:

- **Relative paths.** The client always fetches `/api/v2/...`; a proxy routes that to the backend. Auth paths are special-cased so the same origin can set the httpOnly cookie.
- **One envelope.** Every response is `{ success: boolean, data: T, error: { message: string } }`. Hooks check `success` and throw `error.message`.

## 1.2 Central API client — `lib/api-client.ts` (SRD)

The single HTTP chokepoint:

- Reads JWT from `localStorage` → sets `Authorization: Bearer <token>`.
- Forces leading `/`, `Content-Type: application/json`, `cache: 'no-store'`.
- **GET de-duplication** via an in-flight `Map<key, Promise>` (collapses concurrent identical GETs).
- **401 handling:** clears token (except on login), redirects to `/login` unless already there / on the `/auth/me` probe; throws the server's `error.message`.
- Network + `>= 500` errors raise a `sonner` toast; all errors are thrown so React Query marks the query failed.

## 1.3 Verb helpers — `lib/fetcher.ts` (SRD)

`fetcher` (GET), `postFetcher`, `putFetcher`, `patchFetcher`, `deleteFetcher`, `rawFetcher` — all delegate to `apiClient`, inheriting auth + error handling.

## 1.4 Cache layer — `lib/providers/QueryProvider.tsx` (SRD)

One `QueryClient`: default `queryFn: ({queryKey}) => fetcher(queryKey[0])`, `staleTime 5m`, `gcTime 10m`, `retry false`, `refetchOnWindowFocus false`. Registered with `state-cleanup` so logout can `.clear()` it.

## 1.5 Domain hooks — `hooks/use*.ts` (SRD)

One hook per resource. Each: builds a structured query key `['vehicles',{...filters}]`; builds the URL with `URLSearchParams`; calls `fetcher`; validates `success`; **maps snake_case → camelCase**; exposes `useMutation`s that `invalidateQueries` on success; returns a typed, stable shape (`STABLE_EMPTY_ARRAY`, per-hook `staleTime`).

## 1.6 Server-cache stores (Zustand) — `lib/store/*` (SRD)

For heavy/derived/shared state. `useDashboardStore` = the "Iron Doorman": in-flight dedup, **15s TTL** + 10s recent-guard, **60s watchdog**, BUILD_ID cache-busting, single atomic `set()`, `invalidate()/reset()`. `useLRsStore` = chunked classification (1000-row chunks yielding to the browser) so big datasets don't freeze the UI. `usePlanningStore` = **persisted** UI selections via `persist` + `localStorage`. `useZonesStore` = lightweight scoped fetch. Rule: **React Query = server cache; Zustand = derived/coordinated client state**; every store has `reset()`.

## 1.7 Auth flow (custom JWT, Bearer-only) — SRD (actual backend)

- **`middleware/jwt-auth.ts`** — `jsonwebtoken`: `generateToken({id,email,name,role})` = `jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRATION || '1h' })`. `requireJWT` reads `Authorization: Bearer <token>`, `jwt.verify`s it, attaches `req.user = {id,email,name,role}`, else `401`. `requireAdmin` → `403` unless `role === 'admin'`. `requireJWTOrToken` also accepts a static `?token=` (`CLIENT_API_TOKEN`) for webhooks. **No cookie logic** — Bearer only.
- **`routes/v2/auth.ts`** — `POST /login`: look up `app_users` by lowercased email (Redis-cached 5 min), `bcrypt.compare` against `password_hash`, check `is_active`, `generateToken`, fire-and-forget `last_login` update, return `{ token, user }`. `GET /me` (`requireJWT`) returns `req.user`. **No `/logout`** — logout is client-side (drop the token).
- **Users table** — `app_users(id, email, name, role, password_hash, is_active, last_login)`; passwords are bcrypt hashes (seed/reset via scripts like `reset-admin-password.ts` / `generate_hashes.js`).
- **Client (`lib/auth-context.tsx` in the frontend)** — stores the token in `localStorage`, **optimistically decodes the JWT** to restore the user instantly (no login flash), then **verifies in the background** via `/auth/me`; only logs out on a **definitive 401**. Exposes `{ user, isAuthenticated, isAdmin, isLoading, login, logout }`. (The httpOnly cookie you saw earlier lived only in the *Next.js* frontend's own route handler — it is **not** part of the canonical backend and is **not needed** for Glido.)
- **Guards** — an auth guard at the layout gates **authentication**; `AdminGuard` gates **role**. Both show a loader while `isLoading`, render `null` during redirect.

## 1.8 Logout hygiene — `lib/state-cleanup.ts` (SRD)

`clearAllClientState()` clears localStorage/sessionStorage, the **React Query cache** (`queryClient.clear()`), and **every Zustand store's `reset()`**.

## 1.9 Provider composition (SRD)

`ThemeProvider → AuthProvider → QueryProvider → LanguageProvider → {children} + <Toaster/>`.

## 1.10 Backend proxy (SRD)

`next.config.mjs` rewrites `/api/v2/:path((?!auth|cron).*)` → `NEXT_PUBLIC_BACKEND_URL`; auth excluded so Next owns the cookie. Security headers + CSP set globally.

---

# Part 2 — Lifecycle (one read)

1. Component calls `useBookings({date})`.
2. React Query checks cache (fresh within `staleTime` → instant); else runs `queryFn`.
3. `queryFn` → `fetcher('/api/v2/bookings?date=…')` → `apiClient` attaches Bearer + cookie, fetches the **relative** path.
4. Proxy routes to Express → `requireAuth` verifies JWT → controller queries Postgres via `pg` → returns `{success,data,error}`.
5. `apiClient` throws on 401/5xx (and toasts), else returns JSON; hook validates `success`, maps to camelCase.
6. A mutation `POST`s via `postFetcher`, then `invalidateQueries(['bookings'])` → auto refetch.
7. Logout → `clearAllClientState()` wipes cache + stores + storage; backend clears the cookie.

---

# Part 3 — Glido today vs. the target flow

| Concern | Glido now | Target (SRD flow) |
|---|---|---|
| DB access | `supabase.from(...)` **in the browser**, inside `lib/db/*` called from components | Browser → **Express API** → `pg` → Postgres |
| Fetching | raw `useState`/`useEffect`, no cache/dedup/invalidation | React Query everywhere |
| Transport | supabase-js client | central `apiClient` (Bearer + cookie, relative `/api/v2/*`, dedup, 401) |
| Auth | Supabase Auth (browser) | **custom JWT** (jose+bcrypt) issued by Express, cookie+Bearer, `/auth/me` |
| Realtime | Supabase channels in components | React Query refetch/invalidate (+ optional polling) |
| State | everything in React Context | React Query (server) + Zustand (derived) + Context (UI/flow only) |
| Logout | clears Supabase session | `clearAllClientState()` (cache+stores+storage) + cookie clear |
| **UI** | bespoke components | **unchanged — leave intact** |

Glido's `lib/db` mappers (`rowToBooking`, etc.) and domain types are reusable — they just **move to the backend** (row→domain mapping happens server-side, or stays as the client camelCase map step). The discipline is already half-right; the boundary moves.

---

# Part 4 — The re-architecture (exhaustive, flow-only)

## 4A. NEW backend — Express + Postgres (mirror `srd-fleetsense-backend` exactly)

Separate repo/app, deployed independently (SRD runs it on Render in prod, local Postgres in dev). TypeScript, run with `tsx watch` in dev, `tsc` → `node dist/server.js` in prod.

**Structure (as in the real backend)**
```
server/
  src/
    server.ts                # express app: helmet → cors → json → rate-limit → routes → 404 → error handler; /health; cron init
    db/
      pool.ts                # pg.Pool from DATABASE_URL; type parsers; retry/backoff; queryRows/queryOne/query/transaction
    db.ts                    # re-export of db/pool helpers (import convenience)
    types/
      api.ts                 # ApiSuccess/ApiError + buildSuccessResponse/buildErrorResponse/buildPagination
    middleware/
      jwt-auth.ts            # jsonwebtoken: requireJWT / requireAdmin / requireJWTOrToken / generateToken
      rate-limit.ts          # globalRateLimit + authRateLimit (express-rate-limit)
      validate-request.ts    # express-validator wrapper
    cache/
      redis.ts               # ioredis + in-memory fallback; getCached/setCache/deleteCache/cacheKeys  (OPTIONAL)
    routes/v2/
      auth.ts                # POST /login, GET /me
      bookings.ts slots.ts walk-ins.ts tenants.ts checkin-records.ts shipments.ts
    controllers/             # only for complex endpoints (e.g. dashboard.controller.ts); simple CRUD lives in the route
    services/                # cross-cutting logic (sync, schedules) if needed
    health/check.ts          # getHealthStatus / getDetailedHealth
    cron.ts                  # node-cron background jobs (optional for Glido)
  package.json               # express, pg, jsonwebtoken, bcryptjs, cors, helmet, express-rate-limit, express-validator, dotenv, node-cron, ioredis
  .env                       # DATABASE_URL, DATABASE_SSL, JWT_SECRET, JWT_EXPIRATION, ALLOWED_ORIGINS/FRONTEND_URL, PORT, REDIS_URL, NODE_ENV
```

**Pieces to build (copy patterns from the SRD backend)**

1. **`db/pool.ts`** — one `pg.Pool` from `DATABASE_URL` (`max:50, min:0, idle/connTimeout 30s`, SSL gated by `DATABASE_SSL`). Register pg **type parsers** (NUMERIC→float; DATE/TIMESTAMP/TIMESTAMPTZ→string). Wrap queries in **`withRetry`** (4 attempts, exp backoff) for transient DB restarts. Export **`queryRows`, `queryOne`, `query`, `transaction`**. All SQL is **parameterized** (`$1,$2…`). For Glido set `DATABASE_URL` to the Supabase connection string (`DATABASE_SSL=true`).
2. **`types/api.ts`** — the **canonical envelope**: `buildSuccessResponse(data,message?,pagination?)` → `{ success:true, data, message?, pagination? }`; `buildErrorResponse(message,errorCode?)` → `{ success:false, message, errorCode? }`. Use these everywhere. **Caveat:** some SRD routes (e.g. `vehicles.ts`) instead return `{ success:false, error:{ message } }`; the frontend `apiClient` tolerates **both** (`errorBody?.error?.message || errorBody?.message`). Pick one shape for Glido and be consistent — recommend `error:{message}` since the client already keys on it.
3. **`middleware/jwt-auth.ts`** — copy verbatim: `generateToken` (`jwt.sign`, `expiresIn: JWT_EXPIRATION||'1h'`), `requireJWT` (verify Bearer → `req.user`), `requireAdmin` (role gate), `requireJWTOrToken` (also accept `?token=CLIENT_API_TOKEN` for webhooks).
4. **`cache/redis.ts` (optional)** — `ioredis` with **in-memory Map fallback** so it works with no Redis; `getCached/setCache/deleteCache/deleteCachePattern/cacheKeys`. Use for hot reads (e.g. user-by-email on login, 5 min).
5. **`routes/v2/auth.ts`:**
   - `POST /api/v2/auth/login` — `authRateLimit`; lookup `app_users` by lowercased email (cache first), `bcrypt.compare(password, password_hash)`, check `is_active`, `generateToken`, fire-and-forget `last_login`, return `buildSuccessResponse({token, user})`.
   - `GET /api/v2/auth/me` — `requireJWT`, return `req.user`.
   - **No `/logout`** — client drops the token.
   - **Seed/migrate users:** create `app_users` (rename Glido's `users`), populate `password_hash` (bcrypt). Since Supabase Auth holds no hash you control, run a one-time **set-password / reset** script (mirror `reset-admin-password.ts`) or a reset-email flow.
6. **Resource routes** (one per current `lib/db` module, same operations): `bookings` (list w/ date+status filters, get by id, get by groupRef, create, update, dashboard stats), `slots` (by date, by range), `walk-ins` (active, create, dismiss), `tenants` (get, update, working hours), `checkin-records` (create, visitor log), `shipments` (lookup by HBL/container). Each handler: `requireJWT` (+ `requireAdmin` where admin-gated), validate input (`express-validator`), run parameterized SQL via the pool helpers, return the envelope. Simple CRUD lives in the route (like `vehicles.ts`); push only complex aggregation into `controllers/`.
7. **`server.ts`** — middleware chain `helmet → cors({origin: ALLOWED_ORIGINS.split(','), credentials:true}) → express.json → globalRateLimit → routes → 404 → error handler`; `app.set('trust proxy', 1)`; `/health` + `/health/detailed`; optional `initCronJobs()` on listen. Error handler returns `{success:false, message, errorCode}` and hides messages in prod.
8. **Row→domain mapping** — Glido's existing `rowToBooking`-style mappers move **server-side** (or the frontend hook keeps the snake→camel map step, as SRD's `useVehicles` does). Either is fine; pick one and keep it at the boundary.

## 4B. Frontend re-wire (logic only — UI untouched)

Add these under `src/` and point all data access at the backend.

1. **`lib/api-client.ts`** — port SRD's client: token in `localStorage['glido_auth_token']`, `Authorization: Bearer`, **base URL from `VITE_BACKEND_URL`** (cross-origin; e.g. `${API}/api/v2/...`), GET dedup, 401→`/login`, error toasts. **No cookie / no `credentials:'include'` needed** (Bearer-only). Use `fetch` or `axios` — SRD's behavior, not the library, is what matters.
2. **`lib/fetcher.ts`** — `fetcher/postFetcher/putFetcher/patchFetcher/deleteFetcher/rawFetcher` over `apiClient`.
3. **`lib/providers/QueryProvider.tsx`** — one `QueryClient` (staleTime 5m, gcTime 10m, retry false, refetchOnWindowFocus false); register with `state-cleanup`.
4. **`hooks/useBookings.ts`, `useSlots.ts`, `useWalkIns.ts`, `useTenant.ts`, `useCheckinRecords.ts`, `useShipments.ts`** — React Query hooks calling the backend endpoints (NOT Supabase). Structured keys (`['bookings',{date}]`), mutations `invalidateQueries`. These **replace** the current `lib/db/*` browser modules.
5. **`contexts/AuthContext.tsx`** — rewrite to SRD's pattern: `login()` posts to `/api/v2/auth/login`, stores the token in `localStorage`, sets user; on mount **decode the JWT locally** to restore instantly, then verify via `/api/v2/auth/me`; `logout()` is **client-side only** (no backend call) — drop the token + `clearAllClientState()`. Remove all `supabase.auth.*`.
6. **Guards** — keep `ReceptionGuard` as the **auth** guard but back it by the new `AuthContext` (no Supabase session check); add **`AdminGuard`** for admin-only pages. Same loader/redirect/null shape as SRD.
7. **`lib/state-cleanup.ts`** — `clearAllClientState()` clears storage + `queryClient.clear()` + store `reset()`s; call from `logout()`.
8. **Provider stack in `main.tsx`** — `AuthProvider → QueryProvider → RouterProvider` (+ `<Toaster/>`). Keep Wizard/Kiosk contexts as UI/flow state.
9. **(Optional) Zustand** for heavy/persisted client state (e.g. dashboard snapshot, persisted filters) following SRD's store patterns.
10. **Realtime** — replace `supabase.channel(...)` in `DashboardPage` etc. with React Query: `refetchInterval` (polling) and/or `invalidateQueries` after mutations. (If you later want push, add a tiny SSE/WebSocket endpoint on Express — but SRD doesn't, so default to refetch.)

## 4C. Cross-origin by default (proxy optional)

Because the real backend is **Bearer-only + CORS** (no cookie), the simplest setup is **cross-origin**: the frontend calls `VITE_BACKEND_URL` directly; the backend allows the frontend origin via `ALLOWED_ORIGINS`. No proxy required.

- **Backend:** `cors({ origin: ALLOWED_ORIGINS.split(','), credentials: true })` (credentials harmless even with Bearer).
- **Frontend env:** `VITE_BACKEND_URL=http://localhost:5000` in dev, your API host in prod.
- **Optional convenience proxy** (if you'd rather keep relative `/api/*` paths): Vite dev proxy
  ```ts
  server: { proxy: { '/api': { target: process.env.VITE_BACKEND_URL ?? 'http://localhost:5000', changeOrigin: true } } }
  ```
  and Nginx in prod. This is cosmetic only — not needed for auth since there's no cookie.

## 4D. Database & config

- **Keep the Supabase Postgres database.** Get its connection string (Project → Database → Connection string) → backend `DATABASE_URL`. The backend connects via `pg`. (Optionally use `supabase-js` with the **service role key on the server** instead of raw `pg` — but SRD uses `pg`, so prefer `pg` for a true match.)
- **Storage:** if booking documents use Supabase Storage, do uploads **through the backend** (signed URLs minted server-side) so no Supabase creds live in the browser.
- **Frontend env:** drop `VITE_SUPABASE_*` from the client; add `VITE_BACKEND_URL` only (or nothing if same-origin). All secrets move to the **backend** `.env`.
- **`lib/config.ts`** (frontend) — read the few `VITE_*` values in one place (SRD's `hub-config` rule: no scattered env reads).

## 4E. What to REMOVE from the frontend

- `@supabase/supabase-js` usage in the browser, `lib/supabase.ts` client, all `supabase.from/auth/storage/channel` calls.
- `lib/db/*` as **browser** modules (their SQL/mapping moves to the backend `data/` layer; the frontend keeps only React Query hooks).
- Supabase Auth flows in `AuthContext`/`ReceptionAuthContext`/`ReceptionGuard`.

## 4F. UI — explicitly OUT OF SCOPE

Do **not** touch: pages, layouts, `components/ui/*`, kiosk/wizard/reception components, styling, icons, charts, toasts' look. Components keep calling the **same hook names** — only the hook internals change (Supabase → backend). This keeps the UI a stable consumer while the flow is swapped underneath.

---

# Part 5 — Piece-by-piece mapping (Glido → target)

| Glido today | Becomes |
|---|---|
| `lib/supabase.ts` (browser client) | **deleted**; `server/db/pool.ts` (pg) |
| `lib/db/bookings.ts` (browser, supabase) | `server/data/bookings.ts` (SQL) + `hooks/useBookings.ts` (React Query → `/api/v2/bookings`) |
| `lib/db/slots|walk-ins|tenants|checkin-records|cfs-shipments` | same split: server `data/*` + frontend `hooks/use*` |
| `lib/auth.ts` (signUpVisitor via supabase) | `server/routes/auth.ts` (jose+bcrypt) + frontend `AuthContext.login()` |
| `contexts/AuthContext` (supabase session) | rewritten to JWT decode/restore/verify |
| `contexts/ReceptionAuthContext` | role from `/auth/me`; powers `AdminGuard` |
| `components/ReceptionGuard` | auth guard backed by `AuthContext` (no supabase) |
| Supabase realtime in pages | React Query `invalidateQueries` / `refetchInterval` |
| `useState/useEffect` fetching in pages | the new React Query hooks (UI markup unchanged) |
| `lib/toast.ts` | keep (UI) — but surface API errors centrally from `apiClient` |
| Wizard/Kiosk contexts | keep (UI/flow state) |

---

# Part 6 — Phased rollout (flow-first)

1. **Stand up the backend skeleton:** Express + `pg` pool + envelope + `errorHandler`; `GET /api/v2/health`. Wire the Vite proxy. (4A scaffold, 4C.)
2. **Auth vertical slice:** `jwt.ts`, `requireAuth/requireRole`, `/auth/login|me|logout`, user table + bcrypt hashes. Frontend: `apiClient`, `fetcher`, rewrite `AuthContext`, guards, `state-cleanup`. **Login end-to-end with no Supabase.** (4A.3–5, 4B.1–3,5–7.)
3. **First resource end-to-end:** bookings — `server/data/bookings.ts` + routes + `hooks/useBookings.ts`; migrate `DashboardPage`/`BookingsPage` to the hook; realtime → invalidate/poll. (Proves the whole flow.)
4. **Sweep remaining resources:** slots, walk-ins, tenants, check-in records, shipments — backend route + frontend hook each; migrate consuming pages off `useEffect`/Supabase. (4A.6, 4B.4.)
5. **Storage + cleanup:** move document uploads behind the backend; delete `lib/supabase.ts` and all browser Supabase usage; drop `VITE_SUPABASE_*`. (4D, 4E.)
6. **Harden:** per-hook `staleTime`, mutation invalidation map, optional Zustand stores, security headers/CORS, prod Nginx proxy, devtools. (1.6, 4C, 4D.)

After Phase 3 the architecture is proven; Phases 4–5 are mechanical repetition per resource. The UI never changes — only what its hooks call.

---

# Part 7 — Answers (resolved from the real SRD backend)

The earlier open questions are now settled by reading `srd-fleetsense-backend` directly:

1. **Hosting/runtime** — Node + Express, **deployed separately** (SRD: local Postgres in dev, **Render** Postgres in prod; backend on `PORT` 5000). Frontend and backend are **different origins**, bridged by **CORS** (`ALLOWED_ORIGINS`/`FRONTEND_URL`, `credentials:true`). No same-origin requirement because auth is Bearer.
2. **DB driver** — **raw `pg`** via a single pooled `DATABASE_URL`, with type parsers + retry/backoff + `queryRows/queryOne/query/transaction`. (Not `supabase-js` on the server.) For Glido: `DATABASE_URL` = Supabase connection string, `DATABASE_SSL=true`.
3. **Auth** — **`jsonwebtoken`, Bearer-only, no cookie.** Token in `localStorage`, `expiresIn` from `JWT_EXPIRATION` (default `1h`). Users in **`app_users`** with bcrypt `password_hash`. Migration: seed/reset hashes via a script (SRD ships `reset-admin-password.ts` / `generate_hashes.js`).
4. **Realtime** — none on the wire; freshness via **React Query refetch/invalidation** + **`node-cron`** server-side background sync (every ~15 min in SRD). No WebSocket/SSE.
5. **Caching/hardening** — optional **Redis (`ioredis`) with in-memory fallback**; **helmet**, **express-rate-limit** (global + auth), **express-validator**, `trust proxy`, `/health`.
6. **Repo layout** — backend is its **own repo** (`srd-fleetsense-backend`), separate from the frontend. Recommend the same for Glido (or a `/server` workspace).

**Remaining choices that are genuinely yours (not dictated by the backend):**

- Keep the database on **Supabase Postgres** (point `pg` at it) vs. move to **Render/own Postgres** like SRD. Either works; `pg` + `DATABASE_URL` is identical.
- Whether to run **Redis** at all (optional — fallback covers it).
- How to handle the **password migration** for existing users (reset-email flow vs. bulk re-hash with known passwords).

With these locked, the next step is scaffolding: the Express backend (`server.ts`, `db/pool.ts`, `types/api.ts`, `middleware/jwt-auth.ts`, `routes/v2/auth.ts` + one resource) and the frontend rewrite (`api-client.ts`, `fetcher.ts`, `QueryProvider.tsx`, `AuthContext`, first `useBookings` hook). Say the word and I'll generate them as real code stubs.
