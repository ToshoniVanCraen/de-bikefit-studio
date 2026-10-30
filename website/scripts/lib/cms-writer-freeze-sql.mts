/**
 * Offline SQL generator for the CMS writer freeze (docs/cms-writer-freeze.md); a pure script-side
 * module driven by `scripts/cms-writer-freeze.mts` and its PGlite test. It never connects: an
 * operator reviews, hashes and runs the SQL. Purpose (29 Oct 2026): a disposable Neon branch proof
 * only; live Staging or Production activation needs a proven ingress/egress hold first.
 *
 * Roles: APP is a new least-privilege deployed login, CLI the fresh correction login, OWNER the
 * NOLOGIN guard and CMS table owner, INSTALLER the privileged operator login (never deployed) and
 * sourceOwner the original CMS table owner (may equal INSTALLER). Every check fails closed. Only
 * INSTALLER and the explicitly listed platform roles, as login identities, are exempt from the
 * "no other login can bypass the guard" checks; a role reached through membership never is.
 */
export const FREEZE_ACTIONS = ['install', 'verify', 'freeze', 'unfreeze', 'uninstall'] as const;
export type FreezeAction = (typeof FREEZE_ACTIONS)[number];
export const FREEZE_PURPOSE = 'disposable-branch-proof';
export type FreezePurpose = typeof FREEZE_PURPOSE;
export type FreezeRoles = {
  app: string;
  cli: string;
  owner: string;
  installer: string;
  /** Original owner of the CMS tables; ownership returns here on uninstall. May equal installer. */
  sourceOwner: string;
  /** Exact provider-managed role names the operator attests to; `[]` means none. */
  trustedPlatformRoles: readonly string[];
};

export function quoteIdent(value: string): string {
  if (!/^[a-z_][a-z0-9_]{0,62}$/.test(value)) {
    throw new Error(`Invalid PostgreSQL role identifier: ${value}`);
  }
  return `"${value}"`;
}

function literal(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

/** Validates the role contract; returns the trusted list in canonical (sorted) order. */
function validateRoles(roles: FreezeRoles): string[] {
  const core = [roles.app, roles.cli, roles.owner, roles.installer];
  [...core, roles.sourceOwner].forEach(quoteIdent);
  if (new Set(core).size !== core.length) {
    throw new Error('App, CLI, owner and installer roles must be distinct');
  }
  if ([roles.app, roles.cli, roles.owner].includes(roles.sourceOwner)) {
    throw new Error('Source owner must be distinct from the app, CLI and owner roles');
  }
  if (!Array.isArray(roles.trustedPlatformRoles)) {
    throw new Error('Trusted platform roles must be an explicit list (empty for none)');
  }
  const trusted: string[] = [...roles.trustedPlatformRoles];
  trusted.forEach(quoteIdent);
  if (new Set(trusted).size !== trusted.length) throw new Error('Duplicate trusted platform role');
  if (trusted.some((name) => name.startsWith('pg_') || name === 'none')) {
    throw new Error('Trusted platform roles must be exact provider role names, not pg_* or none');
  }
  if (trusted.some((name) => [...core, roles.sourceOwner].includes(name))) {
    throw new Error(
      'A trusted platform role cannot be the app, CLI, owner, installer or source owner',
    );
  }
  return trusted.sort();
}

/** SQL literals of the validated role contract. */
type Ctx = {
  app: string;
  cli: string;
  owner: string;
  installer: string;
  source: string;
  trusted: string;
};

const DB_OID = `(SELECT d.oid FROM pg_catalog.pg_database d WHERE d.datname = pg_catalog.current_database())`;
const COVERED = `pg_catalog.to_regclass(pg_catalog.format('%I.%I', c.schema_name, c.table_name))`;
const GUARD_FN = `'cms_writer_freeze.reject_unless_cli()'::regprocedure`;
const GUARD_TABLES = `('cms_writer_freeze.state'::regclass, 'cms_writer_freeze.coverage'::regclass)`;
/** CMS relations (`t`, `n`); callers append `AND …` conditions. */
const CMS_TABLES = `pg_catalog.pg_class t JOIN pg_catalog.pg_namespace n ON n.oid = t.relnamespace
    WHERE t.relname LIKE 'cms\\_%' ESCAPE '\\' AND n.nspname NOT LIKE 'pg\\_%' ESCAPE '\\'
      AND n.nspname NOT IN ('information_schema', 'cms_writer_freeze')`;
const CMS_SEQUENCE_USE = `(EXISTS (SELECT 1 FROM pg_catalog.pg_class seq JOIN pg_catalog.pg_depend dep ON dep.objid = seq.oid
      JOIN pg_catalog.pg_class t ON t.oid = dep.refobjid WHERE seq.relkind = 'S' AND t.relname LIKE 'cms\\_%' ESCAPE '\\')
    OR EXISTS (SELECT 1 FROM pg_catalog.pg_attrdef def JOIN pg_catalog.pg_class t ON t.oid = def.adrelid
      WHERE t.relname LIKE 'cms\\_%' ESCAPE '\\' AND pg_catalog.pg_get_expr(def.adbin, def.adrelid) ILIKE '%nextval%'))`;
/** Owners of everything the guarded tables depend on: types (incl. array elements), functions, referenced tables. */
const CMS_DEPENDENCY_OWNERS = `(WITH RECURSIVE covered AS (SELECT ${COVERED}::oid AS oid FROM cms_writer_freeze.coverage c),
      objs(classid, objid) AS (SELECT 'pg_catalog.pg_class'::regclass::oid, covered.oid FROM covered
        UNION SELECT d.classid, d.objid FROM pg_catalog.pg_depend d JOIN covered
          ON d.refclassid = 'pg_catalog.pg_class'::regclass AND d.refobjid = covered.oid AND d.deptype IN ('a', 'i')
        UNION SELECT d.refclassid, d.refobjid FROM pg_catalog.pg_depend d
          JOIN objs ON d.classid = objs.classid AND d.objid = objs.objid)
      SELECT s.refobjid FROM objs JOIN pg_catalog.pg_shdepend s ON s.classid = objs.classid
        AND s.objid = objs.objid AND s.deptype = 'o' AND s.dbid = ${DB_OID})`;
export const GUARD_BODY = `
DECLARE locked boolean; permitted name;
BEGIN
  SELECT enabled, cli_role INTO locked, permitted FROM cms_writer_freeze.state WHERE singleton;
  IF NOT FOUND OR locked IS NULL OR permitted IS NULL THEN
    RAISE EXCEPTION 'CMS writer guard state invalid';
  END IF;
  IF locked AND session_user <> permitted THEN
    RAISE EXCEPTION 'CMS writes frozen for login role %', session_user USING ERRCODE = '42501';
  END IF;
  RETURN NULL;
END
`;

/**
 * Logins outside {INSTALLER, trusted} that are, or can reach by any membership (INHERIT, SET or
 * ADMIN-only), a role matching `condition`; the list lands in `bad`.
 */
function offenders(x: Ctx, condition: string): string {
  return `SELECT pg_catalog.string_agg(DISTINCT login_role.rolname::text, ', ') INTO bad
    FROM pg_catalog.pg_roles login_role JOIN pg_catalog.pg_roles assumed_role
      ON assumed_role.oid = login_role.oid OR pg_catalog.pg_has_role(login_role.oid, assumed_role.oid, 'MEMBER')
    WHERE login_role.rolcanlogin AND NOT (login_role.rolname = ANY (ARRAY[${x.installer}]::name[] || ${x.trusted}))
      AND (${condition});`;
}

function roleChecks(x: Ctx): string {
  return `
DO $check_roles$
DECLARE bad text;
  restricted text := CASE WHEN pg_catalog.current_setting('server_version_num')::integer >= 170000
    THEN 'TRUNCATE,REFERENCES,TRIGGER,MAINTAIN' ELSE 'TRUNCATE,REFERENCES,TRIGGER' END;
BEGIN
  IF pg_catalog.current_setting('server_version_num')::integer < 160000 THEN
    RAISE EXCEPTION 'PostgreSQL 16 or later is required';
  END IF;
  IF session_user <> ${x.installer} OR current_user <> ${x.installer} THEN
    RAISE EXCEPTION 'Wrong installer identity: % / %', session_user, current_user;
  END IF;
  SELECT pg_catalog.string_agg(wanted::text, ', ') INTO bad
    FROM pg_catalog.unnest(ARRAY[${x.app}, ${x.cli}, ${x.owner}, ${x.installer}, ${x.source}]::name[] || ${x.trusted}) wanted
    WHERE NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles r WHERE r.rolname = wanted);
  IF bad IS NOT NULL THEN
    RAISE EXCEPTION 'Required or trusted database role missing: %', bad;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_catalog.pg_roles r WHERE r.rolname IN (${x.app}, ${x.cli}, ${x.owner})
      AND (CASE WHEN r.rolname = ${x.owner} THEN r.rolcanlogin ELSE NOT r.rolcanlogin END
        OR r.rolsuper OR r.rolcreaterole OR r.rolcreatedb OR r.rolreplication OR r.rolbypassrls)) THEN
    RAISE EXCEPTION 'App and CLI must be plain LOGIN roles and the guard owner a plain NOLOGIN role';
  END IF;
  IF NOT (pg_catalog.pg_has_role(${x.installer}, ${x.owner}, 'USAGE') AND pg_catalog.pg_has_role(${x.installer}, ${x.owner}, 'SET')
      AND pg_catalog.pg_has_role(${x.installer}, ${x.source}, 'USAGE') AND pg_catalog.pg_has_role(${x.installer}, ${x.source}, 'SET')) THEN
    RAISE EXCEPTION 'Installer needs INHERIT and SET membership in the guard owner and source owner';
  END IF;
  -- Partial drain check only: it cannot prove that a rotated credential is unused elsewhere.
  IF EXISTS (SELECT 1 FROM pg_catalog.pg_stat_activity a WHERE a.pid <> pg_catalog.pg_backend_pid()
      AND a.usesysid IN (${x.installer}::regrole::oid, ${x.source}::regrole::oid)) THEN
    RAISE EXCEPTION 'Another session is connected as the installer or source owner; drain it first';
  END IF;
  SELECT pg_catalog.string_agg(DISTINCT w.rolname || ' via ' || r.rolname, ', ') INTO bad
    FROM pg_catalog.pg_roles w JOIN pg_catalog.pg_roles r ON r.oid = w.oid OR pg_catalog.pg_has_role(w.oid, r.oid, 'MEMBER')
    WHERE w.rolname IN (${x.app}, ${x.cli})
      AND (r.rolname = ANY (ARRAY[${x.owner}, ${x.installer}, ${x.source}]::name[] || ${x.trusted})
        OR (w.rolname = ${x.app} AND r.rolname = ${x.cli})
        OR EXISTS (SELECT 1 FROM pg_catalog.pg_shdepend s WHERE s.refclassid = 'pg_catalog.pg_authid'::regclass
          AND s.refobjid = r.oid AND s.deptype = 'o' AND s.dbid IN (0, ${DB_OID}))
        OR EXISTS (SELECT 1 FROM ${CMS_TABLES} AND t.relkind = 'r'
          AND pg_catalog.has_table_privilege(r.oid, t.oid, restricted)));
  IF bad IS NOT NULL THEN
    RAISE EXCEPTION 'App/CLI can assume a guard, installer, source-owner, trusted or CLI role, owns objects, or holds TRUNCATE/REFERENCES/TRIGGER/MAINTAIN on CMS tables: %', bad;
  END IF;
  ${offenders(
    x,
    `assumed_role.rolsuper OR assumed_role.rolcreaterole OR assumed_role.rolbypassrls
        OR assumed_role.rolname IN ('pg_execute_server_program', 'pg_write_server_files', 'pg_write_all_data', 'pg_maintain')
        OR pg_catalog.pg_has_role(assumed_role.oid, ${x.owner}, 'MEMBER')`,
  )}
  IF bad IS NOT NULL THEN
    RAISE EXCEPTION 'Login role(s) % can bypass the guard or administer roles directly or via SET ROLE', bad;
  END IF;
  ${offenders(x, `assumed_role.rolname = ANY (ARRAY[${x.installer}]::name[] || ${x.trusted})`)}
  IF bad IS NOT NULL THEN
    RAISE EXCEPTION 'Login role(s) % can assume the installer or a trusted platform role', bad;
  END IF;
  ${offenders(
    x,
    `pg_catalog.has_database_privilege(assumed_role.oid, pg_catalog.current_database(), 'CREATE')
        OR EXISTS (SELECT 1 FROM pg_catalog.pg_database d
          WHERE d.datname = pg_catalog.current_database() AND d.datdba = assumed_role.oid)
        OR EXISTS (SELECT 1 FROM pg_catalog.pg_namespace ns
          WHERE ns.nspname NOT LIKE 'pg\\_%' ESCAPE '\\' AND ns.nspname <> 'information_schema'
            AND (ns.nspowner = assumed_role.oid OR pg_catalog.has_schema_privilege(assumed_role.oid, ns.oid, 'CREATE')))`,
  )}
  IF bad IS NOT NULL THEN
    RAISE EXCEPTION 'Login role(s) % can create unguarded CMS relations directly or via SET ROLE', bad;
  END IF;
END
$check_roles$;
`;
}

function coverageChecks(x: Ctx): string {
  return `
DO $check_coverage$
DECLARE missing_count integer; bad text;
BEGIN
  IF (SELECT count(*) FROM cms_writer_freeze.state) <> 1
     OR NOT EXISTS (SELECT 1 FROM cms_writer_freeze.state WHERE singleton) THEN
    RAISE EXCEPTION 'Freeze state row missing or not a singleton';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM cms_writer_freeze.state WHERE singleton AND cli_role = ${x.cli} AND app_role = ${x.app}
      AND owner_role = ${x.owner} AND installer_role = ${x.installer} AND source_owner = ${x.source}) THEN
    RAISE EXCEPTION 'Unexpected CLI, app, owner, installer or source-owner role in guard state';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM cms_writer_freeze.state WHERE singleton AND trusted_roles = ${x.trusted}) THEN
    RAISE EXCEPTION 'Trusted platform role list differs from the installed guard state';
  END IF;
  IF EXISTS (SELECT 1 FROM cms_writer_freeze.coverage c LEFT JOIN pg_catalog.pg_class t ON t.oid = ${COVERED}
      WHERE t.oid IS NULL OR t.relowner <> ${x.owner}::regrole::oid) THEN
    RAISE EXCEPTION 'Guarded table absent or owned by another role';
  END IF;
  SELECT count(*) INTO missing_count FROM ${CMS_TABLES} AND t.relkind IN ('r', 'p', 'v', 'm', 'f', 'S')
    AND (t.relkind <> 'r' OR NOT EXISTS (SELECT 1 FROM cms_writer_freeze.coverage c
      WHERE c.schema_name = n.nspname AND c.table_name = t.relname));
  IF missing_count <> 0 OR (SELECT count(*) FROM cms_writer_freeze.coverage) = 0 THEN
    RAISE EXCEPTION 'CMS table coverage drift: % unexpected objects', missing_count;
  END IF;
  IF EXISTS (SELECT 1 FROM cms_writer_freeze.coverage c JOIN pg_catalog.pg_trigger tr ON tr.tgrelid = ${COVERED}
      WHERE NOT tr.tgisinternal AND tr.tgname NOT IN ('cms_writer_freeze_dml', 'cms_writer_freeze_truncate'))
    OR EXISTS (SELECT 1 FROM cms_writer_freeze.coverage c JOIN pg_catalog.pg_rewrite rw ON rw.ev_class = ${COVERED}) THEN
    RAISE EXCEPTION 'Unexpected CMS user trigger or rule';
  END IF;
  -- UPDATE/DELETE through an inheritance parent skip the child's statement triggers.
  IF EXISTS (SELECT 1 FROM cms_writer_freeze.coverage c JOIN pg_catalog.pg_inherits i ON ${COVERED} IN (i.inhrelid, i.inhparent)) THEN
    RAISE EXCEPTION 'CMS table inheritance requires a reviewed guard design';
  END IF;
  IF ${CMS_SEQUENCE_USE} THEN
    RAISE EXCEPTION 'CMS sequence/nextval drift';
  END IF;
  IF EXISTS (SELECT 1 FROM cms_writer_freeze.coverage c
      CROSS JOIN (VALUES ('cms_writer_freeze_dml', 30), ('cms_writer_freeze_truncate', 34)) g(name, type)
      WHERE NOT EXISTS (SELECT 1 FROM pg_catalog.pg_trigger tr WHERE tr.tgrelid = ${COVERED} AND tr.tgname = g.name
        AND tr.tgenabled = 'A' AND tr.tgtype = g.type AND tr.tgfoid = ${GUARD_FN})) THEN
    RAISE EXCEPTION 'CMS trigger missing, disabled or replaced';
  END IF;
  IF (SELECT n.nspowner FROM pg_catalog.pg_namespace n WHERE n.nspname = 'cms_writer_freeze') IS DISTINCT FROM ${x.owner}::regrole::oid
     OR EXISTS (SELECT 1 FROM pg_catalog.pg_class g WHERE g.oid IN ${GUARD_TABLES} AND g.relowner <> ${x.owner}::regrole::oid) THEN
    RAISE EXCEPTION 'Guard schema/state ownership drift';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_proc p WHERE p.oid = ${GUARD_FN} AND p.prosecdef
      AND p.proowner = ${x.owner}::regrole::oid AND p.prosrc = ${literal(GUARD_BODY)}
      AND p.proconfig = ARRAY['search_path=pg_catalog']::text[]) THEN
    RAISE EXCEPTION 'Guard function owner, body, security or search_path drift';
  END IF;
  IF EXISTS (SELECT 1 FROM (SELECT nspacl AS acl FROM pg_catalog.pg_namespace WHERE nspname = 'cms_writer_freeze'
        UNION ALL SELECT relacl FROM pg_catalog.pg_class WHERE oid IN ${GUARD_TABLES}
        UNION ALL SELECT proacl FROM pg_catalog.pg_proc WHERE oid = ${GUARD_FN}) g
      CROSS JOIN LATERAL pg_catalog.aclexplode(g.acl) x WHERE x.grantee <> ${x.owner}::regrole::oid)
    OR EXISTS (SELECT 1 FROM cms_writer_freeze.coverage c JOIN pg_catalog.pg_class t ON t.oid = ${COVERED}
      CROSS JOIN LATERAL pg_catalog.aclexplode(t.relacl) x
      WHERE x.privilege_type = 'TRIGGER' AND x.grantee <> ${x.owner}::regrole::oid) THEN
    RAISE EXCEPTION 'Guard objects or CMS TRIGGER privilege granted to a role other than the guard owner';
  END IF;
  IF EXISTS (SELECT 1 FROM cms_writer_freeze.coverage c CROSS JOIN (VALUES (${x.app}::name), (${x.cli}::name)) w(role)
      CROSS JOIN (VALUES ('SELECT'), ('INSERT'), ('UPDATE'), ('DELETE')) p(priv)
      WHERE NOT pg_catalog.has_table_privilege(w.role, ${COVERED}, p.priv)
        OR NOT pg_catalog.has_schema_privilege(w.role, c.schema_name::text, 'USAGE')) THEN
    RAISE EXCEPTION 'App/CLI CMS table grant drift';
  END IF;
  ${offenders(x, `assumed_role.oid IN ${CMS_DEPENDENCY_OWNERS}`)}
  IF bad IS NOT NULL THEN
    RAISE EXCEPTION 'Login role(s) % own or can assume the owner of an object the CMS tables depend on', bad;
  END IF;
END
$check_coverage$;
`;
}

function installSql(x: Ctx, ownerIdent: string): string {
  return `${roleChecks(x)}
DO $preflight$
BEGIN
  IF pg_catalog.to_regnamespace('cms_writer_freeze') IS NOT NULL THEN
    RAISE EXCEPTION 'Guard already installed; use verify';
  END IF;
  IF NOT pg_catalog.has_database_privilege(${x.installer}, pg_catalog.current_database(), 'CREATE') THEN
    RAISE EXCEPTION 'Installer cannot create guard schema in this database';
  END IF;
  IF EXISTS (SELECT 1 FROM ${CMS_TABLES} AND t.relkind = 'r'
      AND NOT pg_catalog.has_schema_privilege(${x.installer}, n.oid, 'CREATE WITH GRANT OPTION')) THEN
    RAISE EXCEPTION 'Installer cannot grant temporary schema CREATE for ownership transfer';
  END IF;
  IF EXISTS (SELECT 1 FROM ${CMS_TABLES}
      AND (EXISTS (SELECT 1 FROM pg_catalog.pg_trigger tr WHERE tr.tgrelid = t.oid AND NOT tr.tgisinternal)
        OR (t.relkind = 'r' AND EXISTS (SELECT 1 FROM pg_catalog.pg_rewrite rw WHERE rw.ev_class = t.oid)))) THEN
    RAISE EXCEPTION 'Existing CMS user trigger or rule requires reviewed ordering and side-effect design';
  END IF;
  IF ${CMS_SEQUENCE_USE} THEN
    RAISE EXCEPTION 'CMS sequence/nextval use needs separate freeze design';
  END IF;
  IF EXISTS (SELECT 1 FROM ${CMS_TABLES} AND t.relkind IN ('p', 'v', 'm', 'f', 'S')) THEN
    RAISE EXCEPTION 'Non-ordinary cms_* relation requires a reviewed guard design';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM ${CMS_TABLES} AND t.relkind = 'r') THEN
    RAISE EXCEPTION 'No CMS tables discovered';
  END IF;
  IF EXISTS (SELECT 1 FROM ${CMS_TABLES} AND t.relkind = 'r' AND t.relowner <> ${x.source}::regrole::oid) THEN
    RAISE EXCEPTION 'CMS table ownership differs from the declared source owner';
  END IF;
  IF EXISTS (SELECT 1 FROM ${CMS_TABLES} AND t.relkind = 'r'
      AND pg_catalog.has_table_privilege(${x.cli}, t.oid, 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')) THEN
    RAISE EXCEPTION 'CLI role must be fresh without existing CMS table grants';
  END IF;
END
$preflight$;
CREATE SCHEMA cms_writer_freeze AUTHORIZATION ${ownerIdent};
REVOKE ALL ON SCHEMA cms_writer_freeze FROM PUBLIC;
CREATE TABLE cms_writer_freeze.state (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  enabled boolean NOT NULL,
  cli_role name NOT NULL,
  app_role name NOT NULL,
  owner_role name NOT NULL,
  installer_role name NOT NULL,
  source_owner name NOT NULL,
  trusted_roles name[] NOT NULL
);
INSERT INTO cms_writer_freeze.state VALUES (true, true, ${x.cli}, ${x.app}, ${x.owner}, ${x.installer}, ${x.source}, ${x.trusted});
ALTER TABLE cms_writer_freeze.state OWNER TO ${ownerIdent};
REVOKE ALL ON cms_writer_freeze.state FROM PUBLIC;
CREATE TABLE cms_writer_freeze.coverage (schema_name name NOT NULL, table_name name NOT NULL, PRIMARY KEY (schema_name, table_name));
ALTER TABLE cms_writer_freeze.coverage OWNER TO ${ownerIdent};
REVOKE ALL ON cms_writer_freeze.coverage FROM PUBLIC;
CREATE FUNCTION cms_writer_freeze.reject_unless_cli() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $guard$${GUARD_BODY}$guard$;
ALTER FUNCTION cms_writer_freeze.reject_unless_cli() OWNER TO ${ownerIdent};
REVOKE ALL ON FUNCTION cms_writer_freeze.reject_unless_cli() FROM PUBLIC;
DO $install$
DECLARE sch record; tbl record; temp_create boolean; qualified text;
BEGIN
  FOR sch IN SELECT DISTINCT n.oid, n.nspname FROM ${CMS_TABLES} AND t.relkind = 'r' ORDER BY n.nspname LOOP
    temp_create := NOT pg_catalog.has_schema_privilege(${x.owner}, sch.oid, 'CREATE');
    IF temp_create THEN
      EXECUTE pg_catalog.format('GRANT CREATE ON SCHEMA %I TO %I', sch.nspname, ${x.owner});
    END IF;
    EXECUTE pg_catalog.format('GRANT USAGE ON SCHEMA %I TO %I, %I', sch.nspname, ${x.app}, ${x.cli});
    FOR tbl IN SELECT c.relname FROM pg_catalog.pg_class c WHERE c.relnamespace = sch.oid AND c.relkind = 'r'
        AND c.relname LIKE 'cms\\_%' ESCAPE '\\' ORDER BY c.relname LOOP
      qualified := pg_catalog.format('%I.%I', sch.nspname, tbl.relname);
      EXECUTE pg_catalog.format('ALTER TABLE %s OWNER TO %I', qualified, ${x.owner});
      EXECUTE pg_catalog.format('GRANT SELECT, INSERT, UPDATE, DELETE ON %s TO %I, %I', qualified, ${x.app}, ${x.cli});
      EXECUTE pg_catalog.format('CREATE TRIGGER cms_writer_freeze_dml BEFORE INSERT OR UPDATE OR DELETE ON %s FOR EACH STATEMENT EXECUTE FUNCTION cms_writer_freeze.reject_unless_cli()', qualified);
      EXECUTE pg_catalog.format('ALTER TABLE %s ENABLE ALWAYS TRIGGER cms_writer_freeze_dml', qualified);
      EXECUTE pg_catalog.format('CREATE TRIGGER cms_writer_freeze_truncate BEFORE TRUNCATE ON %s FOR EACH STATEMENT EXECUTE FUNCTION cms_writer_freeze.reject_unless_cli()', qualified);
      EXECUTE pg_catalog.format('ALTER TABLE %s ENABLE ALWAYS TRIGGER cms_writer_freeze_truncate', qualified);
      INSERT INTO cms_writer_freeze.coverage VALUES (sch.nspname, tbl.relname);
    END LOOP;
    IF temp_create THEN
      EXECUTE pg_catalog.format('REVOKE CREATE ON SCHEMA %I FROM %I', sch.nspname, ${x.owner});
    END IF;
  END LOOP;
END
$install$;
${roleChecks(x)}${coverageChecks(x)}`;
}

function uninstallSql(x: Ctx): string {
  return `${roleChecks(x)}${coverageChecks(x)}
DO $uninstall_guard$
BEGIN
  IF (SELECT enabled FROM cms_writer_freeze.state WHERE singleton) THEN
    RAISE EXCEPTION 'Unfreeze and verify before uninstall';
  END IF;
END
$uninstall_guard$;
DO $remove$
DECLARE sch record; tbl record; temp_create boolean;
BEGIN
  FOR sch IN SELECT DISTINCT c.schema_name FROM cms_writer_freeze.coverage c ORDER BY c.schema_name LOOP
    temp_create := NOT pg_catalog.has_schema_privilege(${x.source}, sch.schema_name::text, 'CREATE');
    IF temp_create THEN
      EXECUTE pg_catalog.format('GRANT CREATE ON SCHEMA %I TO %I', sch.schema_name, ${x.source});
    END IF;
    FOR tbl IN SELECT pg_catalog.format('%I.%I', c.schema_name, c.table_name) AS qualified
        FROM cms_writer_freeze.coverage c WHERE c.schema_name = sch.schema_name ORDER BY c.table_name LOOP
      EXECUTE pg_catalog.format('DROP TRIGGER cms_writer_freeze_dml ON %s', tbl.qualified);
      EXECUTE pg_catalog.format('DROP TRIGGER cms_writer_freeze_truncate ON %s', tbl.qualified);
      EXECUTE pg_catalog.format('REVOKE ALL ON %s FROM %I', tbl.qualified, ${x.cli});
      EXECUTE pg_catalog.format('ALTER TABLE %s OWNER TO %I', tbl.qualified, ${x.source});
    END LOOP;
    IF temp_create THEN
      EXECUTE pg_catalog.format('REVOKE CREATE ON SCHEMA %I FROM %I', sch.schema_name, ${x.source});
    END IF;
    EXECUTE pg_catalog.format('REVOKE USAGE ON SCHEMA %I FROM %I', sch.schema_name, ${x.cli});
  END LOOP;
END
$remove$;
DROP FUNCTION cms_writer_freeze.reject_unless_cli();
DROP TABLE cms_writer_freeze.coverage;
DROP TABLE cms_writer_freeze.state;
DROP SCHEMA cms_writer_freeze RESTRICT;
DO $after_uninstall$
BEGIN
  IF pg_catalog.to_regnamespace('cms_writer_freeze') IS NOT NULL OR EXISTS (SELECT 1 FROM pg_catalog.pg_trigger tr
      WHERE tr.tgname IN ('cms_writer_freeze_dml', 'cms_writer_freeze_truncate')) THEN
    RAISE EXCEPTION 'Guard schema or trigger still present after uninstall';
  END IF;
  IF EXISTS (SELECT 1 FROM ${CMS_TABLES} AND t.relkind = 'r' AND (t.relowner <> ${x.source}::regrole::oid
      OR NOT pg_catalog.has_schema_privilege(${x.app}, n.oid, 'USAGE')
      OR EXISTS (SELECT 1 FROM (VALUES ('SELECT'), ('INSERT'), ('UPDATE'), ('DELETE')) p(priv)
        WHERE NOT pg_catalog.has_table_privilege(${x.app}, t.oid, p.priv))
      OR pg_catalog.has_table_privilege(${x.cli}, t.oid, 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
      OR EXISTS (SELECT 1 FROM pg_catalog.aclexplode(n.nspacl) x WHERE x.grantee = ${x.cli}::regrole::oid))) THEN
    RAISE EXCEPTION 'Uninstall did not restore source ownership, keep app DML or revoke CLI access';
  END IF;
END
$after_uninstall$;
`;
}

/** The single entry point: one reviewed transaction per action, for a disposable branch proof. */
export function makeFreezeSql(
  action: FreezeAction,
  roles: FreezeRoles,
  purpose: FreezePurpose,
): string {
  if (!FREEZE_ACTIONS.includes(action)) throw new Error('Unknown writer freeze action');
  if (purpose !== FREEZE_PURPOSE) throw new Error(`Purpose must be ${FREEZE_PURPOSE}`);
  const trusted = validateRoles(roles);
  const x: Ctx = {
    app: literal(roles.app),
    cli: literal(roles.cli),
    owner: literal(roles.owner),
    installer: literal(roles.installer),
    source: literal(roles.sourceOwner),
    trusted: `ARRAY[${trusted.map(literal).join(', ')}]::name[]`,
  };
  const header = [
    `-- Generated CMS writer freeze: ${action}. Purpose: ${purpose}.`,
    '-- Run only on a named disposable Neon branch after review; never on live Staging or Production.',
    `-- Roles: app=${roles.app} cli=${roles.cli} owner=${roles.owner} installer=${roles.installer} source_owner=${roles.sourceOwner}`,
    `-- Trusted platform roles: ${trusted.length ? trusted.join(', ') : 'none'}`,
    '-- ATTESTATION: SQL cannot prove these platform roles safe; the operator and reviewer attest to them.',
  ].join('\n');
  const prefix = `${header}\nBEGIN;\nSET LOCAL lock_timeout = '15s';\nSET LOCAL statement_timeout = '5min';\n`;
  const checks = `${roleChecks(x)}${coverageChecks(x)}`;
  const bodies: Record<FreezeAction, () => string> = {
    install: () => installSql(x, quoteIdent(roles.owner)),
    verify: () => `${checks}
SELECT enabled, cli_role, app_role, owner_role, installer_role, source_owner, trusted_roles,
  (SELECT count(*) FROM cms_writer_freeze.coverage) AS guarded_tables FROM cms_writer_freeze.state;
`,
    freeze: () =>
      `${checks}\nUPDATE cms_writer_freeze.state SET enabled = true WHERE singleton;\n${coverageChecks(x)}`,
    unfreeze: () =>
      `${checks}\nUPDATE cms_writer_freeze.state SET enabled = false WHERE singleton;\n${coverageChecks(x)}`,
    uninstall: () => uninstallSql(x),
  };
  return `${prefix}${bodies[action]()}COMMIT;\n`;
}
