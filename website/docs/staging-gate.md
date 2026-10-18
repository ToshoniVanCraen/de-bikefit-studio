# Staging access gate (issue #18)

First-party access control for the staging deployment, replacing Vercel Authentication for
the one host `staging.debikefitstudio.be`. Every other host (production, feature previews,
immutable deployment URLs, local) keeps today's behaviour exactly: no gate, no redirect, no
allowlist.

This document is the design contract. The operational steps (migration, variables, accounts,
smoke) are in `staging-runbook.md` §20; the variables in `../DEPLOYMENT.md` §5.

## 1. Activation: exact host, exact branch, complete configuration

The gate decides per request in the retained `src/middleware.ts` (Next 16 builds this
legacy file for the Edge runtime), through the pure
function `resolveStagingGate()` in `src/lib/staging-gate/config.ts`:

| Input | Source in middleware | Source in Node (actions, routes, CLI) |
| --- | --- | --- |
| hostname | request `Host` header (fallback `req.nextUrl.hostname`), normalised without port | `headers().get('host')`, normalised without port |
| `VERCEL_ENV` | literal `process.env.VERCEL_ENV` | `env.VERCEL_ENV` |
| `VERCEL_GIT_COMMIT_REF` | literal `process.env.VERCEL_GIT_COMMIT_REF` | `env.VERCEL_GIT_COMMIT_REF` |
| `STAGING_GATE_SECRET` | literal | `env.STAGING_GATE_SECRET` |
| `STAGING_GATE_HEALTH_TOKEN` | literal | `env.STAGING_GATE_HEALTH_TOKEN` |
| `DATABASE_URL` | literal | `env.DATABASE_URL` |

Result:

- **`inactive`** — hostname is not exactly `staging.debikefitstudio.be`. The middleware runs
  the pre-existing logic (Clerk, admin redirect, admin CSP) and nothing else. Paths the old
  matcher never ran on (static files by extension, `_next/*`) are passed through untouched.
- **`misconfigured`** — the hostname matches and any of these fails: `VERCEL_ENV !==
  'preview'`, `VERCEL_GIT_COMMIT_REF !== 'staging'`, secret missing or shorter than 32
  characters, health token missing or shorter than 32 characters, secret equal to the health
  token, `DATABASE_URL` missing or not a `postgres(ql)://` URL. Every path selected by the
  matcher on that host, including the login page, answers **503** (`gate_misconfigured`);
  hashed `/_next/static/*` assets are deliberately exempt so the login shell can load. Logged once per instance as
  `[staging-gate] misconfigured <reason codes>` (codes: `vercel_env`, `git_ref`, `secret`,
  `health_token`, `database_url`; never values).
- **`active`** — all of the above hold; the gate below applies.

The middleware reads these variables literally (the existing proxy convention in
`src/lib/env.ts`); everything on the Node side reads them through `env`.

## 2. Request handling on the active host

Order of checks in `src/lib/staging-gate/middleware.ts` (`gateRequest()`), run before the
pre-existing middleware logic:

Before these checks, **`/_next/image`** is refused with 404 for everyone; staging builds emit
direct image URLs instead.

1. **Public method/path pairs** (no session needed): GET/HEAD `/staging-toegang` (login page),
   POST `/api/staging-gate/login` (dedicated sign-in handler), GET/HEAD `/favicon.ico`,
   `/icon.svg`, `/apple-icon.png` and `/brand/*`, and POST on the exact
   `/api/webhooks/clerk` and `/api/webhooks/stripe` endpoints (each verifies its own signature).
   Anonymous POST to `/staging-toegang` is **gated**: an earlier exact-build local test proved
   Next could execute an unrelated Server Action submitted to that public page.
   `/_next/static/*` never reaches the middleware (matcher). `/_next/image` is always **404**
   on the active host, even with credentials: the staging build renders `<Image>` URLs
   unoptimized because Next's optimizer emits a public cache policy.
2. **`/robots.txt`** is answered by the middleware itself: `User-agent: *` / `Disallow: /`,
   `text/plain`, 200. The database-driven `robots.ts` is never consulted on this host.
3. **Machine token** (`x-staging-gate-token` header, Arend's `site-health`): compared in
   constant time with `STAGING_GATE_HEALTH_TOKEN`. Valid **and** method GET/HEAD → the request
   passes with no cookie and no session on any gated path. This is a staging-wide GET/HEAD
   bearer credential, not a browser account; protect and rotate it accordingly. Present but invalid, or any other method → **401**
   JSON `{"code":"gate_auth_failed"}`. `/api/staging-gate/health` accepts **only** this
   token, never a cookie; the route handler re-verifies it and answers 200 `{"status":"ok"}`
   when the gate accounts, sessions and rate-limit tables can be queried, otherwise **503** `{"code":"app_unhealthy"}`. This only proves gate schema availability; Arend's script must also fetch
   a protected page with the token and assert expected content, never count login HTML as healthy. The
   three codes `gate_misconfigured` (503), `gate_auth_failed` (401) and `app_unhealthy` (503)
   are stable and carry no secret.
4. **Session cookie** `__Host-staging-gate`, value `v1.<token>.<tag>`:
   - `token` = 32 random bytes, base64url; `tag` = base64url(HMAC-SHA256(secret,
     `staging-gate-session:` + token)), computed with Web Crypto
     (`src/lib/staging-gate/token.ts`, runtime-neutral).
   - The middleware recomputes the tag and compares it in constant time **before** any
     database query, so a forged or garbage cookie costs no query. Only the recomputed tag is
     used as the lookup key, never the client's bytes.
   - Lookup (`src/lib/staging-gate/store-edge.ts`, raw SQL over `@neondatabase/serverless`
     `neon(url).query()`): session by `token_hash` joined with its account. The session is
     valid when `evaluateGateSession()` (`src/lib/staging-gate/policy.ts`) says so: session
     not revoked, account not revoked, `now − created_at < 8 h`, `now − last_used_at < 30 min`.
     `last_used_at` is moved forward on every authenticated request (one conditional UPDATE,
     never backwards, never on a revoked row), so the idle limit is measured from actual
     activity rather than a throttled approximation.
   - Invalid, unknown, revoked or expired → cookie cleared, **302** to
     `/staging-toegang?reden=verlopen&next=<return path>` (`next` only for GET/HEAD).
     Missing or malformed cookie → **302** to `/staging-toegang?next=<return path>`. Paths
     under `/api/` get **401** `{"code":"gate_session_required"}` instead of a redirect.
   - A database error is **503** `{"code":"gate_unavailable"}` (logged
     `[staging-gate] store_error <error name>`); the request never passes.
5. **Pass-through**: the pre-existing middleware logic runs (Clerk, `/admin` redirect, admin
   CSP), then the gate stamps every response on this host, redirects and errors included,
   with `Cache-Control: no-store` and `X-Robots-Tag: noindex, nofollow`. The CMS media route
   separately emits `no-store` on the exact staging host instead of its normal year-long
   public cache policy. Local production-mode probing showed `/_next/image` would otherwise
   overwrite the middleware's `no-store` with `public, max-age=14400`; `next.config.ts`
   therefore disables optimization on staging-branch preview builds and the gate denies the
   optimizer endpoint. Arend must still prove Vercel's CDN does not serve an **old cached**
   optimizer URL before the hostname protection exception is made.

Revocation is therefore effective on the next request: the check is authoritative per
request, there is no cache and no expiry-only fallback. The price is a Neon HTTP lookup and
conditional UPDATE per authenticated request, on staging only.

## 3. Accounts and sessions

Tables (`src/db/cms-staging-gate-schema.ts`, migration `drizzle/0013_cms_staging_gate.sql`,
guarded like the others):

- `cms_staging_gate_accounts`: `id uuid pk`, `identifier text unique` (trimmed, lower-cased,
  a valid e-mail address or a 3–64 character username of `a-z 0-9 . _ -`), `password_hash text` (scrypt via
  `src/lib/cms/password.ts`), `note text default ''` (who it is for / approval reference),
  `created_at timestamptz`, `revoked_at timestamptz null`.
- `cms_staging_gate_sessions`: `id uuid pk`, `account_id uuid` → accounts (cascade),
  `token_hash text unique` (the tag above), `created_at`, `last_used_at`, `revoked_at null`.
  No IP, no user agent.

Rules (Max's defaults): individual named accounts for humans only, approved by Toshoni,
provisioned and revoked by Arend with `npm run staging:access` (`--add`, `--list`,
`--reset-password`, `--revoke`; writes to Neon need `--expect-host`). No shared login, no
self-signup, and **no link to CMS users**: a CMS password never works here and the gate never
reads `cms_users`. Revoking an account sets `revoked_at` and revokes its sessions; because the
middleware checks both columns per request, every browser of that person is out on its next
request.

Passwords are **vault-first** for the live staging handoff: Arend first creates (or rotates)
the password in the reviewer's vault item, which stays the source of truth and is what gets
shared with the reviewer, and then pipes it into `--add` or `--reset-password` with
`--password-stdin` (runbook §20 step 5). In that mode the CLI
(`scripts/staging-access.mts`, rules in `src/lib/staging-gate/password-stdin.ts`):

- never takes a password from its arguments or an environment variable; an unknown option
  (`--password=…`), `--password-stdin=…` and any stray argument are refused without repeating
  the value (`scripts/lib/cli-options.mts`);
- refuses to read from a terminal (`process.stdin.isTTY`): the password comes from the secret
  store, not the keyboard;
- reads at most 802 bytes (`PASSWORD_STDIN_MAX_BYTES`: 200 characters of 4-byte UTF-8 plus a
  `\r\n`) and stops reading at the first chunk past that bound;
- requires strict UTF-8 and strips exactly one trailing `\n` or `\r\n` (what `op read` adds)
  and nothing else, so spaces stay part of the password; a second line, control characters
  (C0 and C1) and a byte order mark are refused;
- applies the CMS strength rules (`validatePasswordStrength()`: 12–200 characters with a
  lower-case letter, an upper-case letter and a digit), in the CLI and again in the account
  core before any query;
- stores only the scrypt hash and never prints, logs or returns the password: the core's
  result has no `password` key in this mode. Every refusal is a fixed message without input,
  and a failing write of the hash reports only its SQLSTATE, because Drizzle's error text
  repeats the query parameters.

Without `--password-stdin` the CLI keeps its earlier behaviour: it generates a password and
prints it once. That mode stays for compatibility and local use; it is not the staging
handoff.

Login (`src/lib/staging-gate/auth.ts`, dedicated Route Handler
`src/app/api/staging-gate/login/route.ts`):

- Fields `identifier`, `password`, hidden `next`. Rate limit first, with the shared
  `reserveRateLimit()` on `cms_rate_limits`: 10 attempts per 15 minutes for `gate:ip:<ip>`
  (when the IP is known) and for `gate:id:<SHA-256 of the identifier>`; refused →
  "Te veel pogingen. Probeer het over een kwartier opnieuw." Every attempt counts.
- Unknown identifier, revoked account and wrong password all take the scrypt path (dummy hash
  when there is no account) and all answer the same Dutch sentence: "Aanmelden is niet
  gelukt. Controleer je gegevens." No enumeration.
- Success: new session row, cookie `__Host-staging-gate` (`httpOnly`, `secure`, `sameSite:
  'lax'`, `path: '/'`, `maxAge` 8 h), redirect to `safeReturnPath(next)`.
- The ordinary HTML form posts only URL-encoded data to the dedicated handler. It requires
  a same-origin HTTPS `Origin`, rejects `Next-Action`, bounds the body to 32 KiB and
  redirects back with a fixed non-secret `fout` code on failure. No public-page Server Action
  is accepted; `POST /staging-toegang` is gated before action dispatch.
- `safeReturnPath()` (`policy.ts`): a string of at most 2048 characters that starts with a
  single `/`, contains no `\` and no control characters, parses as same-origin, and does not
  start with `/staging-toegang`; the result is `pathname + search`. Anything else → `/`.
- The login page (`src/app/staging-toegang/page.tsx`, `force-dynamic`, `noindex`) answers
  404 on every host where the gate is inactive, and sends a visitor who already holds a valid
  session on to the return path. Max's copy: title "Stagingomgeving", explanation
  "Deze testomgeving is alleen toegankelijk voor uitgenodigde reviewers.", fields
  "E-mailadres of gebruikersnaam" and "Wachtwoord", action "Inloggen", help
  "Toegang nodig of lukt inloggen niet? Neem contact op met Toshoni.", distinction
  "Dit is niet de login voor het CMS." `?reden=verlopen` shows
  "Je sessie is verlopen. Log opnieuw in om verder te gaan."; `?reden=afgemeld` shows
  "Je bent uitgelogd."
- Logout: `/staging-toegang/afmelden` (gated page with a POST form, never a GET link). The
  action revokes the session row by recomputed tag, clears the cookie and redirects to
  `/staging-toegang?reden=afgemeld` without a return path. Protected responses are `no-store`
  and the httpOnly cookie changes on logout. If revocation storage fails, logout errors and
  does **not** claim success or clear the cookie. Browser back/refresh is an exact-build
  acceptance check, not assumed safe from source inspection alone.
- A small client-only banner (`src/components/staging-gate/banner.tsx`, mounted in the root
  layout) shows "Stagingomgeving · Uitloggen" when `window.location.hostname` is the staging
  host. It is UI only, renders nothing elsewhere and nothing on the server.

CMS sessions, provider two-step verification, Clerk and the Google OAuth flow are untouched:
they run behind the gate with their own cookies. A provider whose gate session expires in
the middle of the Google redirect is sent to the gate login with the callback URL as return
path and continues after signing in.

## 4. Secrets and variables

| Variable | Scope | Purpose |
| --- | --- | --- |
| `STAGING_GATE_SECRET` | Preview, branch `staging`, Sensitive | HMAC key of the session cookie tags (≥ 32 characters, `openssl rand -base64 48`). Rotating it signs every gate session out. |
| `STAGING_GATE_HEALTH_TOKEN` | Preview, branch `staging`, Sensitive; a copy in Arend's secret store | Machine token for `site-health` (≥ 32 characters, `openssl rand -base64 48`, different from the secret). Grants staging-wide GET/HEAD gate access; no POST, no browser session. |
| `VERCEL_GIT_COMMIT_REF` | set by Vercel (system variables exposed) | Branch marker; the gate refuses to activate without `staging`. |

Secrets never appear in code, URLs, logs or responses. Reviewer passwords live in the vault
first and reach the CLI only on stdin (`--password-stdin`, §3): never in argv (npm echoes the
command line and the shell keeps history), never in an environment variable, never printed.
Only the fallback mode prints a password (a generated one, once); the CLI never prints a hash.

## 5. Tests

- Unit (vitest): `config`, `token`, `policy`, `store-edge` (fake executor) and the
  middleware half (`NextRequest` in, decision out), including: other hosts untouched,
  misconfiguration → 503 on the exact host, public paths, robots, machine token (valid,
  invalid, wrong method), cookie forgery without a query, revoked/expired/idle sessions,
  activity touch, return-path validation (open redirects, backslashes, loops), header
  stamping, `/api/` 401 shape, the old matcher's exclusions reproduced exactly.
  Vault-first input (`password-stdin.test.ts`): the bounded read stops at the first chunk past
  802 bytes, one trailing newline stripped (a second is multi-line), embedded `\n`/`\r`,
  empty, control characters, byte order mark, malformed UTF-8, the strength reasons, a strong
  Unicode password accepted as given, no input in any refusal, the terminal rule. The shared
  option guards (`scripts/lib/cli-options.test.ts`): unknown options, `--flag=value` on a
  flag and stray arguments are refused without repeating the value.
- Integration (`cms:selftest` section 20, `scripts/selftest/staging-gate.mts`): migration
  0013 twice, account CLI operations, login core (unknown/wrong/revoked identical, rate limit,
  success), the edge store against PGlite (lookup, touch, revoke → invalid on the next
  lookup, absolute and idle expiry), logout, prune. Part G (`staging-gate-stdin.mts`): a
  provided password through the core (stored as a verifying hash, no `password` key in the
  result, nothing in the log; weak, empty, multi-line and control characters refused before
  any query with nothing changed; reset ends every session; a failing write shows only the
  SQLSTATE; sign-in with the provided password, not the old one) and the real CLI in child
  processes (piped password never printed, the generated fallback still printed once, refused
  input exits 1 before any database work without repeating it).
- Smoke (Arend, after deploy): see the runbook.

## 6. Rollout and rollback

The steps, owners and checks are in `staging-runbook.md` §20; the variables in
`../DEPLOYMENT.md` §5. The sequencing rule: Vercel Authentication (SSO) stays on for the
staging host until the exact build is verified behind it (Niels's evidence, Max's acceptance)
**and** Toshoni has separately approved the Deployment Protection Exception for
`staging.debikefitstudio.be` only. Rollback removes that exception **first**, so Vercel
Authentication covers the host again before anything else changes.

`--expect-host` on `npm run staging:access` is an operator cross-check that the
`DATABASE_URL` host is the one the operator intends to write to. It is not proof that the URL
is the staging database: the same wrong host typed in both places passes. Arend checks the
host against the Neon `Staging` branch record before any write.
