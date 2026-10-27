# Staging runbook — De Bikefit Studio

How the Dutch public site, the `/admin` CMS and online booking are brought up and
updated on **staging**, plus the checklist before production. Every command is
copy-pasteable and contains **no secrets**: each secret or connection string is passed
inline at the moment it is needed and lives only in 1Password and Vercel.

**Who runs this.** Deployments are executed by the DevOps agent **Arend** (OpenClaw).
Previews and staging go automatically once the release gate is green; production, the
production database and DNS only after an explicit go from Toshoni (`../DEPLOYMENT.md` §2).
Arend records every deployment in its infrastructure log, outside this repository. A person
with Vercel and Neon access can follow the same steps. The changes of 13 Oct 2026 each have their
own rollout section: the offer redesign §9, the booking CTA patch §10, the page cleanup §11, the
gift voucher §12, the e-mail service in the admin §13 (migration 0004), admin two-step
verification §14 (migration 0005 and a new secret) and admin session limits, step-up and the
admin CSP §15 (migration 0006); 0007 (race-free second-step rate limits) has no section of its
own. Rolling 0004–0007 out together, as the security release does: the combined order in §16.
Two-step verification for providers (16 Oct 2026, no migration, no new secret): §17.
Beheer → Aanbod (16 Oct 2026, migrations 0009 and 0010 before the build): §18. The prices (20 Oct)
§22, the extra's §23 and Toshoni's corrections of 27 Oct 2026 (settings, pages, copy, youth package,
Toshoni; migration 0017 before the build) §24.

Environments, the Hobby-plan staging setup and the full env var contract:
[`../DEPLOYMENT.md`](../DEPLOYMENT.md). Google, GA4 and Resend setup, GDPR and retention:
[`booking-runbook.md`](./booking-runbook.md). The Qarakter webshop's own staging concerns
(Clerk/Stripe test keys, prod→staging refresh) are in `DEPLOYMENT.md` §6–8.

---

## 0. Before you start

| You need | Why |
| --- | --- |
| Neon project `Qarakter` access | the `Staging` branch and its pooled URL |
| Vercel project `de-bikefit-studio` access (Member or above) | branch-scoped env vars and redeploys |
| A local clone + `npm ci` in `website/` | migrate/bootstrap/seed scripts run from a shell, not from Vercel |
| Node 22.15+ | `cms-seed.mts` and `cms-selftest.mts` use `module.registerHooks()` |

The database scripts are **run by hand, one at a time**, pointed at the staging database
(Arend: inside `with-db-url.sh`). They are not part of the Vercel build on purpose: a build
step that writes to the database would run on every deploy. Do not run them while a
`next dev` is pointed at the same database.

---

## 1. Neon — the `Staging` branch

Project `Qarakter` already has a branch **`Staging`**, a copy-on-write child of
**`production`**. If it ever has to be recreated: Neon console → project → **Branches → New
branch**, name `Staging`, parent `production`.

Open the branch → **Connection string** → **Pooled** (host contains `-pooler`). That string
is staging's `DATABASE_URL`. Keep it in 1Password; never paste it into a file in the
repository.

---

## 2. Vercel — staging environment variables

The team is on the **Hobby plan: no custom environments**. Staging = Preview deployments of
the `staging` branch. Vercel → project → **Settings → Environment Variables** → environment
**Preview**, **git branch `staging`**. Mark secrets as *Sensitive*. Names only below; values
come from 1Password.

| Variable | Staging value | Notes |
| --- | --- | --- |
| `DATABASE_URL` | pooled URL of Neon `Staging` (§1) | Without it the app tries PGlite, which `src/db/cms.ts` refuses on any deployment (`NODE_ENV=production`). |
| `CMS_SESSION_SECRET` | `openssl rand -base64 48`, staging's own | Rotating it signs every CMS user out, makes an e-mail API key stored in `/admin/email` unreadable (§13) and, without a token key, disconnects Google. Never reuse production's. |
| `CMS_MFA_ENCRYPTION_KEY` | `openssl rand -base64 32`, staging's own | **Required** for admin and provider sign-in (two-step verification, §14, §17); set it before the deploy that brings it (§16). Treat as permanent: rotating it forces every admin and provider to re-enrol with a recovery code. Never reuse production's. |
| `NEXT_PUBLIC_SITE_URL` | `https://staging.debikefitstudio.be` (until 20 Oct 2026 the Vercel alias `https://de-bikefit-studio-git-staging-toshoni.vercel.app`; Toshoni: e-mail links must carry the real domain) | Canonicals, sitemap, OG, e-mail links, OAuth redirect URI (register the callback of this origin on the Google client too). |
| `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET` | the shared web client | Register exactly `https://de-bikefit-studio-git-staging-toshoni.vercel.app/api/google/oauth/callback` on the client; scope Preview, branch `staging` only (`booking-runbook.md` §7.3). |
| `GOOGLE_TOKEN_ENCRYPTION_KEY` | `openssl rand -base64 32`, staging's own | Set before the first connection: base64 of exactly 32 bytes (`booking-runbook.md` §7.3). Without it a key is derived from `CMS_SESSION_SECRET`; treat as permanent. |
| `RESEND_API_KEY` | staging key | Optional: an admin can store it in `/admin/email` instead (§13); env wins. Without a key anywhere mails are logged and skipped. |
| `EMAIL_FROM`, `EMAIL_REPLY_TO` | sender on the verified domain, reply-to | Optional, same as above. |
| `GIFT_VOUCHER_RECIPIENT` | **empty** until a working order inbox is chosen | Optional, same as above (`/admin/email` → *Ontvanger bestellingen en aanvragen*). Unset in both places = gift voucher orders are "niet verstuurd" (§12). |
| `GA4_PROPERTY_ID`, `GA4_SERVICE_ACCOUNT_JSON` | property id, service-account key | Admin analytics panel. Optional. |
| `NEXT_PUBLIC_GA4_MEASUREMENT_ID` | **empty**, unless testing the cookie banner | Build-time; the tag also needs *Analytics ingeschakeld* in the admin. |

**Never put `CMS_BOOTSTRAP_PASSWORD` in Vercel.** It is needed once, by `cms:bootstrap` in
§3.2, on the machine that runs it. The running app never reads it.

Every change to a variable needs a **redeploy** to take effect. The webshop keys are only
needed if the shop must work on staging (`DEPLOYMENT.md` §6); the CMS and booking need none.

---

## 3. Prepare a fresh staging database

For a new or reset `Staging` branch. Run from `website/` with the staging URL supplied
inline, so it never lands in a file.

```bash
cd website
npm ci
```

### 3.1 Apply migrations

```bash
DATABASE_URL='<staging pooled url>' npm run db:migrate
```

| File | Effect on staging |
| --- | --- |
| `0000_webshop_baseline.sql` | Guarded no-op against the existing webshop tables. |
| `0001_cms_foundation.sql` | Two enums and eleven `cms_*` tables. |
| `0002_role_provider.sql` | Adds `provider` to `cms_role`. |
| `0003_booking.sql` | The eight booking tables. |
| `0004_integration_settings.sql` | `cms_integration_settings`, the e-mail service set up in `/admin/email` (§13). |
| `0005_cms_admin_mfa.sql` | Four `cms_mfa_*` tables and `cms_sessions.mfa_verified_at` (§14). |
| `0006_cms_session_limits.sql` | `cms_sessions.absolute_expires_at` and `cms_sessions.reauthenticated_at` (§15). |
| `0007_cms_mfa_rate_limits.sql` | `cms_mfa_rate_limits` and the unique index `cms_mfa_challenges_user_id_unique_idx` (§16). |
| `0008_cms_rate_limits.sql` | `cms_rate_limits`, the race-free public booking limit (`booking-architecture.md` §9). Needed **before** a build that contains it serves `/afspraak`: without the table every booking attempt answers "Er ging iets mis bij het boeken" (`[booking] create_failed`). |
| `0009_cms_service_choice_label.sql` | `cms_services.choice_label` (text, default `''`), the label of a service under an offer ("Volwassene", "Jeugd"; `booking-architecture.md` §14). One guarded `ADD COLUMN`, no data change. Needed **before** a build that contains it: without the column `/afspraak` shows "Online boeken lukt op dit moment niet" and Admin → Diensten fails. Then run §3.2 once to fill the two labels. |
| `0010_cms_offerings.sql` | `cms_offerings` and `cms_offering_variants`, the settings of Beheer → Aanbod (`cms-architecture.md` §15). Two guarded `CREATE TABLE`s, their FKs and indexes; no data change. Needed **before** a build that contains it: until then every offer page derives its settings from its block (as before), Beheer → Aanbod cannot save, and the booking actions refuse every service (fail closed, like 0008). Then, optionally, §18. |
| `0011_cms_offerings_content.sql` | The offering IS the offer (17 Oct 2026, §19): guarded `ADD COLUMN IF NOT EXISTS` for its copy (slug, category, order, title, summary, intro, Doel, Inhoud, extra's, Duur, button label, image, meta description), `page_id` nullable, a unique index on (locale, slug). No data change; `cms:migrate-aanbod` fills the rows from the former offer pages. Apply before the build, then §19. |
| `0012_cms_provider_locations_assignment.sql` | Several locations per provider and "Iedereen" bookings assigned by the beheerder (17 Oct 2026, `booking-architecture.md` §16): `cms_business_hours.location_id`, `cms_bookings.assignment` (default `assigned`) and `assigned_at`, all guarded; every existing booking stays `assigned`. Needed **before** the build: it selects the columns on every availability request. |
| `0013_cms_staging_gate.sql` | The first-party staging access gate (§20): `cms_staging_gate_accounts` and `cms_staging_gate_sessions` with an FK (cascade) and two indexes. Guarded, no data change. Needed **before** the build on the staging host: without the tables the gate answers 503 `gate_unavailable`. Other hosts never read them. |
| `0014_cms_booking_followups.sql` | Reminder and review mails (20 Oct 2026, `booking-architecture.md` §17): `cms_bookings.reminder_sent_at` and `review_requested_at`, and the table `cms_reviews` (token hash, snapshot of the customer and the appointment, score, decision). Guarded, no data change. Needed **before** the build: every booking list selects the two columns. |
| `0015_cms_offering_addons.sql` | Extra's (20 Oct 2026, §23): `cms_offerings.is_addon`, `sold_alone` and `addon_minutes`, the table `cms_offering_addons` (which extras an offering allows) and `cms_booking_addons` (a snapshot of the extras of a booking). Guarded, no data change; `cms:patch-aanbod-extras` fills in the set. Needed **before** the build: every offering read selects the columns. |
| `0016_cms_offering_addon_options.sql` | Choices within an extra (§23): `cms_offerings.addon_options` (jsonb, default `[]`). Guarded. Needed **before** the build. |
| `0017_cms_offering_price_text.sql` | The free-text Kostprijs of an offering that is asked for (27 Oct 2026, §24): `cms_offerings.price_text` (default `''`). Guarded, no data change (the text of *Bikefit – tweede bezoek* comes with `cms:patch-aanbod-correcties`). Needed **before** the build: every offering read selects the column. |

All additive and guarded (no `DROP`, `TRUNCATE` or webshop `ALTER`); already-applied files
are skipped. Expect `→ driver: neon-http (<host>)` and `✓ migrations applied to Neon`. The
current build needs 0005, 0006 and 0007 before anyone signs in to `/admin` (§16), and 0015, 0016
and 0017 before it serves an offer (the offerings are read with their columns on every page).

### 3.2 Bootstrap

```bash
DATABASE_URL='<staging pooled url>' \
CMS_BOOTSTRAP_PASSWORD='<a strong throwaway password>' \
npm run cms:bootstrap
```

Creates only what is missing: the admin `contact@toshoni.be` (`must_change_password =
true`), the six `nl` site settings (including `seo.allowIndexing = false` and the `booking`
rules), empty `main` and `footer` menus, the locations "De Bikefit Studio, Ninove" and "Bij
jou thuis", the three services (Volwassenenfit, Jeugdfit – eenmalig, Jeugdfit – volledig pakket;
the last since 27 Oct 2026, so a database that lacks it gets it here, unsubscribed until
`cms:seed-booking` runs again) and the nine offerings of Beheer →
Aanbod (the offers of the brief, shown, Bikefit – huidige fiets booked as Volwassenenfit and the two
Jeugdfit services; Gezinspakket, Fit aan huis and Inspanningstest are retired since 17 Oct 2026: not
created, deactivated by `cms:migrate-aanbod` where they exist; §19). Never overwrites anything. On a database
that already has the services, the only change it makes is to fill an **empty** `choice_label`
of `volwassenenfit` ("Volwassene") and `jeugdfit` ("Jeugd – eenmalig") after migration 0009 (printed as
`~ service nl/… : empty choice label set to …`); a label an admin typed is left alone. An
existing offering (by slug) is left alone too.

### 3.3 Seed content and the first provider

```bash
DATABASE_URL='<staging pooled url>' npm run cms:seed
DATABASE_URL='<staging pooled url>' npm run cms:seed-booking
```

`cms:seed` writes as the oldest active admin who has chosen their own password and set up
two-step verification: a session with a temporary password may do nothing but change it, and
an admin without an authenticator gets no session at all (`cms-architecture.md` §4). On a
fresh database, first sign in as `contact@toshoni.be`, replace the bootstrap password and set
up the authenticator (§6, steps 1–2, on a deployment that uses this database); until then
`cms:seed` stops with that explanation and writes nothing. `cms:seed-booking` writes directly
and does not need it.

`cms:seed` creates, fills and **publishes** the Dutch pages (home, `/aanbod`, `/cadeaubon`,
`/voor-wie`, `/bikefit`, `/ons-team`, `/veelgestelde-vragen`, `/afspraak`, `/privacy`,
`/algemene-voorwaarden`), both menus and the redirects (`/bikefit.html`, `/over-ons`,
`/aanbod/cadeaubon`, `/contact`), through the real write API. The offer itself is not pages but
the offerings `cms:bootstrap` wrote (§19). Once real
editing has started use `-- --only-missing` or `-- --refresh-slug <slug>` instead of a full
run: a full run overwrites the draft blocks of every seeded page.

`cms:seed-booking` creates the provider `toshoni@gmail.com` (role `provider`, forced password
change and, at the same first sign-in, two-step verification (§17); the temporary password is
**printed once** — hand it over directly, never through a log or chat transcript: whoever holds
it can enrol the authenticator), its profile, hours Mon–Fri 09–18 and Sat 09–13, and
subscriptions to the three services (the fits). The public booking widget lists no services until a
provider exists.

---

## 4. Rolling out booking to the existing staging database

Staging already runs the CMS (migrations `0000`–`0001`, admin, six pages). The booking
release adds migrations, data, pages and variables. Order matters:

1. **Migrate** — `DATABASE_URL='<staging pooled url>' npm run db:migrate` applies `0002`
   and `0003`.
2. **Bootstrap** — `… npm run cms:bootstrap` (with `CMS_BOOTSTRAP_PASSWORD` inline; the
   existing admin is left alone) adds the `booking` setting, both locations and the five
   services.
3. **Seed booking** — `… npm run cms:seed-booking` creates the first provider.
4. **Contact e-mail** — if known, set *Instellingen → Contact → e-mail* first: the legal
   texts take their address from it at seed time (`booking-runbook.md` §11.2).
5. **Refresh the three pages**, one at a time:

   ```bash
   DATABASE_URL='<staging pooled url>' npm run cms:seed -- --refresh-slug afspraak
   DATABASE_URL='<staging pooled url>' npm run cms:seed -- --refresh-slug privacy
   DATABASE_URL='<staging pooled url>' npm run cms:seed -- --refresh-slug algemene-voorwaarden
   ```

   Each replaces only that page's blocks and republishes it (a missing page is created).
6. **Env vars** — add the new staging variables from §2 (Google OAuth, token key, Resend,
   GA4 as wanted).
7. **Deploy** — merge to `staging` (or redeploy if the code is already there) so one build
   picks up the code and the new variables.
8. **Smoke** — Arend runs `site-health` on the staging alias; then the manual checks in §6
   and `booking-runbook.md` §9.

> The build that is live before step 7 does not know the `booking` block, so `/afspraak`
> answers 404 from step 5 until the new build is live. Keep steps 5–7 close together, or run
> step 5 after step 7.

---

## 5. Deploy

**Git (standard).** Merge the reviewed feature branch into `staging` and push. The Vercel Git
integration builds a Preview deployment of `staging` with the branch-scoped variables; the
alias `https://de-bikefit-studio-git-staging-toshoni.vercel.app` moves to it.

**Redeploy without a code change** (after changing variables): Vercel → Deployments → latest
`staging` deployment → **Redeploy**.

The build needs **no database**: every CMS-backed route is `force-dynamic`, so `next build`
never queries Neon.

Production (`main`) deploys the same way, only after an explicit go.

---

## 6. First login and checks

1. Open `<staging alias>/admin/login` and sign in as `contact@toshoni.be` with the
   bootstrap password.
2. You are sent to `/admin/mfa` and cannot reach anything else until you set a new
   password (≥ 12 characters, lower case, upper case and a digit) and then link an
   authenticator (1Password or a free app): scan the QR code, type the six-digit code, and
   store the ten recovery codes shown once (in 1Password, with the account). Only then is
   there a session. Every later sign-in asks for the password and a code.
3. On the dashboard, check:
   - **Pagina's** — the seventeen pages from §3.3, all "Gepubliceerd".
   - **Locaties**, **Aanbieders**, **Aanbod** — three fit services (under Aanbod), two locations, one provider.
   - **Instellingen → SEO** — `allowIndexing` is **off**; `<alias>/robots.txt` says
     `Disallow: /` and pages carry `<meta name="robots" content="noindex, nofollow">`.
   - `/afspraak` shows the booking widget; `/privacy` and `/algemene-voorwaarden` load and
     are linked from the footer.
4. Create editor accounts under **Gebruikers** (role `editor`); they get a forced password
   change on first login too (no two-step verification for editors).
5. The provider signs in, changes the password, sets up two-step verification exactly as in
   step 2 (§17) and connects Google under **Mijn agenda** (`booking-runbook.md` §8).

**Keep `seo.allowIndexing` off for the entire life of staging.**

---

## 7. Rollback

### Code

Baseline tag **`webshop-baseline-2026-09-23`**
(`a793d1e8105bf125087fd3e78660eb5010726b8d`) is the last commit before any CMS work.

```bash
# revert just the app directory to the baseline
git checkout webshop-baseline-2026-09-23 -- website

# or restore the entire repository from the offline bundle
git clone '<workspace>/.winston/repos/de-bikefit-studio/baselines/webshop-baseline-2026-09-23.bundle' restored
```

The bundle sits at `.winston/repos/de-bikefit-studio/baselines/` relative to the workspace
root (the folder that contains `de-bikefit-studio/`); verify with
`git bundle verify '<path>/webshop-baseline-2026-09-23.bundle'`.

Faster on Vercel: **Promote** or redeploy an earlier deployment from the Deployments tab.

### Database

**Nothing needs undoing.** All migrations (0000–0007) are additive; the webshop tables and data
are identical before and after, and rolling back the code alone restores the previous
behaviour. Older code ignores the booking tables, `cms_integration_settings`, the `cms_mfa_*`
tables and the new `cms_sessions` columns; a page that uses the `booking` block reads as
unpublished on code that predates it.

The `cms_*` tables can stay in place. To remove them, drop the twenty-five `cms_*` tables plus
the `cms_role` and `cms_page_status` enum types. For a clean slate, reset the Neon `Staging`
branch from its parent (`DEPLOYMENT.md` §7, mind the anonymisation warning) and re-run §3.

---

## 8. Before PRODUCTION — checklist

Staging can run as-is. Production must not go live until every box is ticked, and every
production step (database, env vars, DNS, deploy) needs an explicit go; Arend executes.

**Google, e-mail, analytics**

- [ ] **Google Cloud OAuth client** exists with the production redirect URI
      `<production origin>/api/google/oauth/callback` registered exactly, and the **OAuth
      consent screen is published** ("In production"); otherwise refresh tokens expire after
      7 days (`booking-runbook.md` §3–4).
- [ ] **Resend domain verified** (SPF, DKIM, DMARC) and a production API key created
      (`booking-runbook.md` §6).
- [ ] **GA4 property** with a web stream for the production domain, and the **service
      account** added as Viewer on the property (`booking-runbook.md` §5).

**Environment variables (Vercel → Production)**

- [ ] `DATABASE_URL` (Neon `production`, pooled), a fresh `CMS_SESSION_SECRET` (never
      staging's), a fresh `CMS_MFA_ENCRYPTION_KEY` (never staging's; set before the deploy,
      §16), `NEXT_PUBLIC_SITE_URL` = the production origin.
- [ ] `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET`, a production-only
      `GOOGLE_TOKEN_ENCRYPTION_KEY`, `RESEND_API_KEY`, `EMAIL_FROM`, `EMAIL_REPLY_TO`,
      `NEXT_PUBLIC_GA4_MEASUREMENT_ID`, `GA4_SERVICE_ACCOUNT_JSON`, optionally
      `GA4_PROPERTY_ID`. Staging keeps its own values. The e-mail values and the gift voucher
      order inbox may instead be set by an admin in `/admin/email` (§13); an env value wins.

**Database (Neon `production`)**

- [ ] `db:migrate` (0000–0007, before the deploy that needs them, §16), then `cms:bootstrap`
      (change the admin password and set up two-step verification immediately), `cms:seed`,
      `cms:seed-booking` (the provider changes the password and sets up two-step verification
      at the first sign-in, §17) — or, if production already has content,
      `cms:seed -- --refresh-slug` for **`afspraak`**, **`privacy`** and
      **`algemene-voorwaarden`**.
- [ ] **Retention** scheduled: `npm run cms:retention` monthly against production, dry run
      first, `-- --apply` after reading the counts (`booking-runbook.md` §11.3).

**Content and legal**

- [ ] **Public contact e-mail** set in *Instellingen → Contact*, then the two legal pages
      refreshed so the texts carry it (`booking-runbook.md` §11.2). Also street address and
      postal code, so the `LocalBusiness` JSON-LD is complete (set by `cms:patch-aanbod-correcties`
      since 27 Oct 2026, §24).
- [ ] **Lawyer review** of the privacy statement and the terms, and the processor agreements
      and verwerkingsregister done (`booking-runbook.md` §11.5).
- [ ] **VAT number** and legal name under *Instellingen → Organisatie*.
- [ ] **Placeholder testimonials** replaced with real, attributable reviews, or the block
      deleted (they are flagged `isPlaceholder` and render nothing).
- [ ] **Pricing** decided: real prices entered and the flag cleared, or deliberately hidden.
- [ ] **Photography** replaced with real studio photos via *Media*, Dutch alt text on every
      image.
- [ ] **Content-Security-Policy**: the admin CSP enforced and validated on staging (§15,
      `admin-csp.md`); public-site CSP decided (not set yet; `booking-runbook.md` §11.4).

**Go-live**

- [ ] **DNS**: add the domain in Vercel, let it issue the certificate, then switch the
      record; `NEXT_PUBLIC_SITE_URL` must equal that domain.
- [ ] **Flip `seo.allowIndexing` to `true`** on the production database only (Instellingen →
      SEO → *Indexeren toestaan*; no deploy needed); verify `/robots.txt` switches to `Allow: /`
      with `/admin`, `/api` and the legacy webshop paths disallowed, the studio pages lose
      `noindex`, and `/shop` keeps it (`cms-architecture.md` §5, "allowIndexing").
- [ ] **`/sitemap.xml`** lists exactly the pages to index; submit it in Google Search
      Console.
- [ ] **End-to-end check** on production as in `booking-runbook.md` §9 (free/busy, event,
      mail, cancel, consent before GA4, dashboard).

---

## 9. Rolling out the offer redesign (Aanbod, 13 Oct 2026)

Brings an existing staging database to the redesign: `/`, `/aanbod` (since 17 Oct 2026 the offerings are rows, §19, not pages),
`/voor-wie`, `/bikefit`, `/ons-team`, the `main` and `footer` menus, `/over-ons` unpublished
(row and snapshot kept) with a 301 to `/ons-team`. Nothing else: no settings (contact, SEO,
analytics), no legal pages, no `/afspraak`, `/contact` or `/veelgestelde-vragen`, no users, and
**no booking data** — the five service ids, providers, subscriptions and bookings are verified
unchanged before and after.

**New migrations: none.** The new block types are validated in code (`cms_blocks.type` is
`text`). **Do not run a full `cms:seed`** on staging: it would overwrite every seeded page.

Order (the old build cannot render the new block types, so code goes first):

1. **Release gate** on the exact SHA (six steps).
2. **Deploy** the feature/staging push; wait for the staging build to be READY. The new code
   renders the old content unchanged (verified locally; `/aanbod` and `/ons-team` answer 404
   until step 5).
3. **Dry run** — writes nothing: no admin session, no audit entry, and the planner runs on a
   database handle that throws on any write (`scripts/lib/aanbod-rollout-run.mts`; self-test
   section 15 proves it). Prints `would act as <admin>`, every page/menu/redirect action, the
   reasons, any blockers (`!`) and the offer ↔ booking report:

   ```bash
   DATABASE_URL='<staging pooled url>' npm run cms:rollout-aanbod
   ```

   Expect: `~` for `/` and `/bikefit`, `+` for the three new pages, `~ menu main/footer`,
   `~ page /over-ons — unpublish`, `+ redirect /over-ons → /ons-team`, "Bikefit – huidige
   fiets — online booking", the six others "enquiry", and the booking counts. A line with `!`
   (unpublished draft edits on an overwritten page, a translation-group clash, or an existing
   `/over-ons` redirect to somewhere else) blocks the apply: resolve it, or for drafts pass
   `--allow-draft-overwrite` once you have checked them (the backup keeps them either way).
4. **Neon snapshot** — create a branch from `Staging` (e.g. `staging-pre-aanbod-2026-10-13`).
5. **Apply**:

   ```bash
   DATABASE_URL='<staging pooled url>' npm run cms:rollout-aanbod -- --apply \
     --expect-host '<host part of the staging DATABASE_URL>'
   ```

   `--expect-host` must equal the host the script prints on its first line (`→ driver:
   neon-http (<host>)`); any other host is refused, so the command cannot hit another branch
   by accident. It writes a JSON backup of every row it will overwrite to
   `website/.rollout-backups/aanbod-rollout-<timestamp>.json` **before** the first write (keep
   it with the deploy log; it holds page and menu content, no personal data or secrets), then
   publishes the pages one by one, replaces both menus, creates the redirect, unpublishes
   `/over-ons`, and checks the booking tables. Audit log: `rollout.aanbod.overwrite` per
   overwritten page (old draft and live block list + backup name), the repo's own
   `block.delete` / `page.publish` / `navigation.update` / `redirect.create` /
   `page.unpublish` entries, and `rollout.aanbod.apply`. Running it again prints "nothing to
   do".
6. **Cache.** The script writes outside the app, so the app's tag cache is not busted: pages,
   menus and redirects switch over within **5 minutes** (the readers' fallback revalidation),
   and the first request after that may still serve the old version once. Wait 5 minutes,
   load each page twice, then verify. (A redeploy does not reliably clear Vercel's data cache.)
7. **Verify** on the stable alias: `site-health`, plus `/aanbod` (two groups, seven cards,
   "Prijs op aanvraag"), the `/aanbod/<slug>` offerings (§19), `/voor-wie`, `/bikefit`,
   `/ons-team` (Robin and Goran: initials and "Een uitgebreid profiel volgt binnenkort."), `/over-ons` → 308 to `/ons-team`, the main menu (no Home), and
   `/afspraak?dienst=bikefit-huidige-fiets` (widget with Volwassenenfit/Jeugdfit, "Je boekt
   voor …") and `/afspraak?dienst=lactaattest` (contact prompt, no widget). Do not create
   bookings to test.

**Rollback.** Content: `npm run cms:rollout-aanbod -- --restore <backup.json> --expect-host
'<host>'` puts back the overwritten pages (fields, live snapshot and draft blocks), both menus,
re-publishes `/over-ons`, and unpublishes/disables what the rollout created (nothing is
deleted). Or restore the Neon snapshot branch from step 4. Code: redeploy the previous
staging deployment — but restore the content **first**, because old code cannot render the new
block types.

**Images.** The three temporary images ship in the build (`public/images/editorial/`); nothing
to upload. Replacing one later: `docs/editorial-images.md`.

## 10. Booking CTA patch ("Boek je bikefit" → /afspraak, 13 Oct 2026)

The accent band "Comfort is een keuze. Maak ze." on `/veelgestelde-vragen`, `/contact` and
`/afspraak` was seeded with a "Boek je bikefit →" button that dialled the phone. It now goes
where the header's "Afspraak maken" goes (`/afspraak`); seeds and block defaults are fixed in
code, and `npm run cms:patch-booking-cta` corrects pages that already exist. It changes only
the `href` of links labelled "Boek je bikefit…" that point at `tel:` or `#contact`; labels,
styles, the visible phone-number links and all other content stay as they are. Unpublished
pages are reported and left alone; settings, menus, redirects, media, users and booking tables
are never written (booking counts verified before and after). **No migrations. Never a full
`cms:seed` or a rerun of `cms:rollout-aanbod` for this.**

1. Deploy the code first (release gate, staging READY). The code change alone does not alter
   existing pages.
2. **Dry run** — read-only like §9 (no session, no audit, write-refusing db handle; self-test
   section 16):

   ```bash
   DATABASE_URL='<staging pooled url>' npm run cms:patch-booking-cta
   ```

   Expect `~ page /afspraak`, `~ page /contact`, `~ page /veelgestelde-vragen`, each
   `retarget 1 link(s)` with `"Boek je bikefit →" tel:+32473952633 → /afspraak`, then
   `dry run: run again with --apply to write`. A `!` line means that page has unpublished draft
   edits: the apply refuses (it never publishes an editor's draft). Publish or discard that
   draft in `/admin` first, then dry-run again. Any other page in the list: check it before
   applying.
3. **Apply** (Neon snapshot first is optional for a three-link change; the tool writes its own
   backup before the first write):

   ```bash
   DATABASE_URL='<staging pooled url>' npm run cms:patch-booking-cta -- --apply \
     --expect-host '<host part of the staging DATABASE_URL>'
   ```

   Backup: `website/.rollout-backups/booking-cta-patch-<timestamp>.json` (page rows and blocks
   only). It updates the blocks through the repo, publishes each page, re-checks that nothing
   is left to patch and the booking tables are unchanged, and logs `patch.booking-cta.apply`
   in the audit log. The short-lived admin session is revoked in every case. A second run
   prints "nothing to do".
4. **Verify** after 5 minutes (cache fallback, see §9 step 6): on the three pages the "Boek je
   bikefit" button links to `/afspraak`, the "0473 95 26 33" links still use `tel:`.

**Rollback:** `npm run cms:patch-booking-cta -- --restore <backup.json> --expect-host '<host>'`
puts the page rows and draft blocks back exactly (the backup uses the §9 format and restore).

---

## 11. Page cleanup patch (Toshoni's site review, 13 Oct 2026)

What the review changes, and where:

| Where | Code (deploy) | Content (`cms:patch-page-cleanup`) |
| --- | --- | --- |
| Top-level pages | no visible "Home / …" breadcrumb (JSON-LD stays; nested pages keep theirs), compact top spacing | — |
| `/aanbod`, `/voor-wie`, `/ons-team` | card/name headings become `<h2>` when the section has no title | kicker without "· Ninove"; no "Waar je ook staat" / "Wie je ontmoet" heading; "Junioren" → "Jeugd" and the new junior text; meta description of `/voor-wie` |
| `/afspraak` | widget headings follow the section level | page head, "Vier manieren om te boeken", the "Boek je bikefit" contact section and closing band removed; kicker "Online boeken" emptied; "Andere vraag?" (mail + phone) appended to "Voor je komt" |
| `/contact` | redirects keep the query string (`/contact?dienst=x` → `/afspraak?dienst=x`) | 301 → `/afspraak`, then the page unpublished (row, draft, snapshot kept) |
| Menus | — | "Contact" links → `/afspraak` (labels kept) |
| Footer | identity line and "Ninove · Op afspraak" note removed | settings `contact.email` `""` → `info@debikefitstudio.be` |

Every field edit names the value it expects (the seed at `staging@9c655fe`); a field an editor
changed since, a page with unpublished draft edits, an existing `/contact` redirect to another
target or a different e-mail address makes the patch refuse — no override. **No migrations.
Never a full `cms:seed`, `--refresh-slug` or a rerun of `cms:rollout-aanbod` for this.**

1. Deploy the code first (release gate, staging READY). Old content renders fine on the new
   code; the footer shows the e-mail only once step 3 has run.
2. **Dry run** (read-only like §9; self-test section 17):

   ```bash
   DATABASE_URL='<staging pooled url>' npm run cms:patch-page-cleanup
   ```

   Expected, in this order: `~ page /aanbod — 1 change(s)`, `~ page /voor-wie — 7 change(s)`,
   `~ page /ons-team — 3 change(s)`, `~ page /afspraak — 6 change(s)` (each change listed),
   `~ page /contact — unpublish`, `+ redirect /contact → /afspraak (301) — create`,
   `~ menu main` and `~ menu footer — "Contact" /contact → /afspraak`,
   `~ settings contact.email — "" → info@debikefitstudio.be`, the guard counts, then
   `dry run: run again with --apply to write`. **Stop and report on any `!` line.**
3. **Apply** (optional Neon snapshot first; the tool writes its own backup before the first
   write):

   ```bash
   DATABASE_URL='<staging pooled url>' npm run cms:patch-page-cleanup -- --apply \
     --expect-host '<host part of the staging DATABASE_URL>' --backup-dir <dir>
   ```

   Backup `page-cleanup-patch-<timestamp>.json`: rows and blocks of the five pages, both menus,
   and the contact settings value. Order: e-mail, pages (publish last per page), redirect, then
   unpublish `/contact`, menus. It verifies the published snapshots, the redirect, the menus
   and the e-mail, checks the booking tables are unchanged, audits `patch.page-cleanup.apply`
   and always revokes its session. A second dry run prints `dry run: nothing to do`.
4. **Verify** after the 5-minute cache window (load each page twice): see the smoke list in the
   work-block report; no bookings, no mail.

**Rollback:** `npm run cms:patch-page-cleanup -- --restore <backup.json> --expect-host '<host>'`
restores the five pages (re-publishing `/contact`) and both menus, disables the `/contact`
redirect and sets `contact.email` back (other contact fields untouched). Then, if needed, the
code: redeploy `staging@9c655fe`.


## 12. Gift voucher patch ("Cadeaubon", 13 Oct 2026) — superseded

**Superseded on 17 Oct 2026:** `cms:patch-cadeaubon` no longer exists. The voucher page is
seeded at `/cadeaubon` and its card is on the `/aanbod` catalogue block; an existing database
gets both through `cms:migrate-aanbod` (§19). Kept for the record.

What it adds, and where:

| Where | Code (deploy) | Content (`cms:patch-cadeaubon`) |
| --- | --- | --- |
| `/aanbod/cadeaubon` | block `giftVoucher` (order form + server action, `src/lib/gift-voucher/`) | page created with one `giftVoucher` block and published |
| `/aanbod` | category `overige` ("Overige"); a `giftVoucher` page becomes a card "Bedrag naar keuze" | catalogue groups: "Overige" appended after Bikefit and Begeleiding (exact-value guard) |

Nothing else: no settings, menus, redirects, booking tables, migrations or env vars. Home and
`/bikefit` keep their own groups. Independent of §11 (different fields); run it after §11.
The order recipient is **not** set by any patch: it is `/admin/email` (§13)
or env `GIFT_VOUCHER_RECIPIENT` (see `booking-runbook.md` § Cadeaubon), and stays empty until
a working inbox is chosen, so orders show "niet verstuurd". **Never a full `cms:seed` or
`--refresh-slug` for this.**

1. Deploy the code first (release gate, staging READY). Old content renders unchanged on the
   new code.
2. **Dry run** (read-only; self-test section 17b):

   ```bash
   DATABASE_URL='<staging pooled url>' npm run cms:patch-cadeaubon
   ```

   Expected: `+ page /aanbod/cadeaubon — create and publish`,
   `~ page /aanbod — 1 change(s), then publish` with `offerCatalogue.groups: "…meegroeit.\"}]…" →
   "…meegroeit.\"},{\"category\":\"overige\",\"title\":\"Overige\",\"lede\":\"\"}]…"`, the guard
   counts, then `dry run: run again with --apply to write`. **Stop and report on any `!` line.**
3. **Apply** (the tool writes its own backup before the first write):

   ```bash
   DATABASE_URL='<staging pooled url>' npm run cms:patch-cadeaubon -- --apply \
     --expect-host '<host part of the staging DATABASE_URL>' --backup-dir <dir>
   ```

   Backup `cadeaubon-patch-<timestamp>.json` (the `/aanbod` row and blocks; the new page is
   recorded as created). Order: voucher page (create, block, publish), then `/aanbod` (groups,
   publish). It verifies both published snapshots, checks the booking tables, audits
   `patch.cadeaubon.apply` and always revokes its session. A second dry run prints
   `dry run: nothing to do`.
4. **Verify** after the 5-minute cache window (GETs only, load twice): `/aanbod` lists
   "Overige" last with a "Cadeaubon" card ("Bedrag naar keuze") linking to `/aanbod/cadeaubon`;
   that page has one `<h1>` "Cadeaubon", the breadcrumb Home / Aanbod / Cadeaubon, the labels
   "Bedrag in euro", "Persoonlijke boodschap", "Voornaam en naam", "E-mail", "Telefoon" and the
   button "Bestel nu". `/afspraak?dienst=cadeaubon` shows the normal widget, not an enquiry.
   **Do not submit the form against a configured mail provider** unless an order mail to the
   studio is intended; without an API key (env or `/admin/email`) a submit shows "Je
   bestelling is niet verstuurd" and sends nothing (that is the expected staging state today).

**Rollback:** `npm run cms:patch-cadeaubon -- --restore <backup.json> --expect-host '<host>'`
unpublishes `/aanbod/cadeaubon` (row kept; a later apply re-publishes it) and puts `/aanbod`
back. Then, if needed, the code. Mail delivery itself is configured separately:
`docs/booking-runbook.md` § 12.

## 13. E-mail service in the admin (`/admin/email`, migration 0004, 13 Oct 2026)

Admins can set up the e-mail service themselves: **Beheer → E-mail** (`/admin/email`,
permission `email.manage`). API key (write-only, stored AES-256-GCM sealed in
`cms_integration_settings`, key derived from `CMS_SESSION_SECRET`), sender, reply-to, gift
voucher order inbox, a status card and a test-mail button. Env variables keep working and win
per field. Details: `cms-architecture.md` (site settings section) and `booking-runbook.md` §6.7.
With the security release (§15), storing or removing the key and saving the addresses are
sensitive changes: an admin confirms their identity first (*Bevestig je identiteit*, password
and code, valid 5 minutes).

**Release steps (staging):** as written below for a build **without** the security release.
A build that contains it (§14, §15) must not be deployed before 0005 and 0006 exist: then
follow the combined order in §16, which migrates 0004 in the same run.

1. Deploy the code (release gate, READY). Safe before the migration: a missing table counts as
   "nothing stored"; `/admin/email` then shows a red notice and refuses to save.
2. **Migrate** (additive, idempotent; 0004 creates only `cms_integration_settings`):

   ```bash
   DATABASE_URL='<staging pooled url>' npm run db:migrate
   ```

   Expect `→ driver: neon-http (<host>)` and `✓ migrations applied to Neon`. Re-running is a
   no-op.
3. **Verify** (admin login, nothing sent): `/admin/email` loads without the red notice; Status
   reads "Niet ingesteld" with *Te doen* for API key, sender and recipient; the nav shows
   "E-mail" for admins only. Optional: save an invalid sender (`abc`) and see it refused
   (with the security release: within 5 minutes of signing in, or after *Bevestig je
   identiteit*). Do **not** paste a real key or press *Testbericht versturen* unless sending
   is intended.
4. `CMS_SESSION_SECRET` must stay as it is: rotating it makes a stored key unreadable (the page
   then says so; nothing is sent until the key is pasted again).
5. After a prod→staging refresh, `anonymize-staging.sql` has cleared the stored key and the
   order inbox (`DEPLOYMENT.md` §7): set a staging key and a staging inbox again before testing
   sends.

**Rollback:** code back to the previous SHA; the table can stay (older code ignores it). If a key
was stored and must go: **Opgeslagen sleutel verwijderen** in `/admin/email` first.

---

## 14. Admin two-step verification (TOTP, migration 0005, 13 Oct 2026)

Admins now sign in with a password **and** a code from an authenticator app (1Password or a
free app such as Aegis, Ente Auth or Google Authenticator); recovery codes cover a lost
phone. Editors and providers were unchanged by this step; providers followed on 16 Oct 2026
(§17), editors stay as they are. Design: `cms-architecture.md` §4, "Two-step
verification". It needs one migration and one new secret, in this order. Arend executes;
staging is autonomous after the release gate, production needs Toshoni's go. It ships together
with §15 (same branch, `feat/security-baseline-20261013`); rolling both out after §13: the
combined order in §16. The steps below are the detail of that order.

1. **Secret first.** Generate a staging-only key (`openssl rand -base64 32`), store it in
   1Password, then set `CMS_MFA_ENCRYPTION_KEY` in Vercel → Preview (branch `staging`) as
   *Sensitive*. Preview deployments of other branches that use the staging database need it
   too, or admins (and, since §17, providers) cannot sign in there. Never print, paste or log the value.
2. **Snapshot**, then migrate (additive, guarded; the running build keeps working on the
   extended schema):

   ```bash
   DATABASE_URL='<staging pooled url>' npm run db:migrate
   ```

   Expect `0005_cms_admin_mfa` to be applied and `✓ migrations applied to Neon`; the same run
   applies `0004_integration_settings` if §13 has not run yet, `0006_cms_session_limits`
   (§15) and `0007_cms_mfa_rate_limits` (§16), since the code ships them together. Check: `cms_mfa_factors`,
   `cms_mfa_recovery_codes`, `cms_mfa_challenges`, `cms_mfa_attempts` exist and
   `cms_sessions.mfa_verified_at` is a nullable column.
3. **Deploy** the code (release gate, READY). From that moment every existing **admin**
   session is refused: admins are sent to sign in again.
4. **First admin sign-in** (Toshoni, `contact@toshoni.be`): password → *Tweestapsverificatie
   instellen* → scan the QR code → six-digit code → store the ten recovery codes in 1Password
   with the account → dashboard. No lockout: an admin without an authenticator always gets the
   enrolment step after the password. *Gebruikers* shows "Tweestapsverificatie aan".
5. **CLI scripts** (`cms:seed`, `cms:rollout-aanbod`, `cms:patch-booking-cta`,
   `cms:patch-page-cleanup`, `cms:migrate-aanbod`) act only as an admin who has enrolled;
   until step 4 is done they stop, dry runs included, with "no active admin has two-step
   verification yet".
6. **Checks:** `/admin/login` does **not** show "Tweestapsverificatie is op deze server niet
   geconfigureerd" (if it does, the key is missing or malformed: fix it in Vercel, redeploy); a
   wrong code is refused; `/admin` without a session goes to the login page; an editor still
   signs in with a password only; the audit log shows `auth.mfa_enrol` and `auth.mfa_verify`.

   **Order matters:** the new build reads the 0005 tables at sign-in, so deploying it before
   step 2 breaks `/admin/login` until the migration runs. Migrate first.

**Lost authenticator.** Sign in with a recovery code, then *Mijn account →
Tweestapsverificatie → Authenticator vervangen*. Authenticator **and** recovery codes lost:
another admin uses *Gebruikers → Tweestapsverificatie resetten* (the user gets a temporary
password). No other admin: break-glass with database access, dry run first:

```bash
DATABASE_URL='<staging pooled url>' npm run cms:mfa-reset -- --email <address>
DATABASE_URL='<staging pooled url>' CMS_BREAK_GLASS_PASSWORD='<new temporary password>' \
  npm run cms:mfa-reset -- --email <address> --apply \
  --expect-host '<host part of the staging DATABASE_URL>'
```

It replaces the password by the temporary one (≥ 12 characters, lower, upper, digit; hand it
over out of band, it must be changed at sign-in), revokes every session, removes that user's
authenticators, recovery codes and challenges, clears their failed-attempt log and writes
`auth.mfa_break_glass` to the audit log. It prints no secret. Without
`CMS_BREAK_GLASS_PASSWORD` the password stays as it was and whoever knows it can enrol first:
only do that when the user is ready to sign in right away.

**Locked out by someone guessing codes** (they know the password; the audit log shows
`auth.mfa_failed` after `auth.login`): a new password stops it and clears the counter. Another
admin resets the password (or MFA) under *Gebruikers*; with no other admin, use the break-glass
command above with a temporary password.

**Key rotation or loss.** Stored authenticators become unreadable ("gebruik een
herstelcode"); recovery codes still work, after which each admin replaces the authenticator.

**Rollback.** Code first: redeploy the previous build; it ignores the new tables and column,
so admins sign in with a password only again (MFA is then simply off). The migration does not
need to be undone; leave the tables in place for a later re-deploy. A refresh of staging from
production empties the `cms_mfa_*` tables (`scripts/anonymize-staging.sql`), after which
staging admins enrol anew.

**Production** (after Toshoni's go): the same steps with a production-only key in Vercel →
Production, `db:migrate` against Neon `production` after a snapshot, deploy, then the first
admin enrols immediately.

---

## 15. Admin session limits, step-up, stronger password hashing and admin CSP (migration 0006, 13 Oct 2026)

Security block 3, on the same branch as §14 (`feat/security-baseline-20261013`) and rolled out
together with it or right after it (combined order: §16). Design: `cms-architecture.md` §4
(Passwords, Sessions, Step-up) and `docs/admin-csp.md`. No new secret. Arend executes; staging
is autonomous after the release gate, production needs Toshoni's go.

What changes for people:

- **Admins** are signed out after **15 minutes without a request** and **8 hours after
  signing in** at the latest. Editors and providers keep their 14-day sessions (a separate
  decision, not changed silently).
- **Sensitive admin changes** (create a user, change a role, (de)activate, reset a password,
  change your own password, change the e-mail service settings in `/admin/email`) need
  *Bevestig je identiteit* (password + code) within the last 5 minutes. Signing in counts; the
  form sits above those forms.
- **Password hashes** get stronger at the next sign-in of each user (automatic, nothing to do).
- **`/admin` sends a Content-Security-Policy in report-only mode**: nothing is blocked yet.

Steps:

1. **Snapshot**, then migrate (additive, guarded; old builds ignore the two new columns):

   ```bash
   DATABASE_URL='<staging pooled url>' npm run db:migrate
   ```

   Expect `0006_cms_session_limits` (and `0004_integration_settings` / `0005_cms_admin_mfa` /
   `0007_cms_mfa_rate_limits` if §13 / §14 have not run yet) to be applied; after §14 step 2 this is a no-op. Check:
   `cms_sessions.absolute_expires_at` and `cms_sessions.reauthenticated_at` exist as nullable
   `timestamptz`. Nothing else changes.

   **Order matters:** the new build reads both columns on every admin request, so deploying it
   before the migration breaks `/admin`. Migrate first.
2. **Deploy** (release gate, READY). Existing admin sessions that have been idle for more than
   15 minutes, or are older than 8 hours, end at once: sign in again.
3. **Checks** (Toshoni or Winston, on the staging URL):
   - sign in as admin (password + code); *Gebruikers* shows "Identiteit bevestigd: je kan tot
     HH:MM gebruikers beheren";
   - wait 6 minutes (or sign in more than 5 minutes earlier), try *Rol wijzigen*: the form
     answers "Bevestig eerst je identiteit …"; confirm with password + code; the change works;
   - leave the admin untouched for 16 minutes, then click a menu item: back to the login page;
   - an editor stays signed in as before;
   - audit log: `auth.step_up`, and `auth.mfa_reauth_failed` after a deliberately wrong code.
4. **CSP browser validation** — `docs/admin-csp.md` has the checklist. In short: DevTools on
   each admin screen, the response carries `Content-Security-Policy-Report-Only` with a fresh
   nonce per load, and the console shows **no** `[Report Only] Refused to …` line. Public pages
   carry **no** CSP header (GA4 unaffected). Record the result in the work-block report.

   - [ ] **Clerk on staging (open validation item).** The admin policy is complete only where no
         Clerk publishable key is set (`docs/admin-csp.md` §6). For staging that was assumed, never
         checked on the deployment, and the docs disagree: §2 lists no Clerk keys, but
         `DEPLOYMENT.md` §6 gives Clerk's Development instance to "staging and previews", and a
         Preview variable without a branch filter reaches the `staging` branch too.
         `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` alone is enough to mount `ClerkProvider` on every
         page, `/admin` included. Check:
     - Vercel → Settings → Environment Variables (names only, never values): is
       `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` set for Preview (all branches, or branch `staging`)?
       And for Production?
     - On `/admin/login` signed out and `/admin` signed in: *View page source* has no `clerk-js`
       script or preload, DevTools → Network filtered on `clerk` and `challenges.cloudflare.com`
       shows no request, and no `[Report Only]` line names a Clerk host.

     What the result means:
     - **No key and nothing from Clerk:** the policy is complete for staging. Record "Clerk: not
       loaded" with date and deployment URL. If Production does set the key, this result does
       not cover production: its admin would load Clerk.
     - **Anything from Clerk** (script, request or report), **or a key listed in Vercel** even if
       the page shows nothing yet (the deployment predates the variable; the next one loads
       Clerk): the policy is incomplete and step 4 has not passed, even if Clerk's lines are the
       only ones. Fix it as `docs/admin-csp.md` §6 recommends (move `ClerkProvider` out of the
       root layout into the webshop's layouts, on a feature branch), or remove the Clerk keys
       from staging's scope with Toshoni's go if the shop need not work there, then repeat
       step 4. Widening the policy for Clerk is the last resort (§6 of that doc).

     Until this item is checked and recorded, enforcement stays **off**: `ADMIN_CSP_MODE` stays
     `'report-only'` on staging, and on production until the same check passed with production's
     Clerk configuration.

5. **Switch to enforcement** only after step 4 passed on staging: the one-line change of
   `ADMIN_CSP_MODE` to `'enforce'` in `src/lib/security/admin-csp.ts`, as its own commit through
   the normal branch flow, then repeat step 4 (now nothing may break). Rollback: set it back
   to `'report-only'` and redeploy.

**CLI note.** `cms:seed`, `cms:rollout-aanbod`, `cms:patch-booking-cta`, `cms:patch-page-cleanup`
and `cms:patch-cadeaubon` act through an admin session, which now also ends after 15 idle
minutes; they make requests continuously, so this only matters if a run is paused for that
long — run it again.

**Rollback.** Code first: redeploy the previous build; it ignores the two columns (sessions
then behave as before: 14 days, sliding, no step-up) and sends no admin CSP. The migration does
not need to be undone. Upgraded password hashes stay valid for the old build (same format,
the parameters are read from the hash itself).

**Production** (after Toshoni's go): the same steps against Neon `production` after a
snapshot, then deploy; CSP enforcement on production only after it was enforced and validated
on staging.

---

## 16. Security release on staging: migrations 0004 → 0005 → 0006 → 0007 in one rollout

The order to follow when the security branch (`feat/security-baseline-20261013`: §14 and §15)
reaches staging after the e-mail service of §13, whether or not 0004 is already on the staging
database. One new secret, one migration run, one deploy. Arend executes; staging is autonomous
after the release gate, production needs Toshoni's go.

1. **Release gate** on the exact SHA (six steps).
2. **Secret, before the deploy.** `CMS_MFA_ENCRYPTION_KEY` in Vercel → Preview (branch
   `staging`), *Sensitive*, a staging-only value kept in 1Password (§14 step 1). Leave
   `CMS_SESSION_SECRET` exactly as it is: rotating it signs everyone out, and the e-mail API key
   stored in `/admin/email` is sealed under a key derived from it (§13 step 4).
3. **Neon snapshot**: a branch from `Staging` (e.g. `staging-pre-security-2026-10-13`).
4. **Migrate, once:**

   ```bash
   DATABASE_URL='<staging pooled url>' npm run db:migrate
   ```

   Applies, in this order, whatever the database still lacks: `0004_integration_settings`,
   `0005_cms_admin_mfa`, `0006_cms_session_limits`, `0007_cms_mfa_rate_limits`. Expect
   `→ driver: neon-http (<host>)` and `✓ migrations applied to Neon` (the script does not list
   file names). Check: `cms_integration_settings` and the five `cms_mfa_*` tables exist
   (`cms_mfa_rate_limits` from 0007), the unique index `cms_mfa_challenges_user_id_unique_idx`
   exists, and `cms_sessions.mfa_verified_at`, `absolute_expires_at` and `reauthenticated_at`
   are nullable `timestamptz`. 0007's only data change deletes duplicate sign-in challenges
   (10-minute state), keeping the newest per user. The live build keeps working on the extended
   schema. (A database that once
   ran the security migrations under their earlier numbers does not get 0004 this way:
   `cms-architecture.md` §2, Migrations.)

   **Migrate before deploying:** the security build reads the 0005 tables at sign-in and the
   0006 columns on every admin request, so without them `/admin/login` and `/admin` break;
   without 0007 the admin second step breaks (the challenge upsert needs the unique index, the
   code limits need `cms_mfa_rate_limits`). 0004 is safe either way: the e-mail code treats a
   missing table as "nothing stored".
5. **Deploy** (merge to `staging`, wait for READY). Every existing admin session is refused
   from then on: admins sign in again.
6. **Admin enrolment, right after the deploy** (Toshoni, `contact@toshoni.be`): password (a
   temporary one is replaced first) → *Tweestapsverificatie instellen* → QR code → six-digit
   code → the ten recovery codes into 1Password with the account → dashboard (§14 step 4).
   `/admin/login` must not say "Tweestapsverificatie is op deze server niet geconfigureerd";
   if it does, step 2 is missing or malformed: fix it, redeploy.
7. **Checks:** the two-step checks (§14 step 6), the step-up and idle checks (§15 step 3), and
   `/admin/email` (§13 step 3): no red notice, and a save more than 5 minutes after signing in
   asks for *Bevestig je identiteit* first. No real key, no test message, no bookings.
8. **CSP browser checklist** (`admin-csp.md` §3, `/admin/email` included; §15 step 4). The
   switch to enforcement stays a separate change (§15 step 5).
9. **CLIs from now on.** `cms:seed`, `cms:rollout-aanbod`, `cms:patch-booking-cta`,
   `cms:patch-page-cleanup` and `cms:patch-cadeaubon` refuse to run, dry runs included, until an
   admin has a permanent password and an authenticator (step 6): they stop with "every active
   admin still has a temporary password" or "no active admin has two-step verification yet".
   If the page cleanup (§11) or the gift voucher (§12) is not on staging yet, run it after
   step 6.

**Rollback.** Code first: redeploy the previous build (effects in §14 and §15, Rollback); the
migrations stay, older code ignores the new tables and columns. Keep `CMS_MFA_ENCRYPTION_KEY`
and `CMS_SESSION_SECRET` unchanged for a later re-deploy.

**Production** (after Toshoni's go): the same order with a production-only
`CMS_MFA_ENCRYPTION_KEY` in Vercel → Production, a snapshot of Neon `production`, `db:migrate`,
deploy, and the first admin enrols immediately; CSP enforcement on production only after it was
enforced and validated on staging.

---

## 17. Provider two-step verification (16 Oct 2026, no migration)

Providers ("Aanbieder") now sign in like admins: password **and** a code from an authenticator
app, enrolled at the first sign-in after the deploy, with ten recovery codes. A provider cannot
switch it off (only replace the authenticator), the step-up *Bevestig je identiteit* asks for
the code, and changing the own password needs that step-up within 5 minutes. **Unchanged:**
the provider's session lifetime (14 days, sliding; accepted for this staging-only MFA test,
**not** approved for production; see `cms-architecture.md` §4), editors (password only, unless they kept
an authenticator), admins, permissions, public booking. Design and the policy per role:
`cms-architecture.md` §4, "Two-step verification". Arend executes; staging is autonomous after
the release gate, production needs Toshoni's go.

**No migration, no new secret.** The `provider` role exists since 0002 and the `cms_mfa_*`
tables and `cms_sessions.mfa_verified_at` since 0005; the change is code only. `db:migrate`
has nothing to apply for it. It needs what §16 already set up: `CMS_MFA_ENCRYPTION_KEY` on the
deployment and migrations 0005–0007 applied. If staging's admin signs in with a code today, both
are in place.

Steps:

1. **Release gate** on the exact SHA (six steps).
2. **Precondition:** `<staging alias>/admin/login` does **not** say "Tweestapsverificatie is op
   deze server niet geconfigureerd". If it does, stop: the key is missing (§14 step 1), and
   after the deploy no provider could sign in.
3. **The staging provider's temporary password.** `toshoni@gmail.com` (role provider) has never
   signed in: it still has the temporary password `cms:seed-booking` printed once. Whoever holds
   that password can set up the authenticator first. If it may have travelled (chat, log,
   screenshot) or is lost, an admin replaces it right before the first sign-in: *Gebruikers* →
   *Bevestig je identiteit* → *Wachtwoord resetten* for `toshoni@gmail.com`, and hands the new
   temporary password over directly, never through a log or chat transcript.
4. **Deploy** (merge to `staging`, wait for READY). From now on every provider session is
   refused (`mfa_required`): the dashboard sends the provider to `/admin/login?mfa=1` ("Je account
   vraagt naast je wachtwoord ook een code …"), and the Google connect and callback routes refuse
   it with the same guard check (`cmsAccessDenial()`). Public booking and the calendar sync of an
   already connected provider need no provider session and are unaffected.
5. **First provider sign-in** (Toshoni, as `toshoni@gmail.com`), in this order: `/admin/login` →
   e-mail and temporary password → `/admin/mfa` *Kies een nieuw wachtwoord* (≥ 12 characters,
   lower case, upper case, a digit) → *Tweestapsverificatie instellen* → *Authenticator
   instellen* → scan the QR code (or type the key) in 1Password or an authenticator app → the
   six-digit code → *Bevestigen en aanmelden* → the **ten recovery codes, shown once**: store them
   in 1Password with the provider account → *Ik heb ze bewaard, naar het beheer* → *Mijn agenda*.
   The provider login is a separate entry in the authenticator ("De Bikefit Studio (test)" with
   `toshoni@gmail.com`), next to the admin's.
6. **Checks** (Arend: release gate, site-health, logs; Toshoni or Winston: the browser):
   - before the code, the provider has no session: opening `/admin/agenda` leads back to the
     code step, never to the agenda; a wrong code answers "Die code klopt niet …";
   - after enrolment: *Mijn agenda* loads; as admin, *Gebruikers* shows the provider with
     "Tweestapsverificatie aan" (before: "Geen authenticator: moet tweestapsverificatie
     instellen");
   - as provider, *Mijn account*: authenticator active, ten recovery codes, **no**
     *Tweestapsverificatie uitschakelen*; more than 5 minutes after signing in, *Wachtwoord
     wijzigen* first asks *Bevestig je identiteit* with password **and** code;
   - the provider is still signed in after 16 minutes without a click (standard session; an admin
     would be signed out);
   - an editor still signs in with a password only; an admin is unchanged (password + code);
   - audit log: `auth.login`, `auth.password_change` and `auth.mfa_enrol` for
     `toshoni@gmail.com`; Vercel logs: no `[cms] action_failed` during the sign-in.
7. **Nothing for the CLIs:** they act as an enrolled admin, as before.

**Lost device (provider).** With the recovery codes: sign in with one, then *Mijn account →
Tweestapsverificatie → Authenticator vervangen*. Authenticator **and** codes lost: an admin
signs in, *Gebruikers* → *Bevestig je identiteit* → *Tweestapsverificatie resetten* → the
provider → own password and code. The provider gets a temporary password (shown once to the
admin; hand it over out of band, after checking it is really that person) and at the next
sign-in replaces it and enrols anew. A provider can never reset anyone (*Gebruikers* is
admin-only, the server refuses with `forbidden`). No admin available: the break-glass CLI of §14
works for providers too, dry run first:

```bash
DATABASE_URL='<staging pooled url>' npm run cms:mfa-reset -- --email <provider address>
DATABASE_URL='<staging pooled url>' CMS_BREAK_GLASS_PASSWORD='<new temporary password>' \
  npm run cms:mfa-reset -- --email <provider address> --apply \
  --expect-host '<host part of the staging DATABASE_URL>'
```

The dry run prints `<address> (provider): …` with the counts; `--apply` removes the factor,
recovery codes, challenges and sessions and writes `auth.mfa_break_glass`.

**Rollback.** Code only: redeploy the previous build; there is no migration to undo and no
variable to remove. Effect: providers without an authenticator sign in with a password alone
again and provider sessions without the second step are accepted again. A provider who already
enrolled keeps the authenticator and is still asked for it at sign-in (the previous build asks
anyone who has one) and could switch it off there under *Mijn account*. A refresh of staging from
production empties the `cms_mfa_*` tables (`scripts/anonymize-staging.sql`): providers then
enrol anew, like admins.

**Production** (after Toshoni's go): the same steps; `CMS_MFA_ENCRYPTION_KEY` is already required
there since §16. Each production provider enrols at the next sign-in after the deploy, so tell
them beforehand to have their phone or 1Password at hand.

---

## 18. Beheer → Aanbod (offering settings, migration 0010, 16 Oct 2026) — superseded by §19

**Superseded on 17 Oct 2026:** `cms:migrate-offerings` no longer exists; migration 0010 stays
required and is followed by 0011 (§19). Kept for the record.

What changes: one place in Beheer to decide per offer page whether it is shown, whether it has
Volwassene/Jeugd variants, the price per variant and whether it is booked directly online or
asked for through a form on its page; providers tick what they offer under *Mijn agenda → Mijn
aanbod* (`cms-architecture.md` §15, `booking-architecture.md` §15). Arend executes; staging is
autonomous after the release gate, production needs Toshoni's go.

1. **Release gate** on the exact SHA (six steps).
2. **Neon snapshot** of `Staging` (e.g. `staging-pre-offerings-2026-10-16`).
3. **Migrate before the deploy** (0009 first if staging does not have it yet, then §3.2 for the
   two labels):

   ```bash
   DATABASE_URL='<staging pooled url>' npm run db:migrate
   ```

   Check: `cms_offerings` and `cms_offering_variants` exist and are empty. The live build is not
   affected by the new tables. A push to `staging` deploys by itself, so nothing is pushed or
   merged before this check passed: a build without 0010 in the database refuses every booking
   (fail closed).
4. **Deploy.** Without any row every offer page derives its settings from its block, so the site
   looks as before, with three intended differences: each card and offer page names how it is
   booked ("Online te boeken", "Op aanvraag", or greyed "Tijdelijk niet online te boeken"); an
   offer that is asked for shows the enquiry form on its page instead of a booking button; and a
   directly booked offer that no active provider offers is greyed out with a disabled button.
5. **Save the derived settings (optional, recommended):**

   ```bash
   DATABASE_URL='<staging pooled url>' npm run cms:migrate-offerings                         # dry run
   DATABASE_URL='<staging pooled url>' npm run cms:migrate-offerings -- --apply --expect-host <host>
   ```

   The dry run is read-only (no session, no audit entry) and lists per published offer page
   `+ create` (an exact copy of what the page shows), `! manual` (not exact, e.g. a free-text price
   label or a service that shows its own price in the widget: an editor decides in Beheer →
   Aanbod; the page keeps its current behaviour meanwhile) or `= skip` (draft, or already saved).
   The apply saves only the `create` rows through the repo (audit `offering.update`), checks that
   bookings, services and provider subscriptions are unchanged, and is idempotent. Needs an admin
   with their own password and two-step verification, like the other CLIs (§16 step 9).
6. **Checks** (no booking or enquiry is submitted on staging):
   - `/admin/aanbod` lists every offer page; Bikefit – huidige fiets shows *Volwassene en Jeugd
     apart*, *Rechtstreeks online boeken*, Volwassenenfit / Jeugdfit, no prices.
   - `/aanbod` and the detail page: same Duur ("Volwassene: 1 u 30 min · Jeugd: 1 uur") and
     "Prijs op aanvraag" as before, no `offers` in the Service JSON-LD.
   - `/afspraak?dienst=bikefit-huidige-fiets` opens "Voor wie?" as before;
     `?dienst=lactaattest` names the offer and links to its form.
   - The provider sees *Mijn aanbod* grouped by offer under *Mijn agenda*.
   - Beheer → E-mail: *Ontvanger bestellingen en aanvragen* is the inbox the enquiry form uses
     (empty = every enquiry says "niet verstuurd"; never `contact.email`).

**Rollback.** Code first: redeploy the previous build; it ignores the two tables. To return a
page to its derived behaviour on the new build, delete its row
(`DELETE FROM cms_offerings WHERE page_id = '<id>'`, variants cascade). The tables stay.


---

## 19. The offering is the offer (migration 0011 + `cms:migrate-aanbod`, 17 Oct 2026)

What changes: Beheer → Aanbod owns the whole offer (text, image, shown or not, Volwassene/Jeugd,
duration and price per variant, direct booking or enquiry) and writes the booking services
itself; the seven offer pages under `/aanbod/` and the Diensten screen are gone; `/aanbod/<slug>`
is rendered from the offering; the gift voucher page moves to `/cadeaubon`; a user with the role
Aanbieder gets the provider profile with the account (`cms-architecture.md` §14,
`booking-architecture.md` §14). Arend executes; staging is autonomous after the release gate,
production needs Toshoni's go. §12 and §18 are superseded by this section.

1. **Release gate** on the exact SHA (six steps).
2. **Neon snapshot** of `Staging` (e.g. `staging-pre-aanbod-offerings-2026-10-17`).
3. **Migrate before the deploy** (0011 widens `cms_offerings`; 0012 adds
   `cms_business_hours.location_id` and `cms_bookings.assignment` / `assigned_at`; both additive,
   `booking-architecture.md` §2 and §16):

   ```bash
   DATABASE_URL='<staging pooled url>' npm run db:migrate
   ```

   Check: `cms_offerings` has the columns `slug`, `title`, `contents`, `image`; `cms_bookings`
   has `assignment` (every row `assigned`) and `cms_business_hours` has `location_id` (every row
   null); nothing else changed. The live build ignores the new columns.
4. **Deploy and migrate at once.** The new build does not serve the offer pages (the block
   type `offer` no longer exists), and until step 5 ran the offer lists are empty. Run step 5
   right after the staging build is READY; the dry run can run before the deploy.
5. **Convert the offer pages:**

   ```bash
   DATABASE_URL='<staging pooled url>' npm run cms:migrate-aanbod                   # dry run
   DATABASE_URL='<staging pooled url>' npm run cms:migrate-aanbod -- --apply --expect-host <host>
   ```

   The dry run is read-only (no session, no audit entry, writes refused) and lists per offer page
   `+ … create the offering from the page (derived|stored settings), then delete the page`, per
   retired service `- offering … — retired: delete the hidden offering` and `- service … —
   retired: deactivate (existing bookings keep it)`, per other service no offering books through
   `+ service … — hidden offering`, `~ page /aanbod/cadeaubon — move to /cadeaubon`, `+ redirect /aanbod/cadeaubon → /cadeaubon`, `~ page /aanbod — add the
   voucher card`, the guard counts. A `!` line blocks the apply (a text that does not validate, an
   unpublished draft on `/aanbod`, a redirect pointing elsewhere): fix it in `/admin` first. The
   apply writes a backup JSON of every page it deletes or changes
   (`website/.rollout-backups/aanbod-migrate-<timestamp>.json`) before the first write, acts as
   the enrolled admin, writes the offerings (audit `offering.create` / `offering.update`), moves
   the voucher page, creates the redirect, patches and publishes `/aanbod`, deletes the offer
   pages (audit `page.delete`), checks the booking tables, audits `migrate.aanbod.apply` (with
   `verified` and any `problems` in its metadata) and only then lets the final check decide the
   exit code: every stored offering in the public catalogue, no offer page left, `/cadeaubon`
   renders, `/aanbod` has the voucher card. A second run prints `nothing to do`.

   **If the apply ends in "verification found problems"** (staging, 17 Oct 2026: one read of
   the offering store failed right after the writes, so every offering was reported "not in
   the catalogue"), the writes are complete and stand. Run the check again, read-only and
   without a session:

   ```bash
   DATABASE_URL='<staging pooled url>' npm run cms:migrate-aanbod -- --verify
   ```

   Since that day the check reads the store up to three times before it reports it unreadable,
   as one line, and the audit entry is written before the check (on staging the run of 17 Oct
   wrote none; the 21 `offering.create` / `page.*` / `redirect.create` rows are the record).
6. **Cache.** As in §9: the readers' fallback revalidation is 5 minutes; wait, load each page
   twice, then verify.
7. **Checks** (no booking or enquiry is submitted on staging):
   - `/admin/aanbod` lists the seven offerings of the brief (shown); Gezinspakket, Fit aan huis
     and Inspanningstest are gone (retired: their services inactive, existing bookings keep
     them); Bikefit – huidige fiets shows *Volwassene en Jeugd
     apart*, *Rechtstreeks online boeken*, 90 and 60 minutes, no prices, the provider under
     "Aangeboden door". Open one: the text of the former page is there.
   - `/admin/pages` shows one *Aanbod* page and *Cadeaubon* at `/cadeaubon`; no page under
     `/aanbod/`. The admin menu has no *Diensten*.
   - `/aanbod`: three groups, seven cards with their status, "Prijs op aanvraag", the Cadeaubon
     card under Overige → `/cadeaubon`; `/aanbod/bikefit-huidige-fiets` renders with breadcrumb,
     "Volwassene: 1 u 30 min · Jeugd: 1 uur", the booking button; `/aanbod/lactaattest` shows
     the enquiry form; `/aanbod/gezinspakket` and `/aanbod/onbekend` answer 404;
     `/aanbod/cadeaubon` → 308 to `/cadeaubon`; the sitemap lists the seven offerings.
   - `/afspraak`: "Bikefit – huidige fiets" once with Volwassene / Jeugd; Gezinspakket, Fit aan
     huis and Inspanningstest are no longer offered (retired; a new offering in Beheer → Aanbod
     brings one back); `?dienst=bikefit-huidige-fiets` narrows,
     `?dienst=lactaattest` links to the form.
   - The provider sees *Mijn aanbod* grouped by offering under *Mijn agenda*; a new user with the
     role Aanbieder (Gebruikers) gets "Het aanbiedersprofiel is meteen aangemaakt." and an agenda
     at the first sign-in.
   - Audit log: `offering.create` per converted page, `page.delete` per deleted page,
     `migrate.aanbod.apply` once.

**Rollback.** Restore the Neon snapshot of step 2, then redeploy the previous build (the old
build needs the offer pages the migration deleted; the backup JSON holds them for reference,
there is no `--restore`). The schema change is additive and can stay.

**Production** (after Toshoni's go): the same steps against Neon `production`, right after
`main` is deployed.

## 20. Staging access gate (issue #18, migration 0013, 18 Oct 2026)

What changes: the exact host `staging.debikefitstudio.be` (Preview deployment of branch
`staging`) gets a first-party login for named reviewers, so it can later leave Vercel
Authentication; every other preview URL, every immutable deployment URL and production keep
Vercel Authentication and today's behaviour (`staging-gate.md`, variables in
`../DEPLOYMENT.md` §5). There is no production rollout of this feature.

Owners:

- **Arend:** the staging environment variables, migration 0013, provisioning and revoking
  accounts, the deployment and the `site-health` integration.
- **Toshoni:** approves each named reviewer, and separately approves the Vercel Deployment
  Protection Exception.
- **Max:** the functional review of the exact build against his brief (2026-10-18).
- **Niels:** the commit and the pass/fail evidence.

Staged rollout, in this order:

1. **Neon snapshot** of `Staging` (e.g. `staging-pre-staging-gate-2026-10-18`).
2. **Migrate before the deploy** (0013 creates `cms_staging_gate_accounts` and
   `cms_staging_gate_sessions`; guarded, re-runnable, additive, no data change):

   ```bash
   DATABASE_URL='<staging pooled url>' npm run db:migrate
   ```

   Until the tables exist the gate on the staging host fails closed (503 `gate_unavailable`).
3. **Variables:** set `STAGING_GATE_SECRET` and `STAGING_GATE_HEALTH_TOKEN` in Vercel →
   Preview, branch `staging` only, Sensitive (each `openssl rand -base64 48`, two different
   values; the health token also goes into Arend's secret store). Check that the system
   variables are exposed (`VERCEL_GIT_COMMIT_REF`).
4. **Deploy** the staging branch commit while Vercel Authentication (SSO) stays **on**.
5. **Provision named accounts, vault-first**, one per reviewer Toshoni approved. The
   reviewer's vault item is the source of truth and is what you share with the reviewer; the
   password never passes through argv, an environment variable, shell history, the terminal
   or a transcript (`staging-gate.md` §3):

   ```bash
   # 1. Create the reviewer's vault item and let the vault generate the password
   #    (the CLI refuses what the CMS strength rules refuse: 12–200 characters with
   #    a lower-case letter, an upper-case letter and a digit; aim for ≥ 20).
   # 2. Pipe it; it never appears in argv, env, history or output.
   op read 'op://<vault>/<item>/password' | DATABASE_URL="$(op read 'op://<vault>/<neon staging item>/pooled-url')" npm run staging:access -- --add --identifier <identifier> --note "<who / approval>" --expect-host <neon host> --password-stdin
   DATABASE_URL="$(op read 'op://<vault>/<neon staging item>/pooled-url')" npm run staging:access -- --list
   ```

   - `op read` stands for the secret store's CLI: anything that writes the value to stdout.
     Its trailing newline is fine (exactly one is stripped; nothing else is trimmed). A
     literal password via `echo`/`printf`, a `--password`/`-p` style argument (refused, and
     npm echoes the command line), an environment variable (never read) or a temporary file
     are forbidden.
   - The CLI refuses a terminal on stdin, more than 802 bytes, more than one line, control
     characters and a weak password, each with a fixed message and before any database work.
     A failed `op read` leaves stdin empty, which is refused too.
   - Success prints `✓ account <identifier> created (password from stdin)` and no password.
     Share the vault item with the reviewer (1Password share or equivalent), never the
     password itself in chat, transcripts or issue comments.
   - If a command fails, fix the cause and pipe the same vault value again, so the database
     matches the vault item. If `--add` answers that the identifier already exists, use
     `--reset-password` with the same vault value.

   `--expect-host` is an operator cross-check that the `DATABASE_URL` host is the one you
   intend; it is **not** proof that the URL is the staging database (the same wrong host in
   both places passes), so check the host against the Neon `Staging` branch record first.
   Record identifier, grant date and approver in the operational register.

   A forgotten or compromised password: rotate it in the vault item first, then pipe the new
   value (the new hash is stored first, then every session of the account ends):

   ```bash
   op read 'op://<vault>/<item>/password' | DATABASE_URL="$(op read 'op://<vault>/<neon staging item>/pooled-url')" npm run staging:access -- --reset-password --identifier <identifier> --expect-host <neon host> --password-stdin
   ```

   Fallback only, not the staging handoff (no vault item yet, local PGlite): without
   `--password-stdin`, `--add` and `--reset-password` generate a password and print it **once**
   to the terminal; it then has to be put in a vault item by hand.
6. **Exact-build verification behind SSO:** Niels's evidence and Max's acceptance against
   Max's issue #18 functional brief (18 Oct 2026).
   Keep Vercel Authentication enabled; use an approved Vercel automation bypass or protected
   preview access to reach this *same SHA*, never a project-wide protection change. Machine
   check, with the token from an environment variable (never a literal on the
   command line):

   ```bash
   curl -sS -o /dev/null -w '%{http_code}' -H "x-staging-gate-token: $STAGING_GATE_HEALTH_TOKEN" https://<host>/api/staging-gate/health
   ```

   Expected: **200** (`{"status":"ok"}`) with a valid token; **401** `{"code":"gate_auth_failed"}`
   with a wrong or missing token; **503** `{"code":"app_unhealthy"}` when the database is
   unreachable; **503** `{"code":"gate_misconfigured"}` when the configuration is incomplete. A
   200 login page is **not** green. Site-health must then fetch a protected page with the
   machine token and assert the intended page content (not login HTML), plus test a wrong
   token on that path (401). The health endpoint only proves the gate tables are queryable.

   On that exact build also record:
   - anonymous GET page, API, media UUID deny; `/_next/image` is 404 even with credentials;
     GET/HEAD login shell and
     its minimum assets load; POST to the public login page with an unrelated Server Action
     ID is denied (302/401), and POST to `/api/staging-gate/login` with `Next-Action`, missing,
     cross-origin or non-default-port `Origin` is rejected;
   - two Toshoni-approved named reviewers can sign in, wrong/unknown/revoked credentials use
     generic copy, a safe deep path+query resumes, unsafe `next` falls back to `/`, logout
     and browser back/refresh cannot reveal protected content, and idle/absolute expiry both
     require re-authentication (fixture time changes, not real-hour waits);
   - authorized CMS media and direct `/images/` responses carry `Cache-Control: no-store`;
     staging HTML uses direct image URLs, not `/_next/image`. Request the **same** direct URL
     without credentials after warming any CDN/browser cache and confirm it is denied.
     Also try a previously known optimized-image URL (Vercel may have cached it before
     the new build): it must be 404 even after the hostname exception; if an old public
     cached response survives, keep Vercel SSO on until Arend invalidates or outlasts it;
   - CMS admin and Google flows still apply their own auth after the gate, no redirect loop;
     the exact staging response is `noindex` and robots says `Disallow: /`.
7. **Only after Toshoni's separate written go:** Arend adds a Vercel Deployment Protection
   Exception for `staging.debikefitstudio.be` **only**, then validates:
   - the exact host is gated: anonymous page → 302 to `/staging-toegang`, `/api/…` → 401
     `{"code":"gate_session_required"}`, `/robots.txt` → `Disallow: /`, `X-Robots-Tag: noindex,
     nofollow` on every response;
   - a feature preview URL and the immutable deployment URL still prompt Vercel SSO;
   - production is unchanged;
   - `site-health` is green with the token.

Session policy (Max's defaults): 30 minutes idle or 8 hours absolute, whichever comes first.
After expiry the login shows "Je sessie is verlopen. Log opnieuw in om verder te gaan." and
returns to the requested same-origin path after sign-in, otherwise to `/`. The visible
"Uitloggen" ends the session and shows "Je bent uitgelogd."

Revocation is effective on the next request (the session is checked in the database per
request):

```bash
DATABASE_URL='<staging pooled url>' npm run staging:access -- --revoke --identifier <identifier> --expect-host <neon host>
```

Stable response codes: `gate_misconfigured` (503), `gate_auth_failed` (401), `app_unhealthy`
(503). None carries a secret.

What Arend records (operational register, never a secret or password):

- per reviewer: identifier, grant date, approver; on revocation the revocation date;
- the Neon snapshot name and the date 0013 was applied;
- the deployed staging commit and the health check result (status codes only);
- the date of Toshoni's go and of the hostname exception (and of its removal on rollback).

**Rollback**, in this order:

1. **Remove the hostname exception first**: Vercel Authentication covers the host again.
2. Redeploy the previous staging commit if needed.
3. Unset the two variables, or leave them. Remove the exception **before** unsetting them: a
   half-configured staging host (host matches, variables incomplete) answers 503
   `gate_misconfigured` to every request.
4. Migration 0013 is additive and stays in place. If the feature is abandoned, revoke every
   account with `--revoke`.

## 21. Content review of 19 Oct 2026 (no migration)

Toshoni's review: "Ninove" no longer follows the name in the home hero; the hero subtitle lost
"dichtbij"; "Wat we voor je doen" opens on "Eén vertrekpunt: jij en je fiets."; the phone number
reads `+32 473 95 26 33` everywhere; `/bikefit` opens on "Waarom een bikefit" (its page head with the
dead "Bekijk de bikefitdiensten" button is gone), the process says what you take home (analysis
and advice on paper, the measurements for a new bike; an existing bike adjusted on the spot) and
"Meten om beter te kijken" names the custom 3D-printed insoles and the saddles to test; the footer
keeps only the legal column, the FAQ sits in the main menu before Contact, and the bottom bar has
an Instagram icon and the cookie icon on the right. The seeds and block defaults hold the target;
on an existing database (after the staging gate of §20, which is unrelated):

1. `cms:rollout-aanbod` (dry run, then `--apply --expect-host <host>`; §9): re-applies the five pages
   (home, /aanbod, /voor-wie, /bikefit, /ons-team) and both menus from the seeds, backup first,
   refusing a page with unpublished draft edits. It leaves every other page, the settings and the
   booking tables alone.
2. `cms:seed -- --refresh-slug afspraak`: the phone number in "Voor je komt". (Not the meta
   description: a refresh never writes a page's title or SEO fields, so an existing `/afspraak`
   keeps the description it was created with; §24 accepts staging's.)
3. In `/admin` → **Instellingen** → Contact: *Telefoon (label)* `+32 473 95 26 33` (the link stays
   `tel:+32473952633`); → Organisatie: the Instagram profile URL under *sameAs* (the footer icon
   appears once it is there; it also lands in the JSON-LD).
4. Checks: home hero kicker "De Bikefit Studio", subtitle without "dichtbij"; `/bikefit` starts at
   "Waarom is een bikefit belangrijk?" and step 04 reads "Naar huis"; header menu has
   *Veelgestelde vragen* before *Contact*; footer: Juridisch + Contact columns, © line with the two
   icons on the right; `+32 473 95 26 33` in the footer and on `/afspraak`.

## 22. Prices and durations of the offer (20 Oct 2026, no migration)

Toshoni's prices and durations of 20 Oct 2026 live in the code
(`src/lib/offers/defaults.ts`, `src/lib/booking/defaults.ts`; what changes, field by field, in
`src/lib/offers/aanbod-prices.ts`). A fresh database gets them from `cms:bootstrap`; an existing
one from `npm run cms:patch-aanbod-prijzen` (self-test section 17b):

| What | Before | After |
| --- | --- | --- |
| The seven offerings of 17 Oct | "Prijs op aanvraag", "Duur in overleg" | a price per variant (€ 275 / € 150 for the fits, € 85, € 60, € 15, € 120, € 65), the duration text (2 uur, 30 minuten, 1 uur, 15 minuten; lactaattest and coaching keep "in overleg"), contents and extras that say what a bikefit includes, the meta descriptions |
| *Bikefit – aankoop nieuwe fiets* | one option | Volwassene / Jeugd, still asked for |
| New: *Bikefit – tweede bezoek* (€ 75, 1 uur), *Bikefit – tweede fiets* (€ 75 / € 150) | — | created from the defaults, asked for |
| Services `volwassenenfit`, `jeugdfit` | 90 / 60 min, no price | 120 / 120 min, € 275 / € 150 shown in the widget |

Every field edit names the value it expects (the defaults of 17–19 Oct 2026); a field an admin
changed since makes the patch refuse (`!`) — no override. Since 27 Oct 2026 the targets of the two
fits are written out in `aanbod-prices.ts` (the defaults moved on: Jeugd in two variants), so a
re-run on a database at the 20 Oct values still ends in "nothing to do". Nothing else is touched: no page, menu,
setting, provider, subscription or booking; no row is added to or removed from the booking tables.
Saving the fit through the repo renames its two services the way Beheer → Aanbod does
("Bikefit – huidige fiets – Volwassene" / "– Jeugd"; slugs unchanged) and rewrites their
description from the offering's summary.

1. Deploy the code first (release gate, staging READY). Old content renders fine on the new code.
2. **Dry run** (read-only like §9):

   ```bash
   DATABASE_URL='<staging pooled url>' npm run cms:patch-aanbod-prijzen
   ```

   Expected: `~ offering <slug> — n change(s)` for the seven offerings (each change listed),
   `+ offering bikefit-tweede-bezoek — create`, `+ offering bikefit-tweede-fiets — create`,
   `~ service volwassenenfit — …`, `~ service jeugdfit — …`, the guard counts, then
   `dry run: run again with --apply to write`. **Stop and report on any `!` line.**
3. **Apply** (optional Neon snapshot first; the tool writes its own backup before the first write):

   ```bash
   DATABASE_URL='<staging pooled url>' npm run cms:patch-aanbod-prijzen -- --apply \
     --expect-host '<host part of the staging DATABASE_URL>' --backup-dir <dir>
   ```

   Backup `aanbod-prices-patch-<timestamp>.json`: the seven offering rows with their variants and
   the two service rows. It verifies with a second plan and the public catalogue, checks the
   booking tables' counts, audits `patch.aanbod-prijzen.apply` and always revokes its session. A
   second dry run prints `dry run: nothing to do`.
4. **Verify** after the 5-minute cache window: `/aanbod` and each offer page show the prices and
   durations; `/afspraak` shows € 275 / € 150 and 2 uur per choice; "Reken op de tijd" on
   `/afspraak` reads 2 uur twice (§21 copy tokens, PR #26).

**Rollback:** `npm run cms:patch-aanbod-prijzen -- --restore <backup.json> --expect-host '<host>'`
puts the nine rows back and deletes the two created offerings. Then, if needed, the code.

**If the apply stops on `Error connecting to database: TypeError: fetch failed`:** that is the
HTTP driver's transport, not the query (the dry run and the rollout use the same credentials). On
20 Oct 2026 the apply failed three times at its first read on Neon Staging: it loaded the offers
repo (and with it the booking content and Google's auth library, seconds of compiling) inside the
admin session, after the session row had been written, and the first read then went over a
keep-alive socket Neon had closed meanwhile. The apply now loads its modules before its first
query and the plan's reads are sent a second time after one transport failure. Nothing is written
before the plan and the backup, so a failed run is safe to repeat.

## 23. Extra's and the location choice (20 Oct 2026, migration 0015; corrected 27 Oct 2026)

Migrations 0015 and 0016 are additive (0015: three columns on `cms_offerings`, `cms_offering_addons`,
`cms_booking_addons`; 0016: `cms_offerings.addon_options`, the choices within an extra; both guarded,
re-runnable). Apply it BEFORE deploying the build that contains
it (the build selects the columns on every offering read). The extras of the nine offerings then
come from `npm run cms:patch-aanbod-extras` (self-test section 17c), which needs the offerings
of §22. Architecture: `docs/booking-architecture.md` §18.

**Which offerings are extras (Toshoni, 27 Oct 2026).** Only *Bikefit – tweede fiets*. Voetanalyse,
Zadelanalyse and Afstellen schoenplaatjes are included in every bikefit (their pages say "zit in elke
bikefit"), so they are never a paid extra of one. The first version of this patch (20 Oct 2026) made
them extras (+30 / +60 / +15 min), and the booking widget then offered, and charged, what the fit
already includes. They keep their pages, prices and content and are sold on their own (asked for). An
admin may still mark any offering as an extra later (Beheer → Aanbod → Extra's).

| What | The run of 20 Oct 2026 | Now |
| --- | --- | --- |
| Voetanalyse, Zadelanalyse, Afstellen schoenplaatjes | also an extra to tick when booking a bikefit: +30 / +60 / +15 min at their price, still sold alone | no extra: sold alone, asked for |
| Bikefit – tweede fiets | an extra only, never booked alone, with two choices the visitor picks from: zelfde type (+30 min, € 75) or ander type (+1 u, € 150); its page links to the bikefit | unchanged |
| Bikefit – aankoop nieuwe fiets, Bikefit – huidige fiets | allow four extras (tweede fiets and the three analyses), in that order: 8 link rows | allow tweede fiets only: 2 link rows |

**Where each environment is.** Staging ran the first version on 20 Oct 2026 (the choices of tweede
fiets with its second run, migration 0016) and production on 21 Oct 2026 (the release of `main`), so
**both hold the state of 20 Oct** and the next run on each is the transition described below; the dry
run prints the same lines on both. The patch knows three states per offering and per group (the extra
columns, the choices, the links): *fresh* (migration 0015 only: a database that never had the first
run, a restored older snapshot, the self-test), *the state of 20 Oct 2026* and *the target*. Fresh and
20 Oct move to the target (`~`), the target is left alone (`=`), anything else was changed in Beheer
since and blocks the patch (`!`): it is never overwritten (the rules are
`scripts/lib/aanbod-extras-targets.mts`, pinned by its unit test). A fresh database needs
migrations 0015 and 0016 first (`npm run db:migrate`, before the build that reads the columns); its
dry run prints three `~` lines (tweede fiets: columns and keuzes; the links of both bikefits) and three
`=` lines (the analyses).

1. Deploy the code first (release gate, READY). For the extras the deploy changes nothing on the
   live site (the widget reads them from the database); the correction comes with the patch. No
   migration. An optional Neon snapshot before the apply; the tool writes its own backup before the
   first write.
2. **Dry run** on staging, then on production (read-only like §9):

   ```bash
   DATABASE_URL='<staging pooled url>' npm run cms:patch-aanbod-extras
   ```

   On a database in the state of 20 Oct 2026 (staging and production) it prints exactly:

   ```text
   ~ offering bikefit-nieuwe-fiets — extra's: bikefit-tweede-fiets (3 verwijderd)
   ~ offering bikefit-huidige-fiets — extra's: bikefit-tweede-fiets (3 verwijderd)
   = offering bikefit-tweede-fiets — as intended
   ~ offering voetanalyse — geen extra meer (was extra, 30 min)
   ~ offering zadelanalyse — geen extra meer (was extra, 60 min)
   ~ offering afstellen-schoenplaatjes — geen extra meer (was extra, 15 min)
   = guards: offerings 9, services <n>, bookings <n>, links 8
   → dry run: run again with --apply to write
   ```

   `links 8` are the eight link rows of 20 Oct (two bikefits, four extras each); `= … as intended`
   for tweede fiets is its columns and its two choices, which the correction leaves alone. **Stop
   and report on any `!` line** (an offering missing → §22 first; extra settings, choices or links
   changed in Beheer since 20 Oct → leave it and tell Toshoni), and on any other difference between
   the two environments.
3. **Apply on staging:** `… -- --apply --expect-host '<host>' --backup-dir <dir>` — `✓ backup
   written` (`aanbod-extras-patch-<timestamp>.json`: the five rows that change, as they are now,
   so `--restore` returns the state of 20 Oct), five `~` lines, `✓ offerings and the public
   catalogue verified` (a bikefit offers the two choices of tweede fiets and nothing else, the
   three analyses are no extra), `✓ offerings, services and bookings: no row added or removed`,
   `✓ apply complete`; audit: five `offering.update` rows and `patch.aanbod-extras.apply`.
4. Dry run again: six `=` lines, `links 2`, `dry run: nothing to do`.
5. **Verify** after the 5-minute cache window: `/aanbod/voetanalyse`, `/aanbod/zadelanalyse` and
   `/aanbod/afstellen-schoenplaatjes` no longer say "Ook te boeken als extra bij …" (they are still
   asked for through the enquiry form); `/aanbod` still lists *Bikefit – tweede fiets* as "Enkel als
   extra bij een afspraak" and its page says "Deze extra boek je samen met …";
   `/afspraak?dienst=bikefit-huidige-fiets` shows, after the choice of the fit, the step "Iets extra
   erbij?" with exactly two choices, *Zelfde type fiets* (+ 30 min · + € 75,00) and *Ander type
   fiets* (1 uur, € 150,00), and a running total; "Kies een dag en uur" names the studio with its
   address (the street comes with `cms:patch-aanbod-correcties`, §24; until then only the name
   shows). Logged in:
   `/admin/aanbod/<id>` of a bikefit lists only *Bikefit – tweede fiets* under "Extra's bij dit
   aanbod" and the "Extra's" card of an analysis is switched off; a booking with the second bike
   lists it under Afspraken.
6. **Production** — steps 2 to 5 again with the production `DATABASE_URL` and host, after
   Toshoni's explicit go (a change to the production database is his call, CLAUDE.md §7). The dry
   run must print the same lines as on staging. Until it runs, the double charge is live there: a
   visitor who ticks an analysis pays for what the fit already includes.

**Rollback:** `npm run cms:patch-aanbod-extras -- --restore <backup.json> --expect-host '<host>'`
puts the backed-up columns, choices and links back. The backup of the run above returns the state
of 20 Oct (the analyses as extras again, four links per bikefit, in their order, which brings the
double charge back: only to undo a wrong apply); a backup of the 20 Oct run returns the bare state
of migration 0015. Migrations 0015 and 0016 are additive and may stay.

**If the apply ends with `verification failed: … is not in the public catalogue` right after the
six `~` lines** (staging, 20 Oct 2026): the writes had landed; the script's own catalogue read
failed on the transport (`[aanbod] offerings_unavailable { error: 'Error' }` — Drizzle's query
error sets no name) after it compiled the offers content module graph for the first time. A dry
run then says `nothing to do`, and the site is not affected. Since PR #35 the script loads that
graph before its first query, reads the catalogue a second time, and the store logs the error's
class chain (`Error>NeonDbError>TypeError`) and no longer caches an empty answer. The
`patch.aanbod-extras.apply` audit row is missing from such a run; the six `offering.update` rows
are there.

## 24. Correcties van 27 oktober (settings, pages, copy, youth package, Toshoni; migration 0017, 27 Oct 2026)

Toshoni's corrections of 27 Oct 2026 live in the code, where a new database picks them up
(`cms:bootstrap`, `cms:seed`), and reach an existing database (staging, production) through **one
guarded command**, `npm run cms:patch-aanbod-correcties` (self-test section 17d). It is the handover
script: on production it makes the changes Toshoni made by hand in Beheer, and nothing else. The data
of the corrections sits next to the seeds (`src/lib/studio/seed-content/corrections-2026-10-27.ts` and
`-copy.ts`, `cadeaubon-promo.ts`, `location-section.ts`; `src/lib/offers/corrections-2026-10-27.ts`),
the rules (what a field must hold before, what it becomes, what blocks) in
`scripts/lib/aanbod-correcties-*.mts`; both are pinned by unit tests.

| What | Before | After | By hand in Beheer |
| --- | --- | --- | --- |
| Contact | no street, city "Ninove"; phone label `0473 95 26 33`, link `tel:0473952633` | Halsesteenweg 406 a, 9403 Neigem; label `+32 473 95 26 33`, link `tel:+32473952633` | Instellingen → Contact |
| SEO defaults | title and description with a dash between two sentences | the colon and comma texts | Instellingen → SEO |
| Settings the code gained | no row `business`, no row `rules` | one row each with the schema defaults: the legal identity behind `{{bedrijf}}`, `{{zetel}}`, `{{kbo}}` and the lengths behind `{{opvolging:…}}`, `{{tweede-bezoek-gratis}}`, `{{cadeaubon-geldigheid}}` | Instellingen → Bedrijfsgegevens, Regels in de teksten |
| Studio location | "De Bikefit Studio, Ninove" without a street | same name, Halsesteenweg 406 a, 9403 Neigem | Locaties |
| Page texts | sentences joined by a dash; the phone number and e-mail typed on the pages; the terms (art. 3), FAQ, privacy, team and studio texts, "lactaattest" as before | the corrections of `CORRECTION_PAGE_SPECS` on every page that has the text; the contact facts as tokens (`{{telefoon}}`, `{{telefoon-href}}`, `{{e-mail}}`, `{{bedrijf}}`, `{{zetel}}`, `{{kbo}}`, `{{adres}}`); meta titles and descriptions | Pagina's |
| `/afspraak` | ends with "Voor je komt" | + the `location` block "Waar vind je ons?" (address, route link, two-click map) as the last block | Pagina's → afspraak |
| Cadeaubon | not promoted | the section "Geef fietsplezier cadeau" on the home page after the offer catalogue; suggested amounts (€ 75 / € 150 / € 275) and the validity line on `/cadeaubon`; the card text on `/aanbod`; "Cadeaubon" in the main menu before "Contact" | Pagina's, Menu's |
| Offerings | the copy of 20 Oct | the corrected copy of the nine (contents, extra's, durations, meta descriptions; *Lactaattest* is now *Inspanningstest*; the Kostprijs of *Bikefit – tweede bezoek* is stored as "Gratis binnen {{tweede-bezoek-gratis}} na je fit, daarna {{prijs:bikefit-tweede-bezoek:all}}" and shown as "Gratis binnen zes maanden na je fit, daarna € 75") | Aanbod |
| Youth package | two variants on the bikefits | + "Jeugd – volledig pakket" (€ 275) on both; on *Bikefit – huidige fiets* with its booking service `jeugdfit-pakket` ("Jeugdfit – volledig pakket", 2 hours, guardian required) offered by every active provider of *Jeugdfit – eenmalig* except Toshoni (none: the patch stops, `!`) | Aanbod |
| Booking services | `volwassenenfit`, `jeugdfit` with the texts of 20 Oct | the texts of `DEFAULT_SERVICES` ("Jeugdfit – eenmalig", label "Jeugd – eenmalig"); durations: the new-bike variants 2 hours, voetanalyse 30, zadelanalyse 60, schoenplaatjes 15 minutes, for an offering that has a booking service | Aanbod (variants) |
| Toshoni | offers the booking services | offers none; his provider row, hours, calendar link and bookings stay | Aanbieders |

Every correction names the value it expects. A field that holds the old value is changed (`~`), one
that already holds the target is left (`=`), one that holds neither was edited in Beheer since and
blocks the whole run (`!`): nothing is overwritten, there is no override flag. A page with unpublished
draft edits blocks too (the tool never publishes an editor's draft). Never touched: the extra's
(§23, which runs first), prices, bookings, the provider rows, users, media, redirects and every
page the specs do not name.

**Where each environment is.** Both hold the state of §22 (prices) and of §23 (the extra's of 20 Oct;
the correction of §23 still has to run), and neither has migration 0017. Staging has one provider,
the profile "Toshoni Van Craen" (login `toshoni@gmail.com`, made by `cms:seed-booking`); production
has "Toshoni" and a second provider. **Who Toshoni is**, for every step of the patch (his removal, the
package's providers, the verify): the provider whose login is the default of `cms:seed-booking`
(`toshoni@gmail.com`), or whose display name is exactly "Toshoni" or "Toshoni Van Craen" (case,
spacing and accents aside, never a part of a name); the output names him by his display name only.
The rule fails closed: when the database has providers and no profile matches, or more than one
does, that is a `!` (below), never "no such provider" and carry on; only a database without any
provider prints `= provider Toshoni — no providers in this database: nothing to remove` (neither
staging nor production). The patch will not take him off a service that no other active provider
offers, nor make a youth package that only he would offer (`!`), so on staging it stops at the dry
run until a replacement provider offers `volwassenenfit` and `jeugdfit` (Beheer → Aanbieders): a
decision for Toshoni, not for the tool. That provider then also gets the new package service.
Staging's `/afspraak` still has the meta description of the very first seed (24 Sep 2026, "Bikefits
in Ninove gaan door op afspraak. Bel 0473 95 26 33, …"): `cms:seed -- --refresh-slug` never writes a
page's title or SEO fields (§21). It is a seed's text, so the patch accepts it as an old state
(`alsoFrom` of the page's guard) and writes the new one; any other text there still blocks.

**Order, per environment** (staging first; production only after Toshoni's explicit go, CLAUDE.md §7):

1. Optional Neon snapshot before the first write. The tool writes its own backup as well.
2. `DATABASE_URL='<url>' npm run db:migrate`: migration 0017 (additive, guarded; §3.1) **before the
   build**, which selects `cms_offerings.price_text` on every offering read.
3. `cms:patch-aanbod-extras`: dry run, apply, dry run (§23 steps 2 to 4). It needs no new build (the
   running widget reads the extra's from the database), so it goes first and ends the double charge
   on the analyses at once.
4. **Deploy this build** (release gate green, READY). It has to be live before step 5: the patch
   publishes a `location` block, and a build that does not know a block type counts a snapshot with
   it as unpublished (`cms-architecture.md` §5, "The `location` block"), so the page would go dark.
5. `cms:patch-aanbod-correcties`: dry run, apply, dry run (below).
6. Verify after the 5-minute cache window (below).

**Do not save a bikefit between steps 4 and 5.** *Bikefit – huidige fiets* and *Bikefit – aankoop
nieuwe fiets* must not be saved in Beheer → Aanbod in that window. The form of the new build shows the
third variant, and a save of the directly booked fit creates its booking service under the name the
repo derives from the offering (`bikefit-huidige-fiets-jeugd-pakket`, "Bikefit – huidige fiets –
Jeugd – volledig pakket") instead of `jeugdfit-pakket`; it also rewrites the name, label and
description of the other two services from the offering. The patch adopts a service that exists
(it never renames or deletes one), so the wrong name would stay until someone renames it. The same
rewrite happens on every later save of a bikefit (§22), so the service texts this patch writes hold
until the next save of that offering.

1. **Dry run** (read-only like §9; no session, no write call, no audit entry):

   ```bash
   DATABASE_URL='<staging pooled url>' npm run cms:patch-aanbod-correcties
   ```

   On a database in the state described above, with a second provider who offers the fits
   (production; staging once it has one), it prints, in this order (`<n>` is a count of this
   database; each page line is followed by an indented line per change):

   ```text
   → driver: neon-http (<host>)
   → mode: dry run (nothing is written)
   = would act as <e-mail of the admin the tool uses> (no session is created in a dry run)
   ~ setting contact — address: Ninove → Halsesteenweg 406 a, 9403 Neigem; phone label: 0473 95 26 33 → +32 473 95 26 33; phone link: tel:0473952633 → tel:+32473952633
   ~ setting seo — defaultMetaTitle: "De Bikefit Studio — professionele bikefit in Ninove" → "De Bikefit Studio: professionele bikefit in Ninove"; defaultMetaDescription: "…" → "…"
   ~ setting business — new row with the schema defaults
   ~ setting rules — new row with the schema defaults
   ~ location De Bikefit Studio, Ninove — address: Ninove → Halsesteenweg 406 a, 9403 Neigem
   ~ variant bikefit-nieuwe-fiets — Jeugd – volledig pakket: add variant at € 275
   ~ variant bikefit-huidige-fiets — Jeugd – volledig pakket: add variant at € 275; new service jeugdfit-pakket ("Jeugdfit – volledig pakket", 120 min, € 275); offered by <n> provider(s)
   ~ service volwassenenfit — description: "…" → "…"
   ~ service jeugdfit — name: "…" → "Jeugdfit – eenmalig"; choiceLabel: "…" → "Jeugd – eenmalig"; description: "…" → "…"
   = duration bikefit-nieuwe-fiets — no booking service (asked for): nothing to set
   = duration voetanalyse — no booking service (asked for): nothing to set
   = duration zadelanalyse — no booking service (asked for): nothing to set
   = duration afstellen-schoenplaatjes — no booking service (asked for): nothing to set
   ~ offering bikefit-nieuwe-fiets — contents: 5 → 7 item(s), 3 changed; extras: 3 → 2 item(s), 3 changed; metaDescription: "…" → "…"; duration: "2 uur" → "{{duur:volwassenenfit}}"
   ~ offering bikefit-huidige-fiets — contents: 6 → 7 item(s), 2 changed; extras: 3 → 3 item(s), 2 changed; metaDescription: "…" → "…"
   ~ offering bikefit-tweede-bezoek — summary: "…" → "…"; goal: "…" → "…"; contents: 4 → 4 item(s), 2 changed; priceText: "" → "Gratis binnen {{tweede-bezoek-gratis}} na je fit, daarna {{…"; metaDescription: "…" → "…"
   ~ offering bikefit-tweede-fiets — contents: 3 → 3 item(s), 2 changed; duration: "30 minuten tot 1 uur extra, aansluitend op je bikefit" → "Extra tijd bovenop je bikefit, aansluitend op je afspraak"; metaDescription: "…" → "…"
   ~ offering voetanalyse — metaDescription: "…" → "…"
   ~ offering zadelanalyse — metaDescription: "…" → "…"
   ~ offering afstellen-schoenplaatjes — metaDescription: "…" → "…"
   ~ offering lactaattest — title: "Lactaattest" → "Inspanningstest"; metaDescription: "…" → "…"
   ~ offering coaching — extras: 3 → 3 item(s), 1 changed; metaDescription: "…" → "…"
   ~ provider <his display name> — <n> offering(s) removed: jeugdfit, volwassenenfit
   → provider list: cached for up to 5 minutes, so <his display name> leaves the options within that time
   ~ menu main — insert "Cadeaubon" (/cadeaubon) before "Contact"
   ~ page / — <n> change(s), then publish
   ~ page /aanbod — <n> change(s), then publish
   ~ page /afspraak — <n> change(s), then publish
   ~ page /algemene-voorwaarden — <n> change(s), then publish
   ~ page /bikefit — <n> change(s), then publish
   ~ page /cadeaubon — 3 change(s), then publish
   ~ page /contact — 4 change(s), draft only
   ~ page /ons-team — <n> change(s), then publish
   ~ page /privacy — <n> change(s), then publish
   ~ page /veelgestelde-vragen — <n> change(s), then publish
   ~ page /voor-wie — <n> change(s), then publish
   = guards: pages <n>, blocks <n>, offerings 9, variants <n>, services <n>, bookings <n>, providers <n>, subscriptions <n>
   → after the apply: blocks <n> (+2), variants <n> (+2), services <n> (+1), subscriptions <n> (-<m>)
   → dry run: run again with --apply to write
   ```

   **On staging as it is now** (Toshoni Van Craen the only provider) the same lines come out with
   these differences: the package line has no `offered by`, the provider line names him and is not
   followed by the `→ provider list` line, the `/afspraak` page lists the first seed's text as the
   old meta description, and the run ends on the stop:

   ```text
   ~ variant bikefit-huidige-fiets — Jeugd – volledig pakket: add variant at € 275; new service jeugdfit-pakket ("Jeugdfit – volledig pakket", 120 min, € 275)
   ~ provider Toshoni Van Craen — <n> offering(s) removed: <the services he offers>
   ~ page /afspraak — <n> change(s), then publish
       metaDescription: "Bikefits in Ninove gaan door op afspraak. Bel 0473 95 26 33…" → "Boek je bikefit in Ninove online: kies je fit, een dag en e…"
   ! offering bikefit-huidige-fiets: Jeugd – volledig pakket would be offered by no provider — add a replacement provider for jeugdfit in Beheer → Aanbieders first
   ! provider Toshoni Van Craen: service volwassenenfit would be left without a provider — add a replacement provider for it in Beheer → Aanbieders first
   ! provider Toshoni Van Craen: service jeugdfit would be left without a provider — add a replacement provider for it in Beheer → Aanbieders first
   → dry run: blocked — fix the items marked ! first
   ```

   (one `! provider` line per active service he alone offers, in the order of his offerings). Once a
   replacement provider offers both fits, the dry run prints the block above, with
   `offered by <n> provider(s)` and `~ provider Toshoni Van Craen`.

   What varies by database, and is no reason to stop: the old values inside the `service` lines (the
   texts of `cms:bootstrap`, or what the save of the bikefit wrote on 20 Oct, "Bikefit – huidige
   fiets – Jeugd" and the offering's summary; both are accepted as the starting state); a
   `~ duration <offering> — 60 → <n> min` in place of the `=` line for an offering whose online
   booking was switched on in Beheer (60 is what the form pre-fills); the line `~ page /contact`,
   which is there only where the retired draft of `/contact` exists (it stays unpublished);
   `offered by <n> provider(s)` and the provider line, which follow who offers what and name the
   provider's display name; the old `/afspraak` meta description in that page's change list (the
   rollout text, or on staging the first seed's). The change
   counts of the pages follow the build. An unpublished page that the repo would refuse to save
   (an old block type) prints `= page <path> — not published, left alone (…)`; a page the specs
   name that is missing or unpublished is a blocker.

   **Stop and report on any `!` line.** The usual ones: `! provider <his display name>: service
   <slug> would be left without a provider — add a replacement provider for it in Beheer →
   Aanbieders first` and `! offering bikefit-huidige-fiets: Jeugd – volledig pakket would be offered
   by no provider — add a replacement provider for jeugdfit in Beheer → Aanbieders first` (staging
   until a replacement provider exists; production if the other provider does not offer every
   service); `! provider Toshoni: no provider profile matches (display name "Toshoni" or "Toshoni
   Van Craen", or the login of cms:seed-booking) — stop and report; check Beheer → Aanbieders, do not
   rename a profile blindly` (his profile was renamed or is on another login: which profile is his
   is Toshoni's answer, not the operator's guess; the line `= provider Toshoni — no such provider`
   of earlier versions is no longer printed and never a reason to go on); `! provider Toshoni: <n>
   provider profiles match — "<name>" (by display name), "<name>" (by login), …; rename the one
   that is not his in Beheer → Aanbieders (or change its login), then run again` (the display name
   is the Weergavenaam in Beheer → Aanbieders; a login cannot be changed in Beheer, so renaming is
   the usual fix and a login change is a database change for Toshoni to decide; the login itself is
   never printed);
   `! setting contact: …`, `! offering <slug>: …` or `! page <path>: … (edited since the rollout?)`
   or `! page <path>: meta description is "…", not the text it was rolled out with`
   (a field was changed in Beheer: tell Toshoni, leave it, never force it); `! page <path>: has
   unpublished draft edits; publish or discard them in /admin first`; `! offering <slug>: missing —
   run cms:patch-aanbod-prijzen first`. The verdict is then `dry run: blocked — fix the items marked
   ! first`, and `--apply` refuses with the same list before it writes anything: it plans on a
   read-only handle before it opens its admin session, so a refused apply leaves no session, no
   backup and no audit entry. Compare staging with production: the lines must be the same apart
   from the counts, the old texts and the provider lines.
2. **Apply on staging** (the tool writes its own backup before the first write):

   ```bash
   DATABASE_URL='<staging pooled url>' npm run cms:patch-aanbod-correcties -- --apply \
     --expect-host '<host part of the staging DATABASE_URL>' --backup-dir <dir>
   ```

   It prints `✓ backup written: <dir>/aanbod-correcties-patch-<timestamp>.json` (every row it is
   about to change, as it is now, plus what it will create and remove), the same `~` lines, then
   `✓ settings, menu, offerings, services and published pages verified on the public readers`,
   `✓ row counts as planned (blocks <n> (+2), variants <n> (+2), services <n> (+1), subscriptions <n>
   (-<m>)); bookings and providers unchanged`, `✓ apply complete` and `→ deployed sites pick this up
   within 5 minutes (cache fallback); the provider list too`.

   The writes go in this order, settings first so that the contact tokens on the pages resolve to
   the new values from the moment a page publishes: the settings, the location, the youth package
   (service, variant, providers), the copy and durations of the services, the offerings, Toshoni's
   offerings, the menu, the pages (each published like `cms:patch-page-cleanup`; a page that is a
   draft stays a draft). The verify is a second plan that must find nothing left, the row counts of
   every table, and the public readers: the catalogue (three labelled variants on both bikefits,
   the Kostprijs text, the durations), the settings, the menu order, the location and voucher
   blocks in the draft and in the published snapshot, the provider list without Toshoni (the
   provider the second plan finds by the same rule, looked up by id), and
   `correctionProblems` on each published page. Audit: the repos' own entries (`settings.update`,
   `location.update`, `service.create`, `service.update`, `provider.services`,
   `navigation.update`, `block.add`/`block.update`/`block.delete`, `page.update`, `page.publish`),
   `offering.update` for each offering and variant row it writes, and
   `patch.aanbod-correcties.apply` with the backup's file name. The admin session of the run is
   always revoked.
3. Dry run again: every line `=`, the closing line `= dry run: nothing to do`; the guards line shows
   the counts after the apply.
4. **Verify** after the 5-minute window (the provider list is cached for as long), on the site:
   - `/afspraak`: the last section is "Waar vind je ons?" with Halsesteenweg 406 a, 9403 Neigem, the
     route link and the button "Kaart tonen" (no request to Google before the click); the fit
     choice offers Volwassene (€ 275), Jeugd – eenmalig (€ 150) and Jeugd – volledig pakket (€ 275);
     the provider choice no longer lists Toshoni (on staging: Toshoni Van Craen); the phone number
     is `+32 473 95 26 33`.
   - Home: "Geef fietsplezier cadeau" after the offer catalogue; the main menu has *Cadeaubon* before
     *Contact*; the footer and the contact block show the new address and phone number.
   - `/cadeaubon`: the three amounts and the validity line; `/aanbod`: the card text of the
     voucher; *Lactaattest* reads *Inspanningstest* everywhere; `/aanbod/bikefit-tweede-bezoek`
     reads "Gratis binnen zes maanden na je fit, daarna € 75" as its Kostprijs;
     `/aanbod/bikefit-huidige-fiets` and `/aanbod/bikefit-nieuwe-fiets` show the youth package.
   - `/privacy`: "Laatst bijgewerkt: 27 oktober 2026" and the paragraph on the map of Google Maps;
     `/algemene-voorwaarden`: "Versie van 27 oktober 2026", article 3 without the old list of
     services.
   - Logged in: Instellingen → Contact, Bedrijfsgegevens and Regels in de teksten hold their values;
     Aanbieders → Toshoni (on staging: Toshoni Van Craen) offers nothing, the other provider offers
     the fits and the package;
     Auditlog lists the entries above.
5. **Production**: the order above again with the production `DATABASE_URL` and host, after
   Toshoni's explicit go. The dry run must print the same lines as on staging, apart from the
   counts and the provider lines.

**Rollback:** `npm run cms:patch-aanbod-correcties -- --restore <backup.json> --expect-host '<host>'`
puts the rows of the backup back and removes what the apply created: the pages (draft blocks and
published snapshot as they were) and the menu, Toshoni's offerings, the variant rows (the two
created ones are deleted) and the package service (deleted; switched off instead when a booking
already uses it), the changed columns of the services and the offerings, the location and the
settings (the two rows the apply created are deleted). Audit: `patch.aanbod-correcties.restore`.
Use the backup of the **first** run: an apply repeated after a partial failure writes a new backup
of the half-done state. Afterwards the dry run lists everything as `~` again. Migration 0017 is
additive and may stay.

**Notes.**

- **No transactions on Neon's HTTP driver.** The apply writes section by section and every section
  skips what already holds the target, so after a failure (a refused write, a transport error) the
  same command is simply run again; the backup was written before the first write. The tool loads
  its write side and the readers of the verify before its first query (the keep-alive lesson of
  §22).
- **`cms:seed-booking` re-subscribes the first provider** to every bootstrap service (idempotent
  inserts). Do not run it for Toshoni after this patch, or he is offered again; the next dry run
  would plan his removal a second time.
- **A later save of a bikefit in Beheer → Aanbod** rewrites the name, label and description of its
  booking services from the offering ("<title> – <label>"); the service texts of this patch hold
  until then (§22).
- **The 5-minute cache** applies to the pages, the catalogue and the provider list; an admin sees
  the draft at once.
