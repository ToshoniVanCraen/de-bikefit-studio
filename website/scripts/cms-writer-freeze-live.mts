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
  validateProofPasswords,
} from './lib/cms-writer-freeze-proof.mjs';
import {
  FREEZE_ACTIONS,
  type FreezeAction,
  type FreezeRoles,
} from './lib/cms-writer-freeze-sql.mjs';
import { validateOperationalHoldReceipt } from './lib/cms-writer-freeze-live-receipt.mjs';
import {
  LiveOperationError,
  runLiveGuardTransaction,
  runLiveSetupTransaction,
  safeLiveError,
  withPinnedLiveClient,
} from './lib/cms-writer-freeze-live-transactions.mjs';
import { auditLiveRoleGrants } from './lib/cms-writer-freeze-live-roles.mjs';

async function main() {
  try {
    const USAGE =
      'cms:writer-freeze:live -- <generate|generate-setup|check|setup|check-roles|execute> --environment staging|production --purpose live-ENV-writer-freeze --project-id ID --branch-id ID --branch-name NAME --endpoint-id ID --expected-host DIRECT_HOST --database DB --installer ROLE [mode-specific options]';
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
      setup: [...COMMON, ...ROLE, '--file', '--sha256', '--hold-file', '--hold-sha256'],
      'check-roles': [...COMMON, ...ROLE],
      execute: [...COMMON, '--file', '--sha256', '--hold-file', '--hold-sha256'],
    };
    if (mode === 'probe')
      throw new LiveOperationError(
        'Live probe disabled: catalog race and external effects require a new reviewed design',
      );
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

    async function privateReviewFile(path: string, limit: number): Promise<string> {
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
          stat.size > limit ||
          stat.size === 0
        )
          throw new Error(
            'Live review file must be private mode-0600 regular file with one link and within size limit',
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
      return withPinnedLiveClient(
        client,
        role,
        pins,
        () => attestNeonBranch(pins, apiKey!),
        async (_client, pid) => fn(client, pid),
      );
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
      const sql = await privateReviewFile(values['--file'], 2_000_000);
      const holdRaw = await privateReviewFile(values['--hold-file'], 16_384);
      validateReviewedLiveSetupSql(sql, values['--sha256'], names!, pins);
      validateOperationalHoldReceipt(
        holdRaw,
        values['--hold-sha256'],
        pins,
        'setup',
        values['--sha256'],
      );
      return withClient(installerUrl!, pins.installer, async (client, pid) =>
        runLiveSetupTransaction(client, {
          sql,
          hash: values['--sha256'],
          holdRaw,
          holdHash: values['--hold-sha256'],
          names: names!,
          pins,
          passwords: pw,
          pid,
        }),
      );
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

    async function execute(): Promise<string> {
      const sql = await privateReviewFile(values['--file'], 2_000_000);
      const holdRaw = await privateReviewFile(values['--hold-file'], 16_384);
      const reviewed = validateReviewedLiveSql(sql, values['--sha256'], pins);
      validateOperationalHoldReceipt(
        holdRaw,
        values['--hold-sha256'],
        pins,
        reviewed.action,
        reviewed.digest,
      );
      return withClient(installerUrl!, pins.installer, async (client, pid) =>
        runLiveGuardTransaction(client, {
          sql,
          hash: values['--sha256'],
          holdRaw,
          holdHash: values['--hold-sha256'],
          pins,
          pid,
        }),
      );
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
            : [await execute()];
    process.stdout.write(`${output.join('\n')}\n`);
  } catch (error) {
    // Only locally constructed operation errors are surfaced, never raw driver/API data.
    process.stderr.write(`${safeLiveError(error)}\n`);
    process.exitCode = 1;
  }
}

await main();
