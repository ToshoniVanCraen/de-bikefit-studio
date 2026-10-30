/** Separate live Staging/Production writer-freeze tooling. No automatic retry or live defaults. */
import { createHash } from 'node:crypto';
import { constants, writeFileSync } from 'node:fs';
import { open, realpath } from 'node:fs/promises';
import { resolve } from 'node:path';
import { neon } from '@neondatabase/serverless';
import {
  createStrictPlusClient,
  deriveRoleUrl,
  parseDirectTarget,
  type StrictPlusClient,
} from './lib/cms-writer-freeze-direct.mjs';
import {
  attestNeonBranch,
  makeLiveFreezeSql,
  makeLiveSetupSql,
  validateLivePins,
  validateReviewedLiveSql,
  validateReviewedLiveSetupSql,
  type LivePins,
} from './lib/cms-writer-freeze-live.mjs';
import {
  checkedName,
  derivePoolerUrl,
  runRollbackProbe,
  validateCmsTable,
  validateProofPasswords,
  SHOP_TABLES,
} from './lib/cms-writer-freeze-proof.mjs';
import {
  FREEZE_ACTIONS,
  type FreezeAction,
  type FreezeRoles,
} from './lib/cms-writer-freeze-sql.mjs';
import { validateIdentity } from './lib/cms-writer-freeze-runner.mjs';
import {
  auditLiveRoleGrants,
  auditLiveProbeRelations,
} from './lib/cms-writer-freeze-live-roles.mjs';

async function main() {
  try {
    const USAGE =
      'cms:writer-freeze:live -- <generate|generate-setup|check|setup|check-roles|probe|execute> --environment staging|production --purpose live-ENV-writer-freeze --project-id ID --branch-id ID --branch-name NAME --endpoint-id ID --expected-host DIRECT_HOST --database DB --installer ROLE [mode-specific options]';
    const COMMON = [
      '--environment',
      '--purpose',
      '--project-id',
      '--branch-id',
      '--branch-name',
      '--endpoint-id',
      '--expected-host',
      '--database',
      '--installer',
    ];
    const ROLE = ['--app', '--cli', '--owner'];
    const mode = process.argv[2];
    const modeOptions: Record<string, string[]> = {
      generate: [
        ...COMMON,
        ...ROLE,
        '--source-owner',
        '--trusted-platform-roles',
        '--action',
        '--out',
      ],
      'generate-setup': [...COMMON, ...ROLE, '--out'],
      check: COMMON,
      setup: [...COMMON, ...ROLE, '--file', '--sha256'],
      'check-roles': [...COMMON, ...ROLE],
      probe: [...COMMON, ...ROLE, '--phase', '--cms-table'],
      execute: [...COMMON, '--file', '--sha256'],
    };
    if (!mode || !modeOptions[mode]) throw new Error(USAGE);
    const argv = process.argv.slice(3);
    const values: Record<string, string> = {};
    while (argv.length) {
      const key = argv.shift();
      const value = argv.shift();
      if (
        !key ||
        !value ||
        value.startsWith('--') ||
        !modeOptions[mode].includes(key) ||
        key in values
      )
        throw new Error(USAGE);
      values[key] = value;
    }
    if (
      Object.keys(values).length !== modeOptions[mode].length ||
      modeOptions[mode].some((key) => !values[key])
    )
      throw new Error(USAGE);
    const pins: LivePins = {
      environment: values['--environment'] as LivePins['environment'],
      purpose: values['--purpose'],
      projectId: values['--project-id'],
      branchId: values['--branch-id'],
      branchName: values['--branch-name'],
      endpointId: values['--endpoint-id'],
      host: values['--expected-host'],
      database: values['--database'],
      installer: values['--installer'],
    };
    validateLivePins(pins);
    const names = modeOptions[mode].includes('--app')
      ? {
          app: values['--app'],
          cli: values['--cli'],
          owner: values['--owner'],
          installer: pins.installer,
        }
      : undefined;
    if (names) {
      Object.values(names).forEach(checkedName);
      if (new Set(Object.values(names)).size !== 4) throw new Error('Live roles must be distinct');
    }
    if (mode === 'generate' || mode === 'generate-setup') {
      let sql: string;
      let label: string;
      if (mode === 'generate-setup') {
        sql = makeLiveSetupSql(names!, pins);
        label = 'setup';
      } else {
        const action = values['--action'] as FreezeAction;
        if (!FREEZE_ACTIONS.includes(action)) throw new Error(USAGE);
        const trustedInput = values['--trusted-platform-roles'];
        const trusted = trustedInput === 'none' ? [] : trustedInput.split(',');
        if (trusted.includes('none')) throw new Error(USAGE);
        const roles: FreezeRoles = {
          ...names!,
          sourceOwner: values['--source-owner'],
          trustedPlatformRoles: trusted,
        };
        sql = makeLiveFreezeSql(action, roles, pins);
        label = action;
      }
      const destination = resolve(values['--out']);
      writeFileSync(destination, sql, { flag: 'wx', mode: 0o600 });
      process.stdout.write(
        `Generated live ${pins.environment} ${label} SQL: ${destination}\nSHA-256: ${createHash('sha256').update(sql).digest('hex')}\n`,
      );
      return;
    }

    const apiKey = process.env.NEON_API_KEY;
    if (!apiKey) throw new Error('Resolved NEON_API_KEY required');
    const installerUrl = process.env.DATABASE_URL;
    if (!installerUrl) throw new Error('DATABASE_URL required in process environment');
    // This read-only control-plane lookup occurs before any database connection or SQL.
    await attestNeonBranch(pins, apiKey);
    parseDirectTarget(installerUrl, pins.host, pins.database, pins.installer);

    async function privateSqlFile(path: string): Promise<string> {
      const absolute = resolve(path);
      if ((await realpath(absolute)) !== absolute)
        throw new Error('Live SQL file must not be a symlink');
      const handle = await open(absolute, constants.O_RDONLY | constants.O_NOFOLLOW);
      try {
        const stat = await handle.stat();
        if (
          !stat.isFile() ||
          (stat.mode & 0o777) !== 0o600 ||
          stat.nlink !== 1 ||
          stat.size > 2_000_000
        )
          throw new Error(
            'Live SQL file must be private mode-0600 regular file with one link and <=2 MB',
          );
        return await handle.readFile('utf8');
      } finally {
        await handle.close();
      }
    }

    async function withClient<T>(
      url: string,
      role: string,
      fn: (client: StrictPlusClient, pid: unknown) => Promise<T>,
    ): Promise<T> {
      const client = createStrictPlusClient(parseDirectTarget(url, pins.host, pins.database, role));
      let failed = false;
      client.on('error', () => {
        failed = true;
      });
      let connected = false;
      let result: T;
      try {
        await client.connectStrict();
        connected = true;
        await attestNeonBranch(pins, apiKey!);
        const identity = await client.query(
          "SELECT session_user, current_user, current_database() AS current_database, current_setting('server_version_num') AS server_version_num, pg_backend_pid() AS backend_pid",
        );
        const row = identity.rows[0];
        if (!row) throw new Error('Identity missing');
        validateIdentity(row, role, pins.database);
        if (failed) throw new Error('Transport failed');
        result = await fn(client, row.backend_pid);
      } finally {
        if (connected)
          try {
            await client.end();
          } catch {
            failed = true;
          }
        if (failed) throw new Error('Transport failed; outcome uncertain after SQL submission');
      }
      return result!;
    }

    function credentials(): { app: string; cli: string } {
      const app = process.env.CMS_FREEZE_APP_PASSWORD;
      const cli = process.env.CMS_FREEZE_CLI_PASSWORD;
      if (!app || !cli) throw new Error('APP/CLI passwords required by process injection');
      validateProofPasswords(app, cli);
      return { app, cli };
    }
    function roleUrl(role: string, password: string): string {
      return deriveRoleUrl(installerUrl!, pins.host, pins.database, role, password);
    }

    async function setup(): Promise<string> {
      const pw = credentials();
      // Static grant contract: exactly the four audited legacy webshop tables; CLI gets no non-CMS grant.
      // setupSql also checks all four ordinary/installer-owned and all CMS table-like relations ordinary/installer-owned.
      const sql = await privateSqlFile(values['--file']);
      validateReviewedLiveSetupSql(sql, values['--sha256'], names!, pins);
      return withClient(installerUrl!, pins.installer, async (client, pid) => {
        let begun = false;
        let submitted = false;
        let committed = false;
        try {
          const begin = await client.query('BEGIN');
          if (begin.command !== 'BEGIN') throw new Error('BEGIN not acknowledged');
          begun = true;
          await client.query('SET LOCAL search_path = pg_catalog, pg_temp');
          await client.query("SET LOCAL lock_timeout = '15s'");
          await client.query("SET LOCAL statement_timeout = '60s'");
          // Refuse PUBLIC DML on any audited table or CMS relation: a fresh CLI would inherit it.
          const publicAcl = await client.query(
            `SELECT count(*)::integer AS n FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
        WHERE (n.nspname='public' AND c.relname=ANY($1::text[]) OR (c.relname LIKE 'cms\\_%' ESCAPE '\\' AND n.nspname NOT LIKE 'pg\\_%' ESCAPE '\\'))
          AND c.relkind IN ('r','p','v','m','f')
          AND EXISTS (SELECT 1 FROM aclexplode(coalesce(c.relacl,acldefault('r',c.relowner))) a
            WHERE a.grantee=0 AND a.privilege_type IN ('SELECT','INSERT','UPDATE','DELETE','TRUNCATE','TRIGGER'))`,
            [SHOP_TABLES],
          );
          if (publicAcl.rows[0]?.n !== 0)
            throw new Error('PUBLIC relation privilege preflight failed');
          const settings = await client.query(
            "SELECT set_config('cms_freeze.app_password',$1,true) IS NOT NULL AS app_set, set_config('cms_freeze.cli_password',$2,true) IS NOT NULL AS cli_set",
            [pw.app, pw.cli],
          );
          if (!settings.rows[0]?.app_set || !settings.rows[0]?.cli_set)
            throw new Error('Password injection failed');
          submitted = true;
          await client.query(sql);
          const same = await client.query(
            'SELECT session_user,current_user,pg_backend_pid() AS pid',
          );
          if (
            same.rows[0]?.session_user !== pins.installer ||
            same.rows[0]?.current_user !== pins.installer ||
            same.rows[0]?.pid !== pid
          )
            throw new Error('Setup backend identity changed');
          const commit = await client.query('COMMIT');
          committed = commit.command === 'COMMIT';
          if (!committed) throw new Error('COMMIT acknowledgement missing');
          return `Live ${pins.environment} setup COMMIT confirmed: project=${pins.projectId} branch=${pins.branchId} endpoint=${pins.endpointId} database=${pins.database} backend_pid=${pid} SHA-256=${values['--sha256']}; APP grants=USAGE public + SELECT/INSERT/UPDATE/DELETE on public.${SHOP_TABLES.join(',public.')}; CLI non-CMS grants=none`;
        } catch {
          if (begun && !committed)
            try {
              await client.query('ROLLBACK');
            } catch {
              /* uncertain */
            }
          throw new Error(
            submitted
              ? 'Live setup failed or COMMIT uncertain; inspect branch state, no retry'
              : 'Live setup preflight failed; no role SQL submitted',
          );
        }
      });
    }

    async function checkRoles(): Promise<string[]> {
      const pw = credentials();
      const out: string[] = [];
      await withClient(installerUrl!, pins.installer, async (client) =>
        auditLiveRoleGrants(client, names!),
      );
      out.push(
        'Live APP/CLI role attributes, OWNER membership, four-table grants and CREATE denials audited',
      );
      for (const [kind, role, password] of [
        ['APP', names!.app, pw.app],
        ['CLI', names!.cli, pw.cli],
      ] as const) {
        const direct = roleUrl(role, password);
        const pid = await withClient(direct, role, async (_client, pid) => pid);
        const pooled = derivePoolerUrl(direct, pins.host, role);
        let rows: Record<string, unknown>[];
        await attestNeonBranch(pins, apiKey!);
        try {
          rows = await neon(
            pooled,
          )`SELECT session_user,current_user,current_database() AS current_database`;
        } catch {
          throw new Error('Pooled HTTPS identity check failed');
        }
        if (
          rows.length !== 1 ||
          rows[0].session_user !== role ||
          rows[0].current_user !== role ||
          rows[0].current_database !== pins.database
        )
          throw new Error('Pooled HTTPS identity mismatch');
        out.push(
          `${kind} identity OK: direct TLS/SCRAM-PLUS and pooled HTTPS; branch=${pins.branchId} backend_pid=${pid}`,
        );
      }
      return out;
    }

    async function probe(): Promise<string[]> {
      const pw = credentials();
      const phase = values['--phase'];
      if (!['frozen', 'unfrozen', 'uninstalled'].includes(phase)) throw new Error(USAGE);
      const table = validateCmsTable(values['--cms-table']);
      const actors =
        phase === 'unfrozen'
          ? [['app', names!.app, pw.app]]
          : [
              ['app', names!.app, pw.app],
              ['cli', names!.cli, pw.cli],
            ];
      const out: string[] = [];
      await withClient(installerUrl!, pins.installer, async (client) =>
        auditLiveProbeRelations(
          client,
          values['--cms-table'],
          phase as 'frozen' | 'unfrozen' | 'uninstalled',
        ),
      );
      for (const [actor, role, password] of actors) {
        const events = await withClient(roleUrl(role, password), role, async (client, pid) =>
          runRollbackProbe(
            client,
            role,
            pins.database,
            table,
            phase as 'frozen' | 'unfrozen' | 'uninstalled',
            pid,
            actor as 'app' | 'cli',
            names!.owner,
          ),
        );
        out.push(
          `${pins.environment} ${phase} ${actor} rollback-only probe ROLLBACK acknowledged: ${events.join(' ')}`,
        );
      }
      return out;
    }

    async function execute(): Promise<string> {
      const reviewed = validateReviewedLiveSql(
        await privateSqlFile(values['--file']),
        values['--sha256'],
        pins,
      );
      return withClient(installerUrl!, pins.installer, async (client, pid) => {
        let result: unknown;
        try {
          result = await client.query(reviewed.sql);
        } catch {
          try {
            await client.query('ROLLBACK');
          } catch {
            /* uncertain */
          }
          throw new Error(
            'Live guard SQL failed; outcome uncertain, inspect branch state, no retry',
          );
        }
        const results = Array.isArray(result) ? result : [result];
        if ((results.at(-1) as { command?: unknown })?.command !== 'COMMIT')
          throw new Error('Live guard COMMIT acknowledgement missing; outcome uncertain, no retry');
        if (reviewed.action === 'verify') {
          const row = results.find(
            (r: { rows?: Array<Record<string, unknown>> }) =>
              r.rows?.[0] && 'guarded_tables' in r.rows[0],
          )?.rows?.[0];
          if (
            !row ||
            typeof row.enabled !== 'boolean' ||
            !Number.isInteger(Number(row.guarded_tables)) ||
            Number(row.guarded_tables) < 1 ||
            row.installer_role !== pins.installer
          )
            throw new Error('Live verify result invalid; inspect branch state');
        }
        return `Live ${pins.environment} ${reviewed.action} COMMIT confirmed: project=${pins.projectId} branch=${pins.branchId} endpoint=${pins.endpointId} SHA-256=${reviewed.digest} backend_pid=${pid}`;
      });
    }

    const output =
      mode === 'check'
        ? [
            await withClient(
              installerUrl!,
              pins.installer,
              async (_client, pid) =>
                `Live identity OK: project=${pins.projectId} branch=${pins.branchId} endpoint=${pins.endpointId} host=${pins.host} database=${pins.database} installer=${pins.installer} backend_pid=${pid}`,
            ),
          ]
        : mode === 'setup'
          ? [await setup()]
          : mode === 'check-roles'
            ? await checkRoles()
            : mode === 'probe'
              ? await probe()
              : [await execute()];
    process.stdout.write(`${output.join('\n')}\n`);
  } catch (error) {
    // Never surface raw driver/API/secret-bearing errors, even during transport cleanup.
    const safe =
      error instanceof Error &&
      /^(Live (setup|guard|verify|SQL|environment|roles)|Neon control-plane|Transport failed|Pooled HTTPS|PUBLIC relation privilege|APP\/CLI passwords|DATABASE_URL required|Resolved NEON_API_KEY)/.test(
        error.message,
      )
        ? error.message
        : 'Live writer-freeze refused; inspect pinned branch state before any retry';
    process.stderr.write(`${safe}\n`);
    process.exitCode = 1;
  }
}

await main();
