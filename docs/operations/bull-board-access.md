# Bull Board Access Strategy

_Last updated: March 14, 2026_

## 1. Current implementation snapshot

- **Mount point.** The main Express app mounts Bull Board at `/api/admin/queues/ui` after Redis and the worker manager initialize. Grant, accept, login, and debug helpers live outside the guarded router so they can run before the UI middleware. 
- **Authentication flow.**
  - Admin UI posts to `/api/admin/queues/ui/grant`, which issues a five‑minute grant code plus a short‑lived HttpOnly UI token cookie scoped to `/api`. 
  - Navigating to `/api/admin/queues/login` redeems either the grant code or a raw `access_token`, mints the same UI cookie, and meta‑refreshes to the UI to avoid 302 proxies that strip `Set-Cookie`. 
  - The Bull Board router itself trusts either a `Bearer` header or the `ck_bb_auth`/`__Host-ck-bb` cookies, falling back to query parameters to mint a fresh UI cookie when necessary. 
- **Admin dashboard surface.** The `AdminQueues` page already surfaces aggregate queue stats, DLQ listings, and reachability checks for the UI but does not embed Bull Board; it launches the UI in the same tab. 

Despite the layered helpers, production still reports intermittent `Access token required` responses after the redirect, indicating cookies are not reliably reaching the Bull Board fetches.

## 2. Likely failure modes to validate

1. **Cookie domain drift.** `getCookieDomain` collapses the host to the apex, which works for `dev.conquestk.com` → `conquestk.com` but fails if the site is served from a Railway preview domain (`something.up.railway.app`). The derived apex (`railway.app`) does not match the real host, so cookies are discarded. Validate by loading `/api/admin/queues/ui/debug` while authenticated and inspecting `domain`/`path` plus `decoded` results. 
2. **Proxy rewriting `Set-Cookie`.** Railway’s edge sometimes strips cookies on non-HTML 200s or when `SameSite` is `lax` and the request is treated as cross-site. Confirm by reviewing `x-forwarded-host`, `x-proxy-*` headers in the debug route and testing a custom response with explicit `SameSite=None; Secure`.
3. **Meta refresh timing.** The login endpoint returns HTML that immediately navigates away. Some browsers will follow the refresh before persisting cookies set during the same response when `document.location` mutates synchronously. Try delaying the refresh (`content="2; url=…"`) to confirm, and monitor `document.cookie` via the debug endpoint.
4. **CSRF cookie name collisions.** `auth_token` overlaps with the standard API session cookie. When the UI resets that value to a short-lived token, API calls relying on `auth_token` might lose their session. Cross-check `authenticateTokenFromCookie` logs for `token` fallback usage.

Addressing (1) eliminates most of the unexplained 401s observed in the commit history because Railway preview deployments run off hostnames like `conquestk-production.up.railway.app`.

## 3. Short-term unblocking plan (within existing service)

1. **Scope UI cookies to the exact host.** Instead of collapsing to the apex, skip the domain override entirely in staging/preview (or when `req.hostname` already ends with `.railway.app`). That keeps cookies host-only and avoids mismatched apex assumptions.
2. **Switch to `SameSite=None`.** Bull Board XHRs originate from the same site but proxies occasionally treat them as cross-site. Setting `SameSite=None; Secure` alongside `__Host-ck-bb` satisfies modern browsers and Railway’s edge. Keep a guard so localhost stays `SameSite=Lax`.
3. **Delay the meta refresh.** Return a page that waits ~1 second via `setTimeout` before redirecting, with a manual link fallback. This gives the browser a chance to persist the cookie.
4. **Re-enable Authorization header fallback.** Modify the admin dashboard launcher so it fetches `/api/admin/queues/ui` with `fetch` and, on 401, retries with the `access_token` appended (`window.location = …?access_token=…`). The guard already accepts query tokens; exercising that path avoids the cookie entirely.
5. **Operational guardrails.** Document the `/api/admin/queues/ui/debug` response expectations (cookie presence, decoded payload) in runbooks so future debugging starts with telemetry rather than code changes.

## 4. Medium-term alternatives

### Option A — Ship Bull Board as a separate Railway service

- **Approach.** Clone the repo into a minimal Express server that only mounts Bull Board. Configure it as a standalone Railway service with the Redis URL and `BULL_BOARD_BASIC_AUTH_USER/PASS` env vars. Protect via Railway IP allow list or Basic Auth.
- **Pros.**
  - Eliminates cross-service cookie issues; UI can rely on Basic Auth which is proxy-friendly.
  - Keeps the main API leaner and removes Bull Board dependencies from the core deployment.
- **Cons.**
  - Duplicates deployment effort (another service to monitor & pay for).
  - Requires poking a firewall hole so the board can reach Redis; if Redis is private to the project, this works but increases blast radius.
- **Implementation sketch.**
  1. Create a new npm script (e.g., `npm run bull-board:start`) that boots a lightweight `express()` server mounting the existing `createBullBoardRouter` without auth.
  2. Parameterize queue Redis connection via env to share config with production.
  3. Deploy to Railway using the Node template with Basic Auth (or Cloudflare Access) in front.

### Option B — Adapt Railway’s Bull Board template

- **Approach.** Fork Railway’s official Bull Board starter, set the Redis connection to the project’s add-on, and lock access behind Railway’s auth controls.
- **Pros.**
  - Quick to stand up; template already handles hosting + auth (usually Basic Auth or simple login page).
  - Completely decoupled from our auth/session stack.
- **Cons.**
  - Still a separate service to maintain.
  - Template lags our queue naming/customization; you’ll need to port adapters and ensure queue prefixes match (`BULL_PREFIX`).

### Option C — Expand the existing Admin Queues UI (Bull Board optional)

- **Approach.** Continue enhancing `AdminQueues` by exposing more worker operations via bespoke endpoints (`/api/queues/:queue/jobs`, `/api/queues/:queue/retry`, etc.). Only rely on Bull Board for deep dives.
- **Pros.**
  - Keeps everything within the authenticated SPA where we already trust the access token.
  - Can tailor exactly the metrics the team needs (trends, alert banners, job payload previews) without Bull Board’s UI quirks.
- **Cons.**
  - Requires engineering time to build the operations tooling.
  - Doesn’t provide the drag-and-drop/job inspection convenience Bull Board offers out of the box.

## 5. Recommended path

1. **Fix host-only cookies + SameSite first** (section 3). This is the smallest change and should stabilize access for production/staging immediately.
2. **In parallel, prototype Option C.** Add endpoints in `queueRoutes.ts` for “recent active jobs”, “recent failures”, and “retry by job ID”; render them in `AdminQueues`. This covers 90% of operator workflows without leaving the SPA.
3. **Schedule a follow-up** to evaluate Option A if cookies remain unreliable after the host-only/SameSite adjustments. Standing up a separate Railway service is the cleanest fallback, but only pursue it if the above fixes fail.
4. **Document the runbook.** Append a troubleshooting section referencing `/api/admin/queues/ui/debug` to `docs/operations/troubleshooting.md` so the next investigation starts from instrumentation instead of emergency patches.

Executing the small cookie/domain tweaks plus richer in-app reporting keeps operational overhead low while still preserving the escape hatch of a dedicated Bull Board deployment if needed.

## 6. Implementation snapshot (March 15, 2026)

- **Host-scoped cookies.** `ck_bb_auth`, `auth_token`, and `__Host-ck-bb` now skip apex domains for any `*.railway.app` or `*.railway.internal` host. Preview and staging environments keep cookies tied to the precise hostname, avoiding `railway.app` domain mismatches.
- **`SameSite=None` for hosted environments.** Non-local hosts mint cookies with `SameSite=None; Secure`, matching Railway’s edge expectations while retaining `SameSite=Lax` on localhost for HTTP support.
- **Gentle login redirect.** The `/accept` and `/login` helpers now wait 1 second via `setTimeout` before redirecting, giving browsers time to persist the `Set-Cookie` header.
- **SPA launcher fallback.** The `AdminQueues` button first performs a credentialed `fetch` with the bearer token. On 401 it automatically retries with `?access_token=…`, and only falls back to the grant-code flow if no token is available.
- **Middleware alignment.** `authenticateTokenFromCookie` mirrors the new cookie settings and also stamps the `__Host-ck-bb` cookie when redeeming grants/access tokens to keep the UI consistent with browser navigation.
