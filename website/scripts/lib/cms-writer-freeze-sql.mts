/** Offline SQL generator. Generated SQL is reviewed before an operator runs it. */
export type FreezeRoles = {
  app: string;
  cli: string;
  owner: string;
  installer: string;
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

export function makeFreezeSql(
  action: 'install' | 'verify' | 'freeze' | 'unfreeze' | 'uninstall',
  roles: FreezeRoles,
): string {
  const names = Object.values(roles);
  names.forEach(quoteIdent);
  if (new Set(names).size !== names.length) throw new Error('Every freeze role must be distinct');
  const app = literal(roles.app);
  const cli = literal(roles.cli);
  const owner = literal(roles.owner);
  const installer = literal(roles.installer);
  const prefix = `-- Generated CMS writer freeze: ${action}. Run only on the verified target after review.\nBEGIN;\nSET LOCAL lock_timeout = '15s';\nSET LOCAL statement_timeout = '5min';\n`;
  const roleChecks = `
DO $check_roles$
DECLARE r record;
BEGIN
  IF session_user <> ${installer} OR current_user <> ${installer} THEN
    RAISE EXCEPTION 'Wrong installer identity: % / %', session_user, current_user;
  END IF;
  FOR r IN SELECT rolname, rolcanlogin, rolsuper, rolcreaterole, rolbypassrls
           FROM pg_catalog.pg_roles WHERE rolname IN (${app}, ${cli}, ${owner}, ${installer}) LOOP
    IF r.rolname IN (${app}, ${cli}) AND (NOT r.rolcanlogin OR r.rolsuper OR r.rolcreaterole OR r.rolbypassrls) THEN
      RAISE EXCEPTION 'Unsafe writer role: %', r.rolname;
    END IF;
    IF r.rolname = ${owner} AND r.rolcanlogin THEN
      RAISE EXCEPTION 'Guard owner must be NOLOGIN';
    END IF;
  END LOOP;
  IF (SELECT count(*) FROM pg_catalog.pg_roles WHERE rolname IN (${app}, ${cli}, ${owner}, ${installer})) <> 4 THEN
    RAISE EXCEPTION 'A required database role is missing';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_catalog.pg_roles rr
             WHERE rr.rolcanlogin AND rr.rolname <> ${installer}
               AND (rr.rolsuper OR rr.rolcreaterole OR pg_catalog.pg_has_role(rr.oid, ${owner}, 'MEMBER'))) THEN
    RAISE EXCEPTION 'Another login role can bypass the guard owner or administer roles';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_catalog.pg_roles rr WHERE rr.rolcanlogin AND rr.rolname <> ${installer}
    AND (pg_catalog.has_database_privilege(rr.oid, current_database(), 'CREATE')
      OR EXISTS (SELECT 1 FROM pg_catalog.pg_namespace ns
        WHERE ns.nspname NOT LIKE 'pg\\_%' ESCAPE '\\' AND ns.nspname <> 'information_schema'
          AND pg_catalog.has_schema_privilege(rr.oid, ns.oid, 'CREATE')))) THEN
    RAISE EXCEPTION 'A deployed login can create unguarded CMS relations';
  END IF;
  IF pg_catalog.pg_has_role(${app}, ${cli}, 'MEMBER') THEN
    RAISE EXCEPTION 'App role can assume CLI role';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_catalog.pg_roles rr WHERE rr.rolcanlogin AND rr.rolname <> ${installer}
    AND (pg_catalog.pg_has_role(rr.oid, ${installer}, 'MEMBER'))) THEN
    RAISE EXCEPTION 'Another login role can assume installer role';
  END IF;
END
$check_roles$;
`;
  const coverageChecks = `
DO $check_coverage$
DECLARE missing_count integer;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM cms_writer_freeze.state WHERE singleton) THEN
    RAISE EXCEPTION 'Freeze state row missing';
  END IF;
  IF (SELECT count(*) FROM cms_writer_freeze.state) <> 1 THEN
    RAISE EXCEPTION 'Freeze state is not a singleton';
  END IF;
  IF (SELECT cli_role FROM cms_writer_freeze.state WHERE singleton) <> ${cli} THEN
    RAISE EXCEPTION 'Unexpected CLI role in guard state';
  END IF;
  IF EXISTS (SELECT 1 FROM cms_writer_freeze.coverage c
             LEFT JOIN pg_catalog.pg_class t ON t.oid = pg_catalog.to_regclass(pg_catalog.format('%I.%I', c.schema_name, c.table_name))
             WHERE t.oid IS NULL OR t.relowner <> ${owner}::regrole::oid) THEN
    RAISE EXCEPTION 'Guarded table absent or owned by another role';
  END IF;
  SELECT count(*) INTO missing_count FROM pg_catalog.pg_class t
    JOIN pg_catalog.pg_namespace n ON n.oid = t.relnamespace
    LEFT JOIN cms_writer_freeze.coverage c ON c.schema_name = n.nspname AND c.table_name = t.relname
    WHERE t.relname LIKE 'cms\\_%' ESCAPE '\\' AND n.nspname NOT LIKE 'pg\\_%' ESCAPE '\\'
      AND n.nspname <> 'information_schema' AND n.nspname <> 'cms_writer_freeze'
      AND t.relkind IN ('r','p','v','m','f','S') AND (t.relkind <> 'r' OR c.table_name IS NULL);
  IF missing_count <> 0 OR (SELECT count(*) FROM cms_writer_freeze.coverage) = 0 THEN
    RAISE EXCEPTION 'CMS table coverage drift: % unexpected objects', missing_count;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_catalog.pg_trigger tr JOIN pg_catalog.pg_class t ON t.oid=tr.tgrelid
    JOIN cms_writer_freeze.coverage c ON c.table_name=t.relname
      AND c.schema_name=(SELECT n.nspname FROM pg_catalog.pg_namespace n WHERE n.oid=t.relnamespace)
    WHERE NOT tr.tgisinternal AND tr.tgname NOT IN ('cms_writer_freeze_dml','cms_writer_freeze_truncate')) THEN
    RAISE EXCEPTION 'Unexpected CMS user trigger';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_catalog.pg_class seq JOIN pg_catalog.pg_depend dep ON dep.objid=seq.oid
    JOIN pg_catalog.pg_class t ON t.oid=dep.refobjid
    WHERE seq.relkind='S' AND t.relname LIKE 'cms\\_%' ESCAPE '\\')
    OR EXISTS (SELECT 1 FROM pg_catalog.pg_attrdef def JOIN pg_catalog.pg_class t ON t.oid=def.adrelid
      WHERE t.relname LIKE 'cms\\_%' ESCAPE '\\'
        AND pg_catalog.pg_get_expr(def.adbin, def.adrelid) ILIKE '%nextval%') THEN
    RAISE EXCEPTION 'CMS sequence/nextval drift';
  END IF;
  IF EXISTS (SELECT 1 FROM cms_writer_freeze.coverage c
    WHERE NOT EXISTS (SELECT 1 FROM pg_catalog.pg_trigger tr
      WHERE tr.tgrelid = pg_catalog.to_regclass(pg_catalog.format('%I.%I', c.schema_name, c.table_name))
        AND tr.tgname = 'cms_writer_freeze_dml' AND tr.tgenabled = 'A'
        AND tr.tgfoid = 'cms_writer_freeze.reject_unless_cli()'::regprocedure AND tr.tgtype = 30)
      OR NOT EXISTS (SELECT 1 FROM pg_catalog.pg_trigger tr
      WHERE tr.tgrelid = pg_catalog.to_regclass(pg_catalog.format('%I.%I', c.schema_name, c.table_name))
        AND tr.tgname = 'cms_writer_freeze_truncate' AND tr.tgenabled = 'A'
        AND tr.tgfoid = 'cms_writer_freeze.reject_unless_cli()'::regprocedure AND tr.tgtype = 34)) THEN
    RAISE EXCEPTION 'CMS trigger missing, disabled or replaced';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_catalog.pg_roles rr WHERE rr.rolname IN (${app}, ${cli})
    AND (pg_catalog.has_table_privilege(rr.oid, 'cms_writer_freeze.state', 'INSERT,UPDATE,DELETE,TRUNCATE')
      OR pg_catalog.has_table_privilege(rr.oid, 'cms_writer_freeze.coverage', 'INSERT,UPDATE,DELETE,TRUNCATE'))) THEN
    RAISE EXCEPTION 'Writer role can alter guard state';
  END IF;
  IF EXISTS (SELECT 1 FROM cms_writer_freeze.coverage c
    WHERE NOT (pg_catalog.has_table_privilege(${app}, pg_catalog.to_regclass(pg_catalog.format('%I.%I', c.schema_name, c.table_name)), 'SELECT')
      AND pg_catalog.has_table_privilege(${app}, pg_catalog.to_regclass(pg_catalog.format('%I.%I', c.schema_name, c.table_name)), 'INSERT')
      AND pg_catalog.has_table_privilege(${app}, pg_catalog.to_regclass(pg_catalog.format('%I.%I', c.schema_name, c.table_name)), 'UPDATE')
      AND pg_catalog.has_table_privilege(${app}, pg_catalog.to_regclass(pg_catalog.format('%I.%I', c.schema_name, c.table_name)), 'DELETE')
      AND pg_catalog.has_table_privilege(${cli}, pg_catalog.to_regclass(pg_catalog.format('%I.%I', c.schema_name, c.table_name)), 'SELECT')
      AND pg_catalog.has_table_privilege(${cli}, pg_catalog.to_regclass(pg_catalog.format('%I.%I', c.schema_name, c.table_name)), 'INSERT')
      AND pg_catalog.has_table_privilege(${cli}, pg_catalog.to_regclass(pg_catalog.format('%I.%I', c.schema_name, c.table_name)), 'UPDATE')
      AND pg_catalog.has_table_privilege(${cli}, pg_catalog.to_regclass(pg_catalog.format('%I.%I', c.schema_name, c.table_name)), 'DELETE'))) THEN
    RAISE EXCEPTION 'App/CLI CMS table grant drift';
  END IF;
  IF (SELECT n.nspowner FROM pg_catalog.pg_namespace n WHERE n.nspname='cms_writer_freeze') IS DISTINCT FROM ${owner}::regrole::oid
     OR (SELECT c.relowner FROM pg_catalog.pg_class c WHERE c.oid='cms_writer_freeze.state'::regclass) IS DISTINCT FROM ${owner}::regrole::oid
     OR (SELECT c.relowner FROM pg_catalog.pg_class c WHERE c.oid='cms_writer_freeze.coverage'::regclass) IS DISTINCT FROM ${owner}::regrole::oid THEN
    RAISE EXCEPTION 'Guard schema/state ownership drift';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_catalog.pg_roles rr WHERE rr.rolname IN (${app}, ${cli})
    AND pg_catalog.has_schema_privilege(rr.oid, 'cms_writer_freeze', 'CREATE')) THEN
    RAISE EXCEPTION 'Writer can create in guard schema';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_proc p WHERE p.oid = 'cms_writer_freeze.reject_unless_cli()'::regprocedure
    AND p.prosecdef AND p.proowner = ${owner}::regrole::oid
    AND p.proconfig = ARRAY['search_path=pg_catalog']::text[]) THEN
    RAISE EXCEPTION 'Guard function owner, security or search_path drift';
  END IF;
END
$check_coverage$;
`;
  const install = `
${roleChecks}
DO $preflight$
BEGIN
  IF pg_catalog.to_regnamespace('cms_writer_freeze') IS NOT NULL THEN
    RAISE EXCEPTION 'Guard already installed; use verify';
  END IF;
  IF NOT pg_catalog.has_database_privilege(${installer}, current_database(), 'CREATE') THEN
    RAISE EXCEPTION 'Installer cannot create guard schema in this database';
  END IF;
  IF NOT pg_catalog.pg_has_role(${installer}, ${owner}, 'MEMBER')
     OR NOT pg_catalog.pg_has_role(${installer}, ${app}, 'MEMBER')
     OR NOT pg_catalog.pg_has_role(${installer}, ${owner}, 'USAGE')
     OR NOT pg_catalog.pg_has_role(${installer}, ${app}, 'USAGE') THEN
    RAISE EXCEPTION 'Installer needs inherited membership in guard and app owners';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_catalog.pg_class t JOIN pg_catalog.pg_namespace n ON n.oid=t.relnamespace
    WHERE t.relname LIKE 'cms\\_%' ESCAPE '\\' AND n.nspname NOT LIKE 'pg\\_%' ESCAPE '\\'
      AND t.relkind='r' AND NOT pg_catalog.has_schema_privilege(${installer}, n.oid, 'CREATE WITH GRANT OPTION')) THEN
    RAISE EXCEPTION 'Installer cannot grant temporary schema CREATE for ownership transfer';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_catalog.pg_trigger tr JOIN pg_catalog.pg_class t ON t.oid=tr.tgrelid
    JOIN pg_catalog.pg_namespace n ON n.oid=t.relnamespace
    WHERE t.relname LIKE 'cms\\_%' ESCAPE '\\' AND n.nspname NOT LIKE 'pg\\_%' ESCAPE '\\'
      AND NOT tr.tgisinternal) THEN
    RAISE EXCEPTION 'Existing CMS user trigger requires reviewed ordering and side-effect design';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_catalog.pg_class seq JOIN pg_catalog.pg_depend dep ON dep.objid=seq.oid
    JOIN pg_catalog.pg_class t ON t.oid=dep.refobjid
    WHERE seq.relkind='S' AND t.relname LIKE 'cms\\_%' ESCAPE '\\')
    OR EXISTS (SELECT 1 FROM pg_catalog.pg_attrdef def JOIN pg_catalog.pg_class t ON t.oid=def.adrelid
      WHERE t.relname LIKE 'cms\\_%' ESCAPE '\\'
        AND pg_catalog.pg_get_expr(def.adbin, def.adrelid) ILIKE '%nextval%') THEN
    RAISE EXCEPTION 'CMS sequence/nextval use needs separate freeze design';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_catalog.pg_class t JOIN pg_catalog.pg_namespace n ON n.oid=t.relnamespace
    WHERE t.relname LIKE 'cms\\_%' ESCAPE '\\' AND n.nspname NOT LIKE 'pg\\_%' ESCAPE '\\'
      AND n.nspname <> 'information_schema' AND t.relkind IN ('p','v','m','f','S')) THEN
    RAISE EXCEPTION 'Non-ordinary cms_* relation requires a reviewed guard design';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_class t JOIN pg_catalog.pg_namespace n ON n.oid=t.relnamespace
    WHERE t.relname LIKE 'cms\\_%' ESCAPE '\\' AND n.nspname NOT LIKE 'pg\\_%' ESCAPE '\\' AND t.relkind='r') THEN
    RAISE EXCEPTION 'No CMS tables discovered';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_catalog.pg_class t JOIN pg_catalog.pg_namespace n ON n.oid=t.relnamespace
    WHERE t.relname LIKE 'cms\\_%' ESCAPE '\\' AND n.nspname NOT LIKE 'pg\\_%' ESCAPE '\\'
      AND t.relkind='r' AND t.relowner <> ${app}::regrole::oid) THEN
    RAISE EXCEPTION 'CMS table ownership differs from audited app role';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_catalog.pg_class t JOIN pg_catalog.pg_namespace n ON n.oid=t.relnamespace
    WHERE t.relname LIKE 'cms\\_%' ESCAPE '\\' AND n.nspname NOT LIKE 'pg\\_%' ESCAPE '\\'
      AND t.relkind='r' AND (pg_catalog.has_table_privilege(${cli}, t.oid, 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER'))) THEN
    RAISE EXCEPTION 'CLI role must be fresh without existing CMS table grants';
  END IF;
END
$preflight$;
CREATE SCHEMA cms_writer_freeze AUTHORIZATION ${quoteIdent(roles.owner)};
REVOKE ALL ON SCHEMA cms_writer_freeze FROM PUBLIC;
CREATE TABLE cms_writer_freeze.state (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  enabled boolean NOT NULL,
  cli_role name NOT NULL
);
INSERT INTO cms_writer_freeze.state (singleton, enabled, cli_role) VALUES (true, true, ${cli});
ALTER TABLE cms_writer_freeze.state OWNER TO ${quoteIdent(roles.owner)};
REVOKE ALL ON cms_writer_freeze.state FROM PUBLIC;
CREATE TABLE cms_writer_freeze.coverage (schema_name name NOT NULL, table_name name NOT NULL, PRIMARY KEY (schema_name, table_name));
ALTER TABLE cms_writer_freeze.coverage OWNER TO ${quoteIdent(roles.owner)};
REVOKE ALL ON cms_writer_freeze.coverage FROM PUBLIC;
CREATE FUNCTION cms_writer_freeze.reject_unless_cli() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $guard$
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
$guard$;
ALTER FUNCTION cms_writer_freeze.reject_unless_cli() OWNER TO ${quoteIdent(roles.owner)};
REVOKE ALL ON FUNCTION cms_writer_freeze.reject_unless_cli() FROM PUBLIC;
DO $install$
DECLARE t record; qualified text;
BEGIN
  FOR t IN SELECT n.nspname AS schema_name, c.relname AS table_name
    FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relname LIKE 'cms\\_%' ESCAPE '\\' AND n.nspname NOT LIKE 'pg\\_%' ESCAPE '\\'
      AND n.nspname <> 'information_schema' AND n.nspname <> 'cms_writer_freeze' AND c.relkind = 'r'
    ORDER BY n.nspname, c.relname LOOP
    qualified := pg_catalog.format('%I.%I', t.schema_name, t.table_name);
    EXECUTE pg_catalog.format('GRANT CREATE ON SCHEMA %I TO %I', t.schema_name, ${owner});
    EXECUTE pg_catalog.format('ALTER TABLE %s OWNER TO %I', qualified, ${owner});
    EXECUTE pg_catalog.format('GRANT USAGE ON SCHEMA %I TO %I', t.schema_name, ${cli});
    EXECUTE pg_catalog.format('GRANT SELECT, INSERT, UPDATE, DELETE ON %s TO %I, %I', qualified, ${app}, ${cli});
    EXECUTE pg_catalog.format('CREATE TRIGGER cms_writer_freeze_dml BEFORE INSERT OR UPDATE OR DELETE ON %s FOR EACH STATEMENT EXECUTE FUNCTION cms_writer_freeze.reject_unless_cli()', qualified);
    EXECUTE pg_catalog.format('ALTER TABLE %s ENABLE ALWAYS TRIGGER cms_writer_freeze_dml', qualified);
    EXECUTE pg_catalog.format('CREATE TRIGGER cms_writer_freeze_truncate BEFORE TRUNCATE ON %s FOR EACH STATEMENT EXECUTE FUNCTION cms_writer_freeze.reject_unless_cli()', qualified);
    EXECUTE pg_catalog.format('ALTER TABLE %s ENABLE ALWAYS TRIGGER cms_writer_freeze_truncate', qualified);
    INSERT INTO cms_writer_freeze.coverage VALUES (t.schema_name, t.table_name);
  END LOOP;
  FOR t IN SELECT DISTINCT schema_name FROM cms_writer_freeze.coverage LOOP
    EXECUTE pg_catalog.format('REVOKE CREATE ON SCHEMA %I FROM %I', t.schema_name, ${owner});
  END LOOP;
END
$install$;
${coverageChecks}
`;
  const verify = `${roleChecks}${coverageChecks}
SELECT enabled, cli_role, (SELECT count(*) FROM cms_writer_freeze.coverage) AS guarded_tables FROM cms_writer_freeze.state;
`;
  const assertInstalled = `${roleChecks}${coverageChecks}`;
  let body: string;
  if (action === 'install') body = install;
  else if (action === 'verify') body = verify;
  else if (action === 'freeze' || action === 'unfreeze') {
    body = `${assertInstalled}
UPDATE cms_writer_freeze.state SET enabled = ${action === 'freeze' ? 'true' : 'false'} WHERE singleton;
${coverageChecks}
`;
  } else {
    body = `${assertInstalled}
DO $uninstall_guard$ BEGIN
  IF (SELECT enabled FROM cms_writer_freeze.state WHERE singleton) THEN
    RAISE EXCEPTION 'Unfreeze and verify before uninstall';
  END IF;
END $uninstall_guard$;
DO $remove$
DECLARE t record;
BEGIN
  FOR t IN SELECT * FROM cms_writer_freeze.coverage LOOP
    EXECUTE pg_catalog.format('DROP TRIGGER cms_writer_freeze_dml ON %I.%I', t.schema_name, t.table_name);
    EXECUTE pg_catalog.format('DROP TRIGGER cms_writer_freeze_truncate ON %I.%I', t.schema_name, t.table_name);
    EXECUTE pg_catalog.format('REVOKE ALL ON %I.%I FROM %I, %I', t.schema_name, t.table_name, ${app}, ${cli});
    EXECUTE pg_catalog.format('GRANT CREATE ON SCHEMA %I TO %I', t.schema_name, ${app});
    EXECUTE pg_catalog.format('ALTER TABLE %I.%I OWNER TO %I', t.schema_name, t.table_name, ${app});
  END LOOP;
  FOR t IN SELECT DISTINCT schema_name FROM cms_writer_freeze.coverage LOOP
    EXECUTE pg_catalog.format('REVOKE CREATE ON SCHEMA %I FROM %I', t.schema_name, ${app});
    EXECUTE pg_catalog.format('REVOKE USAGE ON SCHEMA %I FROM %I', t.schema_name, ${cli});
  END LOOP;
END
$remove$;
DROP FUNCTION cms_writer_freeze.reject_unless_cli();
DROP TABLE cms_writer_freeze.coverage;
DROP TABLE cms_writer_freeze.state;
DROP SCHEMA cms_writer_freeze RESTRICT;
`;
  }
  return `${prefix}${body}COMMIT;\n`;
}
