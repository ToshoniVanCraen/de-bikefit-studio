# CMS writer freeze — disposable-branch proof candidate (29 October 2026)

**Status:** a database guard candidate for a **named disposable Neon branch proof only**. It has not run on any Neon branch. **No live activation on Staging or Production** (see "Live activation"). `npm run cms:writer-freeze` only writes one reviewable SQL transaction to a new mode-0600 file and prints its SHA-256; it never connects. Arend owns the branch proof, Niels reviews the trust boundary, Toshoni/Max acceptance stays separate. Arend's read-only audit (29 Oct) found that `neondb_owner` is the deployed login, the database owner and the owner of all 33 `cms_*` tables, with CREATEROLE, CREATEDB, BYPASSRLS and `neon_superuser`, and that Neon runs its own privileged logins (`cloud_admin`, `neon_service`). The earlier "APP is the existing deployed login" contract was therefore impossible and is withdrawn.

## Role contract

Five roles plus an explicit trusted list; the SQL header names them all. Role names only: credentials never appear in docs, logs or chat.

- **APP** — a *new* least-privilege LOGIN that becomes the deployed `DATABASE_URL`. No role attributes (SUPERUSER, CREATEROLE, CREATEDB, REPLICATION, BYPASSRLS); owns no objects; no database or schema CREATE; no membership of any kind (including ADMIN-only, INHERIT FALSE or SET FALSE grants) in OWNER, INSTALLER, sourceOwner, CLI or a trusted role, nor any chain to a role with those powers or to `pg_write_all_data`, `pg_maintain`, `pg_execute_server_program` or `pg_write_server_files`; no TRUNCATE, REFERENCES, TRIGGER or MAINTAIN (PostgreSQL 17+) on CMS tables. The app needs DML only: the Neon HTTP driver runs no migrations.
- **CLI** — a fresh LOGIN used only in the one-off correction CLI `DATABASE_URL`, never in Vercel. Same restrictions as APP, and no CMS grants before install.
- **OWNER** — a dedicated plain NOLOGIN role that owns the guard and, while installed, every `cms_*` table.
- **INSTALLER** — the privileged operator login that runs the SQL (`session_user` and `current_user` are checked). Never deployed, never in Vercel. Needs INHERIT and SET membership in OWNER and sourceOwner, database CREATE and grantable CREATE on each CMS schema.
- **sourceOwner** — the original owner of every ordinary `cms_*` table (`neondb_owner` on Neon); ownership returns to it on uninstall. It may equal INSTALLER: Neon offers no superuser, and the console-created owner is the only practical installer (it owns the database and tables and can create roles), so its password must be rotated out of every deployment and its old sessions drained first. **The guard cannot stop the old `neondb_owner` URL** (it is INSTALLER); only rotation and drain do. If sourceOwner ≠ INSTALLER it gets no exemption: a privileged or database/schema-owning sourceOwner LOGIN fails the preflight.
- **Trusted platform roles** — `--trusted-platform-roles cloud_admin,neon_service` or `--trusted-platform-roles none`: exact names, validated, no duplicates, no patterns or `pg_*`, never one of the five roles, and each must exist. **SQL cannot prove these roles safe; trusting them is an explicit operator decision that Niels reviews.** They are exempt only as login identities in the "no other login can bypass" checks; a non-trusted login that is a member of a trusted role still fails, and APP/CLI may not reach them. The list is recorded in the guard state at install; verify, freeze, unfreeze and uninstall with a different set (superset or subset) fail, so the exemption cannot be widened silently.

## What the SQL enforces

Each action is one transaction (`lock_timeout` 15 s) and refuses PostgreSQL < 16. Every action re-checks the installer identity, that all named roles exist, the APP/CLI/OWNER rules above, and that no other LOGIN (outside INSTALLER and the trusted list) can, directly or through any membership: bypass the guard (SUPERUSER, CREATEROLE, BYPASSRLS, OWNER membership or the predefined roles named above), assume INSTALLER or a trusted role, or create relations (database or schema CREATE, database or schema ownership, including via `pg_database_owner`). It also refuses to run while another session is connected as INSTALLER or sourceOwner (`pg_stat_activity`); that is a partial drain check that fails closed, **not proof that a rotated credential is unused**.

INSTALL also requires every ordinary `cms_*` table to be owned by sourceOwner, a fresh CLI and no existing CMS trigger, rule, sequence/`nextval` default or non-ordinary `cms_*` relation. It moves each table to OWNER (a temporary schema CREATE for OWNER only if it lacks one, revoked in the same transaction), grants APP and CLI schema USAGE and SELECT/INSERT/UPDATE/DELETE, and adds statement-level `ENABLE ALWAYS` triggers (`BEFORE INSERT OR UPDATE OR DELETE`, `BEFORE TRUNCATE`) that call a SECURITY DEFINER function owned by OWNER (`search_path=pg_catalog`). While enabled, only `session_user = CLI` can write. After install and on every action the SQL verifies the state row and recorded role contract, coverage against all `cms_*` relations, the exact triggers, the guard function body and settings, guard ACLs (OWNER only), that only OWNER holds TRIGGER on CMS tables, no table inheritance (writes through a parent skip statement triggers), no sequences, the APP/CLI grants, and that no other login owns or can assume the owner of an object the CMS tables depend on (the CMS enums stay with sourceOwner; `ALTER TYPE … RENAME VALUE` would change data without DML). Webshop and other non-CMS tables keep their owners and ACLs; the only change to a shared object is an explicit USAGE grant on each CMS schema, kept for APP and revoked from CLI on uninstall.

UNINSTALL requires `enabled=false`, drops the triggers, revokes CLI's table grants and schema USAGE, returns ownership to sourceOwner (temporary CREATE only if it lacks one), keeps APP's DML and USAGE, drops the guard, then asserts in the same transaction: no guard schema or trigger left, every `cms_*` table owned by sourceOwner, APP DML intact, CLI without access. The triggers are not a DDL event trigger: migrations and other DDL stay suspended while the guard is installed.

## Disposable-branch proof (Arend; bounded)

1. **Authority and capacity:** pin the exact SHA. One Neon slot is free; a disposable copy uses it, so preserve the existing recovery snapshots and get the separate capacity/retention decision first (hold 2). Create one named branch (`cms-freeze-proof-<yyyymmdd>`) from Staging at a recorded point in time; no Vercel deployment points at it. Change no Staging or Production credential.
2. **Inventory (read-only, no credentials in output):** server version (≥ 16); `pg_roles` attributes and `pg_auth_members` options; database and schema owners and ACLs; owners, ACLs and kinds of all `cms_*` and other relations; triggers, rules, inheritance, sequences/defaults, enum owners, default ACLs.
3. **Roles, with SQL as INSTALLER** (console-created roles receive `neon_superuser` and fail): after the read-only inventory and transport check below, use the separate repo-locked `cms:writer-freeze:proof -- setup` helper. It creates fresh plain OWNER NOLOGIN and APP/CLI LOGIN roles, passwords from environment only, OWNER membership for INSTALLER with INHERIT/SET, and only the reviewed APP webshop grants on `public.users`, `products`, `orders`, `order_items` (USAGE on `public`; SELECT/INSERT/UPDATE/DELETE on those four tables). It checks all four are ordinary and installer-owned, that at least one CMS relation exists and every CMS table-like `cms_*` relation is ordinary and installer-owned (indexes are excluded), and that roles/guard are absent. The guard install later grants APP/CLI CMS DML. No CLI webshop grant is made. Never pass passwords as arguments or write them to files.
4. **SQL:** `npm run cms:writer-freeze -- <action> --purpose disposable-branch-proof --app <app> --cli <cli> --owner <owner> --installer <installer> --source-owner <source> --trusted-platform-roles <Niels-approved list|none> --out <new private file>` for install, verify, freeze, unfreeze and uninstall. Record each printed SHA-256, confirm it with `sha256sum` and review the entire file. Use a private mode-0600 regular file. Set `DATABASE_URL` only in the executor environment (never in a command argument or log) to the **direct, non-pooler host of this exact disposable branch**, with `sslmode=require` and the INSTALLER login. This client uses secure WSS to the Neon proxy; `sslmode=require` does **not** establish PostgreSQL-layer TLS in this driver configuration; `channel_binding` is rejected because PostgreSQL TLS channel binding is unavailable. Run `npm run cms:writer-freeze:run -- check --expected-host <exact-direct-host> --database <exact-db> --installer <installer>` first; record the host, database, identity, PostgreSQL version and backend PID. Before guard SQL, run `npm run cms:writer-freeze:run -- probe --expected-host <exact-direct-host> --database <exact-db> --installer <installer>` on that disposable branch. The probe uses only a session-local temporary table: it requires a multi-statement COMMIT acknowledgement, then inserts a second temp row before a deliberate division-by-zero error, acknowledges ROLLBACK and checks that only the first row remains. Record the identity/backend PID and `Transport probe OK` output; any refusal is a stop condition. It never touches existing tables or runs guard SQL. Then run `npm run cms:writer-freeze:run -- execute --expected-host <exact-direct-host> --database <exact-db> --installer <installer> --file <private-file> --sha256 <reviewed-hash>` for each action. The executor checks the full file against exact generator output, pins the host/database/login, runs the transaction in one session and one `Client.query(sql)` call, and requires a COMMIT acknowledgement. No automatic retry. A transport error near COMMIT leaves the outcome **uncertain**; inspect branch state before considering another action.
5. **Run:** use the exact command sequence below. Install; verify; frozen APP denials and CLI positive; unfreeze and APP CMS positive; freeze/verify and frozen denials again; unfreeze; uninstall; APP CMS positive and CLI CMS denial. All behavioral probes use zero-row DML, statement savepoints and a final acknowledged ROLLBACK. They cannot prove real-row triggers, foreign keys, external integrations or provider behavior.
6. **Close:** keep the evidence; delete the branch only with explicit authority.

**Evidence:** branch name and id, parent and point in time, SHA, SQL hashes, role names, inventories before and after, identity checks, verify output, probe output, uninstall assertion, timestamps. **Policy hold:** this executor provides transport controls only; it does not authorize the proof. Arend’s AGENTS.md prohibition on ALTER of existing tables and DROP/TRUNCATE remains a separate hold requiring resolution before any guard install/uninstall or refused TRUNCATE probe. **Stop conditions (hold, do not work around):** any refusal; an unexpected login, membership, privilege or owner; a trusted list without Niels's approval; an identity mismatch; a server below 16; any need to weaken a check; no capacity/snapshot decision; anything that would touch Staging or Production.

### Exact repo-locked proof commands (disposable copy only)

Run in `website/` at a newly reviewed SHA. Set `DATABASE_URL` to the **installer** direct-branch URL with `sslmode=require`, and `CMS_FREEZE_APP_PASSWORD` / `CMS_FREEZE_CLI_PASSWORD` to the two fresh passwords in the process environment via a private secret handoff. Do not put them on a command line, in a file, shell history or output. `with-db-url.sh --direct` supports this installer route; its default pooled route is **not** allowed for setup, guard SQL or DML probes. It retrieves the URL without printing it. The strict URL check may still reject Neon CLI output (for example, extra query parameters); stop and inspect the route, never strip a security check to proceed. The helper refuses unresolved `op://` references, shared or shorter-than-32-character passwords before any SQL. Generate two distinct random passwords in 1Password; `op-openclaw run` must resolve them. The helper derives APP/CLI URLs only in memory from the pinned installer URL and those environment values. Never point a Vercel deployment at this copy.

Set the non-secret names from the reviewed copy inventory (examples below are **placeholders**, not defaults):

```bash
PROJECT_ID=REVIEWED_NEON_PROJECT_ID
BRANCH=cms-freeze-proof-20261030
HOST=ep-exact-branch.eu-central-1.aws.neon.tech
DB=neondb
INSTALLER=neondb_owner
APP=cms_proof_app
CLI=cms_proof_cli
OWNER=cms_proof_owner
CMS_TABLE=cms_services
```

Confirm `public.cms_services` is an ordinary reviewed CMS table with an `id` column; the probe validates the identifier and uses only this table for CMS zero-row DML. Confirm the four reviewed webshop tables are ordinary and installer-owned. Before any role SQL, run the existing transport check and temporary-table probe:

```bash
npm run cms:writer-freeze:run -- check --expected-host "$HOST" --database "$DB" --installer "$INSTALLER"
npm run cms:writer-freeze:run -- probe --expected-host "$HOST" --database "$DB" --installer "$INSTALLER"
npm run cms:writer-freeze:proof -- setup --expected-host "$HOST" --database "$DB" --installer "$INSTALLER" --app "$APP" --cli "$CLI" --owner "$OWNER"
npm run cms:writer-freeze:proof -- check-roles --expected-host "$HOST" --database "$DB" --installer "$INSTALLER" --app "$APP" --cli "$CLI" --owner "$OWNER"
```

For each guard action, generate a **new** private file and review it before execution. Example for install (repeat manually with `ACTION=verify`, `freeze`, `unfreeze`, `uninstall` at the documented stage; never loop the actions automatically):

```bash
ACTION=install
SQL_FILE=/tmp/cms-freeze-proof-install-20261030.sql
npm run cms:writer-freeze -- "$ACTION" --purpose disposable-branch-proof --app "$APP" --cli "$CLI" --owner "$OWNER" --installer "$INSTALLER" --source-owner "$INSTALLER" --trusted-platform-roles cloud_admin,neon_service --out "$SQL_FILE"
sha256sum "$SQL_FILE"
# Review the entire private SQL file and compare its SHA-256 with the generated hash.
SQL_HASH='REPLACE_WITH_REVIEWED_64_HEX_HASH'
npm run cms:writer-freeze:run -- execute --expected-host "$HOST" --database "$DB" --installer "$INSTALLER" --file "$SQL_FILE" --sha256 "$SQL_HASH"
```

The exact trusted list is conditional on the copy-specific provider/provenance review; if it is not approved, stop rather than substitute a broader list. Use a unique absent mode-0600 destination for every action and keep the reviewed SQL files private. Never execute a file until its entire content and SHA-256 have been checked.

The `check-roles` step is mandatory **after setup and before guard install**: it authenticates APP and CLI on the pinned direct endpoint and each role's exact derived `-pooler` companion through the app's stateless Neon HTTP transport, asserting `session_user`, `current_user` and `current_database()`. It is read-only; it never sends setup or probe SQL to the pooler. Any mismatch or authentication failure is a stop. The old `neondb_owner` URL is INSTALLER and bypasses the guard; no probe here claims to deny it.

For a private vault-injection route, set only 1Password *references* in the shell environment, then run each command above through the direct wrapper. Replace the reference paths with the reviewed OpenClaw vault items; the reference strings are not password values:

```bash
export CMS_FREEZE_APP_PASSWORD='op://OpenClaw/REVIEWED-APP-ITEM/password'
export CMS_FREEZE_CLI_PASSWORD='op://OpenClaw/REVIEWED-CLI-ITEM/password'
S=/home/winston/.openclaw/workspaces/arend/skills/neon-db/scripts/with-db-url.sh
~/.local/bin/op-openclaw run -- "$S" "$PROJECT_ID" "$BRANCH" --db "$DB" --role "$INSTALLER" --direct --cwd "$PWD" -- npm run cms:writer-freeze:proof -- setup --expected-host "$HOST" --database "$DB" --installer "$INSTALLER" --app "$APP" --cli "$CLI" --owner "$OWNER"
~/.local/bin/op-openclaw run -- "$S" "$PROJECT_ID" "$BRANCH" --db "$DB" --role "$INSTALLER" --direct --cwd "$PWD" -- npm run cms:writer-freeze:proof -- check-roles --expected-host "$HOST" --database "$DB" --installer "$INSTALLER" --app "$APP" --cli "$CLI" --owner "$OWNER"
```

Use the same `op-openclaw run -- "$S" ... --direct --cwd "$PWD" --` prefix for the preceding check/probe/setup commands and every later guard execute or behavioral probe; do not separately expose the installer URL. The selected `$BRANCH` must be the named disposable copy; verify its project/branch identity independently before invoking the wrapper. Never use `--role` to fetch SQL-created APP/CLI credentials: the helper derives them from environment-only passwords. Neither the wrapper nor `op-openclaw run` makes a rejected strict URL acceptable.

The setup transaction emits no success output until the installer connection has ended and COMMIT is acknowledged. A missing acknowledgement, transport error or any refusal is a stop: inspect roles, grants and branch state before considering retry. Do not auto-retry. Generate/review/hash each guard action as in step 4, then execute it with `cms:writer-freeze:run -- execute` using that action's exact file and hash. Between actions run:

```bash
# After install and verify, while frozen:
npm run cms:writer-freeze:proof -- probe --expected-host "$HOST" --database "$DB" --installer "$INSTALLER" --app "$APP" --cli "$CLI" --owner "$OWNER" --phase frozen --cms-table "$CMS_TABLE"
# After unfreeze:
npm run cms:writer-freeze:proof -- probe --expected-host "$HOST" --database "$DB" --installer "$INSTALLER" --app "$APP" --cli "$CLI" --owner "$OWNER" --phase unfrozen --cms-table "$CMS_TABLE"
# After freeze and verify, repeat the frozen command. After unfreeze and uninstall:
npm run cms:writer-freeze:proof -- probe --expected-host "$HOST" --database "$DB" --installer "$INSTALLER" --app "$APP" --cli "$CLI" --owner "$OWNER" --phase uninstalled --cms-table "$CMS_TABLE"
```

Frozen APP INSERT and zero-row UPDATE/DELETE must return SQLSTATE `42501` and the **exact** `CMS writes frozen for login role <APP>` guard message. APP TRUNCATE/CREATE/ALTER/SET ROLE and post-uninstall CLI CMS DML must return SQLSTATE `42501`. The frozen CLI and unfrozen/post-uninstall APP CMS zero-row DML must succeed. The frozen APP webshop probe checks SELECT/INSERT/UPDATE/DELETE on each of the four reviewed tables, with zero rows. Every attempted statement is rolled back to its savepoint, and each actor's outer transaction is rolled back with an acknowledgement; unexpected success or wrong error fails closed. A lost acknowledgement remains uncertain and needs branch-state inspection. The helper logs no URLs, passwords, SQL or raw driver errors. This local code and PGlite evidence **do not verify the Neon WebSocket transport, direct-host identity or provider role model**; only the disposable-branch run can do that.

### Read-only recovery after uncertain acknowledgement

**Do not retry automatically.** On the same pinned disposable direct host, inventory first, without password values or a write: `SELECT session_user, current_user, current_database(), pg_backend_pid();` and `SELECT rolname, rolcanlogin, rolsuper, rolcreatedb, rolcreaterole, rolbypassrls FROM pg_roles WHERE rolname IN ('<APP>','<CLI>','<OWNER>');` (replace the three reviewed names). Inspect OWNER→INSTALLER membership and both `inherit_option`/`set_option` in `pg_auth_members`; inspect `public` schema USAGE and each of SELECT, INSERT, UPDATE, DELETE separately for APP, plus absence of CLI webshop grants. Check the four webshop owners/ACLs against the before-inventory. If setup roles are partially present, grants differ or the state cannot be explained, **hold for review**, not a fresh setup attempt.

For an uncertain guard action, first query `to_regnamespace('cms_writer_freeze')` and catalog owners, ACLs, relation kinds and trigger enablement for all `cms_*` tables. If the guard schema exists, inspect its `state` and `coverage` rows and compare the exact role contract, `enabled` value, covered table count and trigger manifest against the reviewed action and before-inventory. If absent, confirm source ownership, APP CMS grants, CLI revocation and no guard triggers. Only after state is unambiguous should a separately reviewed generated `verify` action be considered; a missing COMMIT acknowledgement is **not** proof of rollback. Never test by retrying setup/install/freeze/uninstall blindly.

## Live activation (not authorised)

Live use on Staging or Production needs, first: a proven project-wide pre-function ingress/egress deny and in-flight/provider drain covering canonical, alias, immutable deployment and direct function URLs, valid-secret cron, signed-in actions, Resend, Google, checkout and webhooks, with provider ledgers reconciled against CMS sent markers (hold 3; a database trigger cannot undo mail or OAuth side effects); the APP credential migration (create APP, review and grant its webshop/non-CMS access separately, switch Vercel `DATABASE_URL`, redeploy); rotation of the old `neondb_owner` password and a drain of old deployments and pooled sessions **before** install; INSTALLER never in Vercel; a separate review; and Toshoni's explicit GO for Production. The correction run itself (snapshot, host-pinned CLI dry/apply/verify with the first private backup, partial-write audit, atomic unfreeze) is a later, separate authorisation; `--reconcile-prod-youth-service` never runs on live Staging.

## Failure rule and limits

A PostgreSQL-rejected action within the generated transaction rolls back; a lost transport or missing COMMIT acknowledgement may leave the outcome uncertain and requires branch-state inspection before retry. A missing or disabled trigger, an unexpected relation, role, owner or ACL drift, or a failed drain means hold: keep ingress paused and do not run the correction CLI. Dropping triggers while frozen is not rollback; unfreeze leaves the guard installed but permissive. `nextval`/`setval` are not trigger-protected (CMS sequences are refused). Superusers and trusted roles can bypass any SQL guard by design. The pure executor tests cover host/database/identity pinning, hash and generated-contract rejection; they do not exercise the Neon WebSocket transport. The temporary-table probe tests the driver on a disposable branch but cannot prove the eventual guard transaction will commit or that a lost COMMIT acknowledgement means rollback. The PGlite tests (PostgreSQL 18.3, one session) prove the SQL logic, a non-superuser Neon-shaped install/uninstall and rollback; they do not prove Neon's role model, pooled identity, the session drain check, locking under concurrent writes or PostgreSQL 16/17.

The separate proof-helper tests cover per-privilege role setup/grants and actual install → frozen/unfrozen/uninstalled rollback-only probes in PGlite, plus pure rollback-on-unexpected-success/error behavior. They do not establish Neon connectivity, Neon SQL-created LOGIN authentication, direct-host routing or Neon-specific role privileges.
