/** Read-only post-setup audit before any APP deployment. */
import { SHOP_TABLES, type ProofRoles } from './cms-writer-freeze-proof.mjs';
import { GUARD_BODY } from './cms-writer-freeze-sql.mjs';

export type AuditClient = {
  query(sql: string, values?: unknown[]): Promise<{ rows: Array<Record<string, unknown>> }>;
};
export async function auditLiveRoleGrants(client: AuditClient, names: ProofRoles): Promise<void> {
  const roleRows = await client.query(
    `SELECT r.rolname,r.rolcanlogin,r.rolsuper,r.rolcreatedb,r.rolcreaterole,r.rolreplication,r.rolbypassrls,
  (SELECT count(*)::integer FROM pg_auth_members m WHERE m.member=r.oid) AS memberships,
  (SELECT count(*)::integer FROM pg_class c WHERE c.relowner=r.oid) AS owned_relations
  FROM pg_roles r WHERE r.rolname=ANY($1::name[])`,
    [[names.app, names.cli, names.owner]],
  );
  if (
    roleRows.rows.length !== 3 ||
    roleRows.rows.some(
      (r) =>
        r.rolsuper ||
        r.rolcreatedb ||
        r.rolcreaterole ||
        r.rolreplication ||
        r.rolbypassrls ||
        (r.rolname === names.owner ? r.rolcanlogin : !r.rolcanlogin) ||
        ([names.app, names.cli].includes(String(r.rolname)) &&
          (r.memberships !== 0 || r.owned_relations !== 0)),
    )
  )
    throw new Error('Live role attributes, memberships or ownership audit failed');
  const ownerMember = await client.query(
    `SELECT m.inherit_option,m.set_option,m.admin_option,r.rolname AS member
  FROM pg_auth_members m JOIN pg_roles r ON r.oid=m.member WHERE m.roleid=$1::regrole`,
    [names.owner],
  );
  if (
    ownerMember.rows.length !== 1 ||
    ownerMember.rows[0]?.member !== names.installer ||
    ownerMember.rows[0]?.inherit_option !== true ||
    ownerMember.rows[0]?.set_option !== true ||
    ownerMember.rows[0]?.admin_option !== false
  )
    throw new Error('Live OWNER membership audit failed');
  const grants = await client.query(
    `SELECT c.relname,
  has_table_privilege($1,c.oid,'SELECT') AS app_select,
  has_table_privilege($1,c.oid,'INSERT') AS app_insert,
  has_table_privilege($1,c.oid,'UPDATE') AS app_update,
  has_table_privilege($1,c.oid,'DELETE') AS app_delete,
  has_table_privilege($1,c.oid,'TRUNCATE') AS app_truncate,
  has_table_privilege($1,c.oid,'REFERENCES') AS app_references,
  has_table_privilege($1,c.oid,'TRIGGER') AS app_trigger,
  has_table_privilege($2,c.oid,'SELECT') AS cli_select,
  has_table_privilege($2,c.oid,'INSERT') AS cli_insert,
  has_table_privilege($2,c.oid,'UPDATE') AS cli_update,
  has_table_privilege($2,c.oid,'DELETE') AS cli_delete,
  has_table_privilege($2,c.oid,'TRUNCATE') AS cli_truncate,
  has_table_privilege($2,c.oid,'REFERENCES') AS cli_references,
  has_table_privilege($2,c.oid,'TRIGGER') AS cli_trigger
  FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
  WHERE n.nspname='public' AND c.relname=ANY($3::text[]) AND c.relkind='r'`,
    [names.app, names.cli, SHOP_TABLES],
  );
  if (
    grants.rows.length !== SHOP_TABLES.length ||
    new Set(grants.rows.map((r) => r.relname)).size !== SHOP_TABLES.length ||
    grants.rows.some(
      (r) =>
        !SHOP_TABLES.includes(r.relname as (typeof SHOP_TABLES)[number]) ||
        ['app_select', 'app_insert', 'app_update', 'app_delete'].some((key) => r[key] !== true) ||
        [
          'app_truncate',
          'app_references',
          'app_trigger',
          'cli_select',
          'cli_insert',
          'cli_update',
          'cli_delete',
          'cli_truncate',
          'cli_references',
          'cli_trigger',
        ].some((key) => r[key] !== false),
    )
  )
    throw new Error('Live webshop APP/CLI grant audit failed');
  const scopes = await client.query(
    `SELECT
  (SELECT count(*)::integer FROM pg_namespace n WHERE n.nspname NOT LIKE 'pg\\_%' ESCAPE '\\' AND n.nspname <> 'information_schema'
    AND (has_schema_privilege($1,n.oid,'CREATE') OR has_schema_privilege($2,n.oid,'CREATE'))) AS creatable_schemas,
  has_schema_privilege($1,'public','USAGE') AS app_usage,
  has_schema_privilege($1,'public','CREATE') AS app_schema_create,
  has_schema_privilege($2,'public','CREATE') AS cli_schema_create,
  has_database_privilege($1,current_database(),'CREATE') AS app_db_create,
  has_database_privilege($2,current_database(),'CREATE') AS cli_db_create`,
    [names.app, names.cli],
  );
  const scope = scopes.rows[0];
  if (
    !scope ||
    scope.app_usage !== true ||
    scope.creatable_schemas !== 0 ||
    ['app_schema_create', 'cli_schema_create', 'app_db_create', 'cli_db_create'].some(
      (key) => scope[key] !== false,
    )
  )
    throw new Error('Live APP/CLI database or schema grant audit failed');
}

/** Zero-row probes still fire statement triggers: refuse any unreviewed user trigger/rule. */
export async function auditLiveProbeRelations(
  client: AuditClient,
  cmsTable: string,
  phase: 'frozen' | 'unfrozen' | 'uninstalled',
  owner: string,
): Promise<void> {
  const inventory = await client.query(
    `SELECT c.relname,c.relkind FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public' AND c.relname=ANY($1::text[])`,
    [[...SHOP_TABLES, cmsTable]],
  );
  if (
    inventory.rows.length !== SHOP_TABLES.length + 1 ||
    new Set(inventory.rows.map((r) => r.relname)).size !== SHOP_TABLES.length + 1 ||
    inventory.rows.some((r) => r.relkind !== 'r')
  )
    throw new Error('Live probe relation inventory mismatch');
  const webshopEffects = await client.query(
    `SELECT
    (SELECT count(*)::integer FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname='public' AND c.relname=ANY($1::text[]) AND NOT t.tgisinternal) AS triggers,
    (SELECT count(*)::integer FROM pg_rewrite r JOIN pg_class c ON c.oid=r.ev_class JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname='public' AND c.relname=ANY($1::text[]) AND r.rulename <> '_RETURN') AS rules`,
    [SHOP_TABLES],
  );
  if (webshopEffects.rows[0]?.triggers !== 0 || webshopEffects.rows[0]?.rules !== 0)
    throw new Error('Live webshop probe has unreviewed statement trigger or rule');
  // Inspect all triggers, including internal ones: any extra executable path is a HOLD.
  const cmsEffects = await client.query(
    `SELECT t.tgname,t.tgenabled,t.tgtype,t.tgfoid::text AS function_oid,
      t.tgqual IS NULL AS no_when,octet_length(t.tgargs)=0 AS no_args,
      t.tgattr::text='' AS no_columns,
      t.tgoldtable IS NULL AND t.tgnewtable IS NULL AS no_transition_tables,
      t.tgparentid=0 AS no_parent_trigger,
      t.tgisinternal,t.tgconstraint=0 AS no_constraint,
      NOT t.tgdeferrable AS not_deferrable,NOT t.tginitdeferred AS not_deferred
    FROM pg_catalog.pg_trigger t WHERE t.tgrelid=$1::regclass`,
    [`public.${cmsTable}`],
  );
  const cmsRules = await client.query(
    `SELECT count(*)::integer AS n FROM pg_catalog.pg_rewrite r
    WHERE r.ev_class=$1::regclass AND r.rulename <> '_RETURN'`,
    [`public.${cmsTable}`],
  );
  const expected =
    phase === 'uninstalled'
      ? new Map<string, number>()
      : new Map([
          ['cms_writer_freeze_dml', 30],
          ['cms_writer_freeze_truncate', 34],
        ]);
  const guard = await client.query(
    `SELECT p.oid::text AS oid,p.proowner=$1::regrole::oid AS owner_ok,
      p.prosecdef,p.prosrc,p.proconfig,l.lanname,p.pronargs,
      p.prorettype='pg_catalog.trigger'::regtype::oid AS trigger_return,
      p.prokind,p.provolatile,p.proparallel,p.proleakproof,p.proisstrict,
      p.proacl IS NOT NULL AS acl_explicit,
      (SELECT count(*)::integer FROM pg_catalog.aclexplode(
        coalesce(p.proacl,pg_catalog.acldefault('f',p.proowner))) a
        WHERE a.grantee<>$1::regrole::oid) AS other_grants
    FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_language l ON l.oid=p.prolang
    WHERE p.oid=pg_catalog.to_regprocedure('cms_writer_freeze.reject_unless_cli()')`,
    [owner],
  );
  const fn = guard.rows[0];
  if (
    cmsRules.rows[0]?.n !== 0 ||
    cmsEffects.rows.length !== expected.size ||
    new Set(cmsEffects.rows.map((r) => r.tgname)).size !== expected.size ||
    cmsEffects.rows.some(
      (r) =>
        expected.get(String(r.tgname)) !== r.tgtype ||
        r.tgenabled !== 'A' ||
        r.function_oid !== fn?.oid ||
        r.no_when !== true ||
        r.no_args !== true ||
        r.no_columns !== true ||
        r.no_transition_tables !== true ||
        r.no_parent_trigger !== true ||
        r.tgisinternal !== false ||
        r.no_constraint !== true ||
        r.not_deferrable !== true ||
        r.not_deferred !== true,
    ) ||
    (phase === 'uninstalled'
      ? guard.rows.length !== 0
      : guard.rows.length !== 1 ||
        fn?.owner_ok !== true ||
        fn.prosecdef !== true ||
        fn.prosrc !== GUARD_BODY ||
        !Array.isArray(fn.proconfig) ||
        fn.proconfig.length !== 1 ||
        fn.proconfig[0] !== 'search_path=pg_catalog' ||
        fn.lanname !== 'plpgsql' ||
        fn.pronargs !== 0 ||
        fn.trigger_return !== true ||
        fn.prokind !== 'f' ||
        fn.provolatile !== 'v' ||
        fn.proparallel !== 'u' ||
        fn.proleakproof !== false ||
        fn.proisstrict !== false ||
        fn.acl_explicit !== true ||
        fn.other_grants !== 0)
  )
    throw new Error('Live CMS probe guard manifest or rule mismatch');
}
