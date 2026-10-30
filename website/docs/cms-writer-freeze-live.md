# CMS writer freeze — separate live Staging/Production tool (30 October 2026)

**Status: implementation for review; live execution HOLD.** This is a separate `cms:writer-freeze:live` command. It does not make the disposable proof commands live-safe. No Staging/Production SQL, role setup, Vercel change, deployment or provider action has been performed by this work block. The release gates in `work-blocks/2026-10-30-pr46-live-activation-plan-draft.md` and `docs/staging-runbook.md` §26 remain mandatory. The existing proof-only commands and SQL behavior are unchanged.

## Boundary and grant contract

Every live invocation names `--environment staging|production` and the matching `--purpose live-staging-writer-freeze|live-production-writer-freeze`, the **exact** Neon project ID, branch ID and the exact live name (`Staging` or `production`), direct read-write endpoint ID and hostname, database and installer login. The runner uses read-only Neon control-plane `GET /projects/{project_id}/branches/{branch_id}` and `GET /projects/{project_id}/endpoints/{endpoint_id}` (official [v2 OpenAPI spec](https://neon.com/api_spec/release/v2.json)) before any PostgreSQL connection, and again before each direct or pooled identity query. It requires both records to match every supplied ID/name/host, `branch.current_state=ready`, an enabled read-write endpoint in `active|idle`, and a direct host matching the endpoint ID. No control-plane write method is used. A control-plane failure or mismatch stops all SQL. Control-plane identity is independent of a SQL session's self-reported identity; both are required.

Native direct PostgreSQL uses the pinned `pg@8.23.1` strict client from the disposable proof: certificate and hostname-verified TLS and a completed SCRAM-SHA-256-PLUS exchange with no fallback. The URL must name the exact direct host/database/login and contain **only** `sslmode=require&channel_binding=require`. `NEON_API_KEY`, `DATABASE_URL` and fresh distinct APP/CLI passwords must be resolved through **process/vault injection**. No credential value, connection URL or raw driver/API error is printed or written to the repository. Pooled role identity is a separate read-only Neon HTTPS check, not a claim of PostgreSQL channel binding.

`generate-setup` writes the complete password-free, mode-0600 setup SQL for review and hash confirmation. `setup --file --sha256` refuses any file not exactly regenerated from the pins/roles. `check-roles` additionally audits APP/CLI attributes, membership, ownership, four-table effective privileges, OWNER membership and database/schema CREATE denial before credential migration. `setup` creates a fresh APP LOGIN, CLI LOGIN and OWNER NOLOGIN in one acknowledged transaction. The role SQL verifies installer identity, PostgreSQL >=16, no existing guard or named roles, ordinary installer-owned `cms_*` table-like relations and four ordinary installer-owned webshop tables. It refuses PUBLIC DML/TRUNCATE/TRIGGER on those relations before setup. Its **only** non-CMS grant is APP schema USAGE plus SELECT/INSERT/UPDATE/DELETE on exactly `public.users`, `public.products`, `public.orders`, `public.order_items`; CLI receives no non-CMS grant. The guard install later grants APP and CLI CMS DML as defined in `cms-writer-freeze.md`. No console-created elevated role is acceptable. This static grant list is based on the current source schema and the disposable-copy inventory; **it is not a live ACL audit**. Before execution, Niels must compare the exact live catalog owners, ACLs, relation kinds, sequences/defaults and actual app query surface for each environment, including any drift; unexpected need for another privilege is a HOLD and code-review change, never an ad hoc GRANT. INSTALLER remains operator-only and must be rotated out of every deployment and drained before guard install. The copy-specific trusted platform list is not inherited: review and attest an exact list per live branch.

`generate` writes a new mode-0600 SQL file and SHA-256 but never connects. For every guard action, review its **entire** file and independently calculate the hash. `execute` requires the reviewed hash and exact byte-for-byte regeneration from the action, purpose, roles, trusted list and environment/project/branch/endpoint/host/database/installer pins; even a modified file with a recalculated hash is refused. Each action is one transaction and one query call; COMMIT acknowledgement is required. There is **no automatic retry**. A transport or acknowledgement failure may mean commit succeeded; keep ingress/egress held and inventory the same pinned branch before considering any new action. The SQL statements after the header are byte-identical to the disposable proof generator, retaining all existing guard assertions. The proof generator still rejects live purpose.

## Operator sequence (one environment at a time)

Use the exact reviewed branch inventory, fresh snapshot/rollback plan, approved trusted-platform list and project-wide pre-function ingress/egress deny with provider/cron drain **before** any live write. The plan's Gate 0–5 decisions and Production scope authority govern execution; this command alone authorises nothing. Choose names separately for Staging and Production. Never point `cms:writer-freeze:proof` or `cms:writer-freeze:run` at a live branch. Run from `website/` with environment-injected secrets. Non-secret shell variables below are examples of structure, not defaults:

```bash
ENV=staging
PURPOSE=live-staging-writer-freeze
PROJECT=REVIEWED_PROJECT_ID
BRANCH=REVIEWED_BRANCH_ID
BRANCH_NAME=REVIEWED_BRANCH_NAME
ENDPOINT=REVIEWED_DIRECT_ENDPOINT_ID
HOST=REVIEWED_DIRECT_HOST
DB=REVIEWED_DB
INSTALLER=REVIEWED_INSTALLER
APP=REVIEWED_FRESH_APP
CLI=REVIEWED_FRESH_CLI
OWNER=REVIEWED_FRESH_OWNER
SOURCE_OWNER=REVIEWED_SOURCE_OWNER
CMS_TABLE=REVIEWED_PUBLIC_CMS_TABLE_WITH_ID
```

The common pin flags must be repeated **explicitly for each invocation**; there are no live defaults. `NEON_API_KEY` is a read-only-capable Neon API credential injected into the process. `DATABASE_URL` is the installer **direct** URL for the exact pinned endpoint and carries only `sslmode=require&channel_binding=require`. For `setup`, `check-roles` and `probe`, also inject `CMS_FREEZE_APP_PASSWORD` and `CMS_FREEZE_CLI_PASSWORD` as resolved, distinct, >=32-character values; never arguments, files or shell history. Store only references in a shell if using `op-openclaw run`, and pass them through that wrapper. Treat a wrapper or URL validator refusal as HOLD.

```bash
npm run cms:writer-freeze:live -- check --environment "$ENV" --purpose "$PURPOSE" --project-id "$PROJECT" --branch-id "$BRANCH" --branch-name "$BRANCH_NAME" --endpoint-id "$ENDPOINT" --expected-host "$HOST" --database "$DB" --installer "$INSTALLER"
# After live catalog/grant/credential custody review, snapshot, ingress/egress deny and drain:
SETUP_FILE=/private/reviewed-new-live-setup.sql
npm run cms:writer-freeze:live -- generate-setup --environment "$ENV" --purpose "$PURPOSE" --project-id "$PROJECT" --branch-id "$BRANCH" --branch-name "$BRANCH_NAME" --endpoint-id "$ENDPOINT" --expected-host "$HOST" --database "$DB" --installer "$INSTALLER" --app "$APP" --cli "$CLI" --owner "$OWNER" --out "$SETUP_FILE"
sha256sum "$SETUP_FILE"
# Review every line; compare generator and independent SHA-256.
SETUP_HASH=REVIEWED_64_HEX_HASH
npm run cms:writer-freeze:live -- setup --environment "$ENV" --purpose "$PURPOSE" --project-id "$PROJECT" --branch-id "$BRANCH" --branch-name "$BRANCH_NAME" --endpoint-id "$ENDPOINT" --expected-host "$HOST" --database "$DB" --installer "$INSTALLER" --app "$APP" --cli "$CLI" --owner "$OWNER" --file "$SETUP_FILE" --sha256 "$SETUP_HASH"
npm run cms:writer-freeze:live -- check-roles --environment "$ENV" --purpose "$PURPOSE" --project-id "$PROJECT" --branch-id "$BRANCH" --branch-name "$BRANCH_NAME" --endpoint-id "$ENDPOINT" --expected-host "$HOST" --database "$DB" --installer "$INSTALLER" --app "$APP" --cli "$CLI" --owner "$OWNER"
```

Only after APP migration, old privileged URL rotation and drain, generate a **new** private SQL file for one action. Repeat this block manually for `verify`, `freeze`, `unfreeze` or `uninstall` at its reviewed stage; never automate an action loop. `uninstall` requires the guard already unfrozen.

```bash
ACTION=install
SQL_FILE=/private/reviewed-new-live-install.sql
npm run cms:writer-freeze:live -- generate --environment "$ENV" --purpose "$PURPOSE" --project-id "$PROJECT" --branch-id "$BRANCH" --branch-name "$BRANCH_NAME" --endpoint-id "$ENDPOINT" --expected-host "$HOST" --database "$DB" --installer "$INSTALLER" --app "$APP" --cli "$CLI" --owner "$OWNER" --source-owner "$SOURCE_OWNER" --trusted-platform-roles REVIEWED_EXACT_LIST_OR_none --action "$ACTION" --out "$SQL_FILE"
sha256sum "$SQL_FILE"
# Review every line; compare generator and independent SHA-256. Set SQL_HASH to the reviewed value.
SQL_HASH=REVIEWED_64_HEX_HASH
npm run cms:writer-freeze:live -- execute --environment "$ENV" --purpose "$PURPOSE" --project-id "$PROJECT" --branch-id "$BRANCH" --branch-name "$BRANCH_NAME" --endpoint-id "$ENDPOINT" --expected-host "$HOST" --database "$DB" --installer "$INSTALLER" --file "$SQL_FILE" --sha256 "$SQL_HASH"
```

With the guard installed and frozen, use `probe --phase frozen`; after reviewed unfreeze use `--phase unfrozen`; after reviewed uninstall use `--phase uninstalled`. Each invocation also requires all common pins, `--app`, `--cli`, `--owner`, `--cms-table "$CMS_TABLE"`. Before probing, a read-only installer catalog audit rejects unexpected relation kinds, any user webshop trigger/rule, and any CMS trigger/rule beyond the exact enabled guard pair (or none after uninstall). The probe then uses zero-row CMS and webshop statements, savepoints and a final acknowledged **ROLLBACK** through separately authenticated APP/CLI direct connections; unexpected success/error or missing ROLLBACK is HOLD. It does not prove real-row behavior, provider effects, an ingress hold, snapshot quality or rollback feasibility. Never run a correction apply as part of this tooling step.

## Uncertainty and release record

Keep project-wide ingress/egress controls in place on any refusal, unexpected role/owner/ACL, endpoint mismatch, SQLSTATE mismatch, missing COMMIT/ROLLBACK acknowledgement, or external effect. Do not retry setup or an action. Use the read-only recovery inventory in `cms-writer-freeze.md`: confirm branch/endpoint via Neon first, then catalog roles, ownership, guard state/coverage/triggers and exact privileges; compare against the before-inventory and reviewed action/hash. Escalate ambiguity. Record non-secret project/branch/endpoint IDs, identities, SQL hashes, acknowledgement, backend PID, time, operator/reviewer, snapshot and restore evidence, ingress/egress/provider drain, old URL retirement and Staging/Production acceptance. Production remains gated by the separate scope and exact-step release plan.
