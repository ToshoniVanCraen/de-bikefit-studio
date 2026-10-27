# Engineering best practices — De Bikefit Studio website

Companion to [`../../CLAUDE.md`](../../CLAUDE.md), which stays the contract: checks, layers, env, validation,
database, design tokens, language, security (§4), testing (§5), git (§7) and docs (§8). This file says how
modules are shaped, named, typed, split and reviewed so the app grows by adding small modules, not by growing
big ones. Where CLAUDE.md already rules, this file points to it instead of repeating it.

**Status.** Adopted 20 Oct 2026 (Toshoni). The rules apply to every new or touched module from now on; the
divergences in §16 are fixed in a dedicated review-and-refactor pass (planned for the week of 27 Oct 2026),
not piecemeal in feature branches.

**Reading a rule.** ID, rule in bold, *why*, *check* (command, threshold or reviewer question), *example*. Commands
run read-only from `website/` (WSL or Git Bash). "Lint candidate": `eslint-config-next`'s plugins can enforce it.

**Scope.** `website/src` and `website/scripts`. The legacy webshop is exempt until someone changes it:
`src/app/{(shop),(webshop),(content),(auth)}`, `src/app/api/{checkout,webhooks}`,
`src/components/{shop,shell,layout}`, `src/lib/{cart-store,stripe,format,mdx,nav,sample-products}.ts`,
`src/db/{index,queries,schema}.ts`.

**Module kinds.** *Pure*: no I/O, no Next, no `server-only`; importable from server, client, tests and
scripts. *Server-only*: starts with `import 'server-only'`. *Node-loadable*: server code the CLIs import, so
it carries no marker and says why (B2). *Action*: a `'use server'` module. *Client leaf*: a `'use client'`
component, a hook, or a file imported only by them.

---

## 1. Module boundaries and dependency direction

**B1. Writes go page → server action → repo → Drizzle; reads go page → cached reader or permission-checked
repo read.** *Why:* the repo is where permission, validation, audit and cache bust cannot be forgotten.
*Check:* `grep -rnE "getCmsDb|from 'drizzle-orm'|from '@/db/cms'" src/app src/components src/lib/cms/actions`
lists only legacy webshop files. *Example:* `components/admin/review-decision-form.tsx` →
`lib/cms/actions/reviews.ts` → `setReviewStatus()` in `lib/booking/reviews.ts`.

**B2. Every module under `src/lib`, and every non-component `.ts` under `src/components`, shows its kind in
its first lines;** a Node-loadable module says in its header why it is not `server-only` and imports
`next/headers` lazily. *Why:* the kind decides who may import a file; an unmarked database module slips into
a test or a client bundle. *Check:* this prints nothing:
`` for f in $(grep -rlE "from '(@/db/cms|drizzle-orm|next/(headers|cache))'" src/lib --include=*.ts | grep -v '\.test\.ts'); do grep -qE "^import 'server-only'|^'use server'" $f || grep -qi 'not `server-only`' $f || echo $f; done ``.
*Example:* `src/lib/rate-limit.ts` ("not `server-only`, so the self-test loads it"); `src/lib/cms/session.ts:284`.

**B3. A pure module never imports a server-only or action module at runtime.** `import type` is fine; a value
it needs moves to a pure sibling or is imported lazily inside the one function that needs it. *Check:*
reviewer opens each value import of a pure file. *Example:* `src/lib/booking/settings.ts:38` imports
`@/lib/cms/content` inside `getBookingRules()` only.

**B4. A client leaf imports only pure modules, `@/lib/cms/actions/state` (client-safe form state; its server
half is `run.ts`), server actions and other client leaves; `@/db/*` and server modules only via `import
type`.** *Check:* `for f in $(grep -rl "^'use client'" src); do grep -Hn "from '@/db" $f | grep -v "import type"; done`
prints nothing. *Example:* `src/components/admin/locations-manager.tsx:26`.

**B5. Areas depend downward only.**

| Layer | Modules | May import at runtime |
| --- | --- | --- |
| 0 Foundation | `src/lib/{env,secrets,html,request-ip,email-address,sealed-box,rate-limit,utils}.ts`, `src/db/*` | npm packages, each other |
| 1 Core | `src/lib/cms/**` except `actions/` and `offers-content.ts`; `src/lib/email/**` | layer 0; pure modules of layer 2 |
| 2 Domains | `src/lib/{booking,offers,gift-voucher,offer-enquiry,staging-gate,analytics,security}/**` | layers 0–1; another domain's pure modules and entry points (`content.ts`, `repo.ts`, exported tags) |
| 3 Composition | `src/lib/cms/actions/**`, `src/lib/cms/offers-content.ts`, `src/lib/studio/**`, `src/components/**`, `src/app/**` | anything below |

*Why:* a fixed direction lets an area be split or tested without dragging its callers along. *Check:*
`grep -rnE "from '@/lib/(booking|offers|gift-voucher|offer-enquiry|staging-gate|analytics)/" src/lib/cms src/lib/email --include=*.ts | grep -v -e /actions/ -e offers-content -e '\.test\.'`
lists only pure targets. *Example:* `src/lib/email/templates.ts` imports only `booking/time.ts` and `format.ts`.

**B6. `src/lib` never imports `src/components` or `src/app`.** *Check:* `grep -rnE "from '@/(components|app)/" src/lib`
prints nothing. *Example:* `src/lib/cms/actions/state.ts`, which components import, lives in `src/lib`.

**B7. No runtime import cycles.** *Why:* cycles make initialisation order-dependent and block any split.
*Check:* lint candidate `import/no-cycle`; until then, when A gains an import of sibling B, `grep -n "from
'./A'" B.ts` is empty. *Example:* `public-booking-input.ts`, a leaf shared by `public-booking.ts` and its test.

## 2. File and module size

**S1. No module over 500 lines, tests and self-test sections included; a file already over 500 may not
grow.** *Why:* big files mix concerns and are where parallel agents collide (CLAUDE.md §3, §9). *Check:*
`find src scripts \( -name '*.ts' -o -name '*.tsx' -o -name '*.mts' \) -print0 | xargs -0 wc -l | awk '$1 > 500 && $2 != "total"'`;
a listed file's net diff is ≤ 0 lines. *Example:* `booking/repo-shared.ts`, split "so neither file grows past the limit".

**S2. Split in this order, smallest safe step first:** (1) pure helpers and constants → `<topic>.ts` + test;
(2) zod schemas and field rules → `<topic>-input.ts`; (3) decisions → `<topic>-policy.ts`; (4) fixed error
texts → `<topic>-errors.ts`; (5) state and effects → `use-<topic>.ts`; (6) presentational parts →
`<topic>-panel.tsx`, `-picker.tsx`, `-step.tsx`; (7) repo functions per entity → `repo-<topic>.ts`, their
helpers → `repo-shared.ts`; (8) scripts: planning → `<topic>-plan.mts`, writing → `<topic>-patch.mts`, mode
dispatch → `<topic>-run.mts`. *Why:* pure parts first keeps every step unit-tested and moves no I/O.
*Check:* reviewer asks which step it is and where the extracted part's test is. *Example:*
`public-booking-input.ts`; `slot-grouping.ts` and `use-month-availability.ts` out of `booking-widget.tsx`;
`scripts/lib/page-cleanup-{plan,patch}.mts`.

**S3. A split keeps callers stable:** the original module re-exports the new one, or the new module is an
entry point listed in its area's architecture doc. *Example:* `booking/repo.ts:97-109` re-exports
`repo-services.ts`; `repo-assignment.ts` is listed in `booking-architecture.md` §1.

**S4. One concern per file; a `.tsx` exports one public component** (plus its props type). *Check:*
`grep -cE '^export function [A-Z]' <file>` above 1 → reviewer asks why.

## 3. Naming and file layout

**N1. File names are kebab-case; exports are named; `export default` only where Next or a tool needs it**
(route files, `sitemap`, `robots`, configs). Identifiers and comments are English; product nouns may stay
Dutch (`aanbod`, `cadeaubon`). *Check:* `grep -rln '^export default' src/components src/lib` prints nothing.

**N2. The file name states the role, from this vocabulary.** *Check:* a file whose content contradicts its
suffix (a query in a `-policy.ts`, a hook outside `use-*.ts`) is renamed or split.

| Name | Kind | Holds |
| --- | --- | --- |
| `repo.ts`, `repo-<topic>.ts`, `repo-shared.ts` | server-only | permission-checked admin reads and writes |
| `content.ts`, `<topic>-store.ts` | server-only | cached public readers |
| `service.ts` | server-only | wires database, settings and mail into a pure flow |
| `actions.ts`, `actions/<topic>.ts`, `public-actions.ts` | action | server actions |
| `<topic>-input.ts`, `-policy.ts`, `-errors.ts`, `-log.ts` | pure | form schema; decisions; fixed error texts; safe log helpers |
| `format.ts`, `time.ts`, `templates-<topic>.ts`, `defaults.ts` | pure | formatting, time zones, e-mail bodies, bootstrap data |
| `types.ts` | pure | serialisable props of a component tree |
| `load.ts`, `<topic>-admin.ts`, `<topic>-rows.ts` in `components/` | server-only | map readers onto a component's props |
| `use-<topic>.ts` | client | one hook |
| `scripts/<npm-name>.mts`, `scripts/lib/<topic>-{plan,patch,run}.mts`, `scripts/selftest/<topic>.mts` | script | CLI shell, core, self-test section |

**N3. A test sits next to its module and carries its name;** a large one splits by topic as
`x-<topic>.test.ts`. *Example:* `cms/guard.test.ts` + `guard-roles.test.ts`; `templates-footer.test.ts`.

**N4. A shared value has one exported name and is never re-typed:** cache tags (`CMS_TAGS`, `BOOKING_TAG`,
`OFFERING_TAG`), `BOOKING_TIMEZONE`, limits, patterns (slug, e-mail), result helpers. *Why:* copies drift.
*Check:* `grep -rnE "(tags: \[|TAGS = \[)[^]]*'" src scripts --include=*.ts --include=*.mts` and
`grep -rn "'Europe/Brussels'" src | grep -v -e booking/time.ts -e db/cms-schema.ts` print nothing; search
before writing a helper (CLAUDE.md §3). *Example:* `[CMS_TAGS.all, OFFERING_TAG, BOOKING_TAG]` (`offering-store.ts`).

## 4. Typing

**T1. No `any`, `@ts-ignore`, `@ts-expect-error` or non-null `!` in `src/` outside tests; in scripts only
behind `eslint-disable-next-line` with a reason.** *Why:* each switches off the check that catches the next
refactor. *Check:* `grep -rnE '(: any|as any|<any>)\b|@ts-(ignore|expect-error)' src | grep -v '\.test\.' | grep -vE ':[0-9]+:\s*(\*|//)'`;
`grep -rnE '[A-Za-z0-9_)]!(\.|\)|;|,)' src --include=*.ts --include=*.tsx | grep -v -e '\.test\.' -e '!='`.
Lint candidate: `@typescript-eslint/no-non-null-assertion`. *Example:* `booking/availability.ts`.

**T2. zod at every boundary:** FormData after the field helpers, JSON bodies, search params, cookies and
signed tokens, third-party responses, JSON columns read back, backups read by scripts. `as T` on
`response.json()` or `JSON.parse()` is a defect, and so is a hand-written `typeof` chain where a schema fits.
*Check:* every hit of `grep -rnE "\.json\(\)|JSON\.parse\(" src --include=*.ts | grep -v test` feeds a
`safeParse`. *Example:* `publicBookingInputSchema`; `parsePublishedSnapshot()` (`cms/blocks.ts`);
`rolloutBackupSchema` (`scripts/lib/aanbod-rollout.mts:60`).

**T3. Types are derived, not restated:** `z.infer`/`z.input` from the schema, `$inferSelect` from Drizzle.
*Example:* `ServiceInput = z.input<typeof serviceInputSchema>` (`booking/repo-services.ts:72`);
`OfferingRow` (`scripts/lib/aanbod-prices-plan.mts:24`).

**T4. Expected failures are values: a union on `ok`, with a `code` union when callers branch.** Throw only
for programmer errors and `CmsAuthError`, which `runAction` converts. *Check:* reviewer: can a caller tell
failure by `result.ok` alone, and does it carry a Dutch `message`? *Example:* `createPublicBooking()`
(`'invalid' | 'rate_limited' | 'slot_taken' | 'error'`); `sendEmail()` never throws.

**T5. Functions do not mutate inputs; read-only parameters are `readonly T[]` / `Readonly<T>` in new code.**
*Check:* `.push/.splice/.sort/.reverse` on a parameter is a defect. *Example:* `extrasTargets(defaults:
readonly DefaultOffering[])` (`scripts/lib/aanbod-extras-targets.mts`).

**T6. Values crossing a cache, action or server→client boundary are plain JSON:** instants as ISO strings,
local dates `YYYY-MM-DD`, money as integer cents; never `Date`, `Map`, `Set`, class or function. *Example:*
`getPublishedPage()` returns ISO dates; `components/studio/booking/types.ts`.

**T7. Tables over a union are exhaustive (`Record<Union, T>`, `satisfies`), never hidden behind
`default:`.** *Example:* `AUTH_ERROR_MESSAGES` (`cms/actions/run.ts`); `BOOKING_STATUS_LABELS`.

## 5. Server actions

**A1. An admin action is `(prev: ActionState, form: FormData) => Promise<ActionState>` with its body inside
`runAction()`;** only redirect-only actions (logout) skip it. *Why:* `runAction` turns auth errors into Dutch
state and logs a fixed code for the rest. *Check:* `grep -L runAction src/lib/cms/actions/*.ts` lists only
helpers and tests. *Example:* `cms/actions/services.ts`.

**A2. FormData is read through `field` / `nullableField` / `boolField`;** raw `form.get()` only for passwords
(never trimmed), files and `getAll()` lists, each validated on the next line. *Check:* `grep -rn "form\.get("
src/lib | grep -v state.ts`. *Example:* `cms/actions/auth.ts:18`.

**A3. Actions are thin: parse → one repo call → revalidate admin paths → Dutch message.** No Drizzle,
`getCmsDb()`, `can()` or `recordAudit()`. *Check:* `grep -lE "drizzle-orm|getCmsDb|recordAudit"
src/lib/cms/actions/*.ts src/lib/*/actions.ts src/lib/booking/public-actions.ts` prints nothing.

**A4. The repo validates again:** action parsing is for good messages, the repo's schema is the boundary
because scripts and tests call it directly. *Example:* `parseServiceForm()` and `serviceInputSchema`.

**A5. Actions revalidate admin views (`revalidatePath('/admin/…')`); repos bust public caches
(`revalidateContent({ tags })`).** *Check:* `grep -rnE "revalidateTag|updateTag" src | grep -v cms/repo.ts`
prints nothing. *Example:* `revalidateServiceViews()` and `bust()` (`booking/repo-shared.ts`).

**A6. A public action takes `unknown`, shape-checks it with zod, reads the IP via `clientIpFromHeaders()`,
catches everything, logs a fixed code and returns a plain union without contact data.** *Example:*
`gift-voucher/actions.ts`, `booking/public-actions.ts`.

## 6. Data access

**D1. Every exported repo function guards first; a write then validates, writes, calls `recordAudit()` and
busts its tags, in that order.** The guard (`requirePermission()` or a `require<Scope>()` wrapper) precedes
the first query, admin reads included. *Check:* the first statement of each `export async function` in
`repo*.ts` is a guard. *Example:* `createService()` (`booking/repo-services.ts`); `listPages()`.

**D2. Repos return `RepoResult<T>` with a Dutch message, built by one shared `ok`/`err` pair.** *Check:*
`grep -rnE "^(export )?const (ok|err) =" src/lib` finds one definition.

**D3. No transactions: order writes so a half-way failure leaves valid data; make what must be atomic one
statement** (conditional `UPDATE … WHERE`, `ON CONFLICT`, `DELETE … RETURNING`). *Why:* neon-http throws on
`db.transaction()`. *Check:* `grep -rn "\.transaction(" src scripts` finds only the comment in `src/db/cms.ts`.
*Example:* `publishPage()` writes the snapshot last; `deletePageRow()`; `cancelBooking()`.

**D4. Migrations are generated (`db:generate -- --name=…`), additive and guarded per statement, with a header:**
what and why, the doc §, which rows change (usually none) and "apply before deploying" when needed. Schema
sits in one file per concern (`src/db/cms-<topic>-schema.ts`, in `drizzle.config.ts`). *Check:*
`grep -nE "CREATE (UNIQUE )?(TABLE|INDEX) " drizzle/*.sql | grep -v "IF NOT EXISTS"`,
`grep -n "ADD COLUMN" drizzle/*.sql | grep -v "IF NOT EXISTS"`, `grep -nE "^\s*(DROP|TRUNCATE)|ALTER
COLUMN|RENAME" drizzle/*.sql` print nothing; each `ADD CONSTRAINT` sits in a `duplicate_object` block.
*Example:* `drizzle/0015_cms_offering_addons.sql`.

**D5. Code survives "deployed before migrated" by failing closed:** a missing table turns the feature off with
a fixed log code and the page renders. *Example:* `getOfferingStore()` answers `storeAvailable: false`.

**D6. Seeds, bootstrap and patches are idempotent:** create-if-missing by natural key, never overwrite edited
data without an explicit flag, a second run reports nothing to do. *Check:* reviewer runs it twice on PGlite.
*Example:* `cms:bootstrap` fills only an empty `choice_label`; `cms:seed -- --only-missing`.

## 7. Caching

**C1. The public site reads through cached readers (`content.ts`, `*-store.ts`): `unstable_cache` keyed by a
prefix plus every argument, tags from exported constants, `revalidate: 300`.** *Why:* tags show a write at
once; the fallback heals a missed bust. *Check:* `grep -rln unstable_cache src` lists only readers; the key
array matches the parameters. *Example:* `getPublishedPage()`, key `['cms-published-page', locale, slug]`.

**C2. `React.cache` dedupes per request what several components read** (`getCurrentCmsUser()`,
`loadOfferCatalogue()` in `cms/offers-content.ts:27`).

**C3. Live data is uncached on purpose and its doc comment says so** (`getAvailability()`, `countEligibleProviders()`).

**C4. `force-dynamic` only with a comment directly above naming the per-request input;** otherwise tags, or
`connection()` as in the admin. *Check:* `grep -rn -B3 "dynamic = 'force-dynamic'" src/app`. *Example:*
`app/staging-toegang/page.tsx:20-23`; `app/admin/layout.tsx`.

## 8. Errors and logging

**L1. A server log line is `console.error|warn('[area] snake_case_code', { safe fields })`:** ids, counts,
HTTP status, a validated error class name; no sentences, nothing interpolated into the code. *Check:*
`grep -rnE "console\.(error|warn|info)\(" src | grep -v test | grep -vE "\('\[[a-z-]+\] [a-z_]+'"` lists
only central helpers. *Example:* `'[cms] action_failed'` (`run.ts`); `logBookingFailure()` (`booking-log.ts`).

**L2. A caught error is never logged or returned as-is:** `catch {` without binding, or its class name via one
shared helper. *Why:* a Drizzle message embeds every bound value. *Check:* `grep -rnE
"console\.(error|warn)\([^;]*, (error|err|e)\)" src | grep -v test` prints nothing. *Example:* `orderGiftVoucherAction()`.

**L3. Messages people read are Dutch, short and from a constant table per flow; stored error texts are
fixed too.** *Example:* `LOAD_ERROR`, `BOOK_ERROR` (`public-actions.ts`); `describeProviderError()`.

**L4. `console.log` only in `scripts/`, through a local `log(symbol, message)`.** *Check:* `grep -rn
"console\.log" src` prints nothing. *Example:* `scripts/cms-patch-aanbod-extras.mts`.

## 9. Components

**K1. Server components by default; `'use client'` on the smallest leaf that needs state, effects or a browser
API.** Split trigger: a client file over 300 lines or more than six `useState`/`useEffect` in a component →
extract a hook or a panel (S2). *Check:* `grep -cE "useState|useEffect" <file>`. *Example:* `use-booking-addons.ts`.

**K2. Server→client props are view data typed in `types.ts` and mapped by a server-only loader; never a
database row or a function.** *Example:* `components/studio/booking/load.ts` → `types.ts` → `booking-widget.tsx`.

**K3. Admin forms use `useActionState(action, IDLE_STATE)`, disable submit while `pending` and show
`state.message` in `role="status"`.** *Example:* `components/admin/review-decision-form.tsx`.

**K4. Colours, type, radius and spacing come from tokens only:** no hex, palette class, `text-[11px]` or
`rgb()`. *Check:* `grep -rnE "#[0-9a-fA-F]{3,8}\b|-(red|blue|green|gray|slate|zinc|amber|emerald|black|white)(-[0-9]+)?\b|-\[[0-9.]+(px|rem)\]|rgb\(" src/components src/app --include=*.tsx`
lists only legacy files. *Example:* `components/studio/booking/*` (classes from `globals.css`).

**K5. Forms and flows are accessible:** `useId()` per field with `<label htmlFor>`, errors via
`aria-describedby` + `aria-invalid`, focus to the first error or new step, async messages in `role="status"`,
heading levels passed down. *Example:* `booking/details-form.tsx`, `heading-level.tsx`.

**K6. Dates, durations and prices are formatted only by the shared helpers** (`time.ts`, `format.ts`,
`BOOKING_TIMEZONE`). *Check:* `grep -rn "Intl\.\(DateTime\|Number\)Format\|toLocale" src/app src/components`
lists only legacy files. *Example:* `email/templates.ts` (`formatSlot()`, `formatDuration()`).

## 10. Tests

**Q1. Every pure module with logic has a sibling test,** in `src/lib` and next to components; data-only files
(`defaults.ts`, `seed-content/*`, `types.ts`, label tables) are exempt. *Check:*
`for f in $(grep -rLE "^import 'server-only'|^'use (server|client)'" src/lib src/components --include=*.ts | grep -v '\.test\.ts'); do [ -f "${f%.ts}.test.ts" ] || echo $f; done`
— each hit is data-only or imported by a named test. *Example:* `booking/availability.test.ts`.

**Q2. A flow with I/O takes its I/O as injected dependencies; `service.ts` holds the real wiring.**
*Example:* `gift-voucher/delivery.ts` (+ test) and `service.ts`; `src/lib/rate-limit.ts` takes `db`.

**Q3. Unit tests use no real database, network or clock:** `vi.mock('@/db/cms')` with a fake or
`src/test/doubles/`, `vi.stubGlobal('fetch', …)`, `now` passed in (`email/send.test.ts`).

**Q4. A flow that crosses the repo layer gets a section in `scripts/selftest/<topic>.mts`, listed in the
`cms-selftest.mts` header; a new migration runs twice there;** fixed `now`, `fetch` replaced, no mail
(CLAUDE.md §5). *Example:* `scripts/selftest/assignment.mts` ("migration 0012 twice").

## 11. Scripts

**X1. A CLI is a thin shell (`scripts/<npm-name>.mts`: options, target guard, mode, exit code) over a core in
`scripts/lib/` that the self-test drives.** *Example:* `cms-patch-aanbod-extras.mts` →
`lib/aanbod-extras-patch.mts` (self-test 17c).

**X2. Dry run by default; `--apply` writes a JSON backup to `.rollout-backups/` first; `--restore
<backup.json>` validates it with zod and undoes.** *Example:* `writeBackup()`/`readBackup()` (`aanbod-rollout.mts`).

**X3. Every write to Neon passes `assertWriteTarget()` (`--expect-host` = the `DATABASE_URL` host) before the
first read.** *Check:* `grep -L assertWriteTarget $(grep -l getCmsDb scripts/*.mts)` lists only
`cms-selftest.mts` (throwaway PGlite). *Example:* `scripts/lib/cli-options.mts`.

**X4. The dry run is read-only by construction** (`readOnlyDb()`, no session, no audit); writing modes use the
repo with a short-lived admin session revoked in `finally`, audit `patch.<name>.apply` and re-plan to verify.
*Example:* `scripts/lib/aanbod-rollout-run.mts`.

**X5. Options go through `rejectUnknownOptions`/`valueOf` and never echo a value; failures print
`describeError()` and exit 1.** *Example:* `scripts/cms-patch-aanbod-prijzen.mts`.

**X6. Helpers several CLIs share live in neutral modules** (`cli-options.mts`, `cms-actor.mts`,
`request-context.mts`). A new CLI ships with a header (usage, options, idempotence, preconditions, runbook
§), an npm script, a README row and a runbook section in the same branch. *Example:* `cms-patch-aanbod-extras.mts`.

## 12. Documentation

**W1. The doc describing a behaviour changes in the same branch** (CLAUDE.md §8):

| Change | Update |
| --- | --- |
| npm script | `README.md` Scripts table; a runbook section when it writes to staging |
| env var | `src/lib/env.ts`, `.env.example`, `DEPLOYMENT.md` §5, `staging-runbook.md` §2 |
| migration | the table in `cms-architecture.md` §2 or `booking-architecture.md` §2, `staging-runbook.md` §3.1, a rollout section |
| CMS block, auth, permission, caching | `docs/cms-architecture.md` |
| booking, availability, Google, e-mail; a new `lib/booking` file | `docs/booking-architecture.md` (§1 Files) |
| new `src/lib/<area>` | `README.md` Project layout and B5 here |
| self-test section | the header of `scripts/cms-selftest.mts`, README Testing |
| temporary price, image or copy | `docs/content-placeholders.md` |

**W2. A non-trivial module opens with a doc comment: role, kind (and why, if Node-loadable), the contract
callers rely on, the non-obvious why with a doc §** — not a list of its functions. Dated decisions say who and
when ("Toshoni, 20 Oct 2026"). *Example:* `booking/public-actions.ts`, `cms/actions/run.ts`.

## 13. Dependencies

**P1. A new package needs a reason in the PR:** the problem, why `fetch`, `node:crypto`, `Intl` or zod fell
short, client-bundle size, maintenance, licence. *Example:* Google and Resend over `fetch`
(`booking/google.ts`, `email/send.ts`); `email/ics.ts`.

**P2. One library per job:** `date-fns` + `@date-fns/tz`, zod, `sanitize-html`, Base UI via shadcn,
`lucide-react`. Heavy server packages go in `serverExternalPackages` and load lazily (PGlite, `src/db/cms.ts:100`).

## 14. Performance

**F1. No client-side fetching where a server component can render;** interaction-driven data comes from a
server action cached in a hook. *Check:* `for f in $(grep -rl "^'use client'" src); do grep -Hn "fetch(" $f;
done` lists only legacy files. *Example:* `availabilityAction` + `use-month-availability.ts`.

**F2. Independent reads run in parallel; no query per row in a loop.** *Example:* `Promise.all` in
`offers/offering-store.ts`; free/busy fetched once per provider in `getAvailability()`.

**F3. Client bundles import only small client-safe modules;** images go through `StudioImage` (CLAUDE.md §6).
*Example:* `cms/rich-text-plain.ts`, split so the editor never imports `sanitize-html`.

---

## 15. Reviewer checklist

Yes to every question, or the PR names the rule it deviates from and why.

1. No `getCmsDb()` or Drizzle in pages, components or actions? (B1, A3)
2. Does every new `src/lib` module show its kind in its first lines? (B2)
3. Do pure and client modules import server modules only via `import type`? (B3, B4)
4. Do new imports follow the layer table, with no cycle and nothing in `src/lib` importing `components`/`app`? (B5–B7)
5. Is every touched file ≤ 500 lines, or smaller than before? (S1)
6. Does a split follow the S2 order and keep callers stable? (S2, S3)
7. Do new files use the N2 names, with tests next to them? (N2, N3)
8. Are tags, the time zone, patterns and result helpers imported, not re-typed? (N4)
9. Free of `any`, `@ts-*` and non-null `!` outside tests? (T1)
10. Is every new boundary parsed by zod, with types derived from it and plain JSON across boundaries? (T2, T3, T6)
11. Are failures `{ ok: false, … }` values with a Dutch message? (T4, D2)
12. Is each admin action thin, in `runAction`, revalidating its admin paths? (A1–A5)
13. Does every repo function guard first, and every write audit and bust its tags? (D1)
14. Is the migration generated, additive, guarded and documented in its header? (D4)
15. Is a new seed, bootstrap or patch idempotent? (D6)
16. Are public reads tag-cached, and is any `force-dynamic` explained above it? (C1, C4)
17. Are logs fixed `[area] code` lines with no caught error, value or PII? (L1, L2)
18. Is a new client component a small leaf on tokens, with labels, focus and shared formatters? (K1, K4–K6)
19. Does each new pure function have a unit test, and each repo-crossing flow a self-test section? (Q1, Q4)
20. Does a writing CLI default to a dry run, back up, require `--expect-host` and use `describeError`? (X2–X5)
21. Is the matching doc updated in this branch, and is any new package justified? (W1, P1)

---

## 16. Observed divergences (for the review pass)

Read on 20 Oct 2026 against `staging` at `d46cee6` (PR #34) plus the working tree of PR #35. Observations
only; line numbers move as files change. Strike an item here when it is fixed.

- **S1 size.** `src/lib/booking/repo.ts` 1275, `src/lib/cms/blocks.ts` 986, `src/lib/cms/repo.ts` 917,
  `src/db/cms-schema.ts` 829, `src/components/admin/blocks/field-inputs.tsx` 655,
  `src/components/studio/booking/booking-widget.tsx` 631 (11 `useState`, K1), `src/lib/booking/public-booking.ts`
  611, `src/components/admin/provider-editor.tsx` 575, `scripts/cms-selftest.mts`
  1644, `scripts/lib/aanbod-migrate.mts` 1007, `scripts/cms-seed.mts` 734,
  `scripts/selftest/offerings.mts` 907, `scripts/selftest/staging-gate.mts` 518; `src/lib/cms/auth.ts`
  is at 500. (27 Oct 2026: `src/lib/offers/repo.ts` is down to 500 and `offering.test.ts` to 462 by
  splitting out `repo-variant-services.ts`, `offering-labels.ts` and `offering-legacy.test.ts`;
  `src/lib/offers/offering.ts` is 521, down from 566. Same day: the site settings moved out of
  `src/lib/cms/blocks.ts` into `site-settings.ts`, so `blocks.ts` is 890, down from 988.)
- **B2.** `src/lib/cms/{auth,users,session}.ts` and `cms/mfa/challenge.ts` reach the database or
  `next/headers` without `server-only` and without saying why in their own header (only `password-upgrade.ts:13`).
- **B5.** `src/lib/offers/repo-variant-services.ts:6` (moved out of `repo.ts`) imports `locationExists`
  from booking's internal `repo-shared.ts`;
  `offers/offering-store.ts:7` and `offers/repo.ts:13` take `BOOKING_TAG` from the reader `booking/content.ts`.
  Copy tokens (27 Oct 2026) add three deliberate upward imports of pure `studio/` modules, to be settled in
  the refactor pass: `cms/site-settings.ts` reads the defaults from `studio/legal.ts` and
  `studio/months-in-words.ts` (the same as `email/templates.ts` already does with `legal.ts`), and
  `email/resolve-copy.ts` imports the pure engine `studio/copy-tokens.ts` and loads the server-only
  `studio/copy-token-lookup.ts` lazily, because `sendEmail()` is the one place every mail passes. Moving
  `legal.ts`, `copy-tokens.ts` and `months-in-words.ts` to a neutral area would remove all three.
- **B6.** `src/lib/booking/public-actions.ts:6-18` imports `createConfirmationRef`/`confirmationPath` (server-only
  HMAC module `components/studio/booking/confirmation-ref.ts`) and `PENDING_PROVIDER_TEXT` (`.../types.ts`).
- **B7.** Cycle `src/lib/offers/catalogue.ts:10` ↔ `src/lib/offers/offering-labels.ts:2` (it was `offering.ts`
  until the labels moved out on 27 Oct 2026; `offering.ts` re-exports them), the only one found in `src/`.
- **Placement, N1.** `src/lib/cms/repo.ts:38` imports the write-path sanitiser from `./actions/sanitize`;
  `src/lib/analytics/ga4-tag.tsx` is a client component in `src/lib`; `admin/analytics-panel.tsx` uses `export default`.
- **N4 duplicates.** `ok`/`err`: `cms/repo.ts:63-64`, `email/repo.ts:52-53`, `booking/repo-shared.ts:17-18`,
  `offers/repo.ts:77`. Zod issues → message: `booking/repo-shared.ts:24`, `offers/offering.ts:229`,
  `offers/offering-content.ts:99`, `cms/blocks.ts:774`. `intIn()`: `cms/actions/services.ts:18`,
  `cms/actions/offerings.ts:34`. Slug regex: `cms/actions/services.ts:16`, `offers/catalogue.ts:70`,
  `offers/offering-content.ts:21`, `offer-enquiry/input.ts:59`. E-mail regex: `components/studio/booking/details.ts:70`,
  `booking/public-booking-input.ts:130`, `gift-voucher/order.ts:71`. Safe error name:
  `booking/provider-calendar-errors.ts:39`, `email/send.ts:36`, `offers/offering-store.ts:40`,
  `staging-gate/middleware.ts:47`. Tag literals: `scripts/lib/aanbod-extras-patch.mts:45`,
  `aanbod-prices-patch.mts:67`, `aanbod-rollout.mts:408`.
- **K6 dates and prices.** `components/studio/booking/dates.ts` re-implements `time.ts`/`format.ts` (`isYmd` :65
  accepts `2026-02-31`, `isValidYmd` in `time.ts:53` does not; `addDays` :69 vs `addDaysYmd`; `durationLabel`
  :195 vs `formatDuration`); `lib/analytics/dates.ts` is a third set. Inline `Intl` with `'Europe/Brussels'`:
  `app/admin/(dashboard)/page.tsx:112`, `reviews/page.tsx:68,90`, `email/page.tsx:14`,
  `components/admin/mfa/step-up.tsx:32`, `lib/cms/actions/mfa.ts:161`, `lib/analytics/ga4.ts:43`,
  `app/(studio)/beoordeling/[token]/page.tsx:66`. Inline price format: `components/studio/blocks/pricing.tsx:24`.
- **T1.** Non-null `!` (16): `app/api/google/oauth/state.ts:114`, `booking/google-oauth-config.ts:87,110,122`,
  `booking/public-booking.ts:600`, `booking/reviews.ts:131`, `cms/content.ts:156,194`, `cms/mfa/repo.ts:224`,
  `cms/users.ts:43`, `gift-voucher/order.ts:269`, `offers/offering.ts:379,441,442,459`, `offers/repo.ts:590`.
  `any` without a reason: `scripts/cms-selftest.mts:656,661,1620,1625`, `scripts/selftest/email-service.mts:66,412`.
- **T2.** Third-party JSON cast with `as`: `booking/google.ts:166,238,273,292,316,348,403`,
  `analytics/ga4.ts:186,195`, `email/send.ts:161`. A `typeof` chain instead of a schema:
  `components/studio/booking/confirmation-ref.ts:62`.
- **T3.** `cms/actions/services.ts:24-38` restates the service shape (`ServiceFormValues`).
- **L1.** Sentences instead of codes: `email/send.ts:111` (`console.info`), `:119`, `:155`, `:165`;
  `cms/mfa/flow.ts:173`; `cms/mfa/repo.ts:188`; `cms/password.ts:231`. Interpolated codes:
  `booking/follow-ups.ts:111,126`.
- **X3, X5, X6.** `scripts/cms-retention.mts` deletes on `--apply` without `--expect-host` and echoes an unknown
  argument (`:65`); `cms-seed.mts`, `cms-seed-booking.mts`, `cms-bootstrap.mts` write to Neon without it;
  `cms-rollout-aanbod.mts:102`, `cms-mfa-reset.mts:66`, `staging-access.mts:125` print `error.message`, not
  `describeError()`; `aanbod-extras-plan.mts` takes `withTransportRetry` from `aanbod-prices-plan.mts`;
  `aanbod-extras-patch.mts` takes `writeBackup` from `aanbod-rollout.mts`, `readOnlyDb`/`withAdminSession`
  from `aanbod-rollout-run.mts`.
- **K4.** Palette classes `components/ui/badge.tsx:14-15`; `text-[Npx]` in `admin/analytics-panel.tsx:232`,
  `admin/blocks/block-editor.tsx:134`, `admin/charts/bar-list.tsx:56`, `admin/email-service-manager.tsx:26`,
  `admin/media-picker.tsx:63`, `admin/nav.tsx:32`; `rgb()` in `studio/consent-banner.tsx:84`; `bg-black/10` in
  `ui/sheet.tsx:31`; hex `themeColor` in `app/layout.tsx:66`.
- **F3.** `components/admin/page-settings-form.tsx:19` (client) imports a value from the 890-line `cms/blocks.ts`.
- **Q1.** No own test: `components/studio/booking/dates.ts` (197), `components/admin/blocks/field-spec.ts` (322),
  `lib/analytics/dates.ts`; `lib/cms/blocks.ts` only indirectly (seed-content tests, self-test §6).
- **Q4, W1 docs.** The `scripts/cms-selftest.mts` header omits the follow-ups, aanbod-prijzen and aanbod-extras
  sections it runs (`:588`, `:598`, `:1310`); `README.md:52` says migrations 0000–0007 (now 0015) and its
  `src/lib` list lacks offers, gift-voucher, offer-enquiry, staging-gate, security; `cms-architecture.md:38`
  lists a missing `cms-patch-cadeaubon.mts`; the migration tables in `cms-architecture.md` §2 and
  `staging-runbook.md` §3.1 stop at 0010; `.env.example` lacks `VERCEL_ENV`, `VERCEL_URL`,
  `VERCEL_GIT_COMMIT_REF` from `env.ts`.
- **CLAUDE.md §4.** `lib/gift-voucher/service.ts` counts then inserts on `cms_booking_rate_limit` instead of
  `reserveRateLimit()` (open item R-3, `booking-architecture.md` §13).
