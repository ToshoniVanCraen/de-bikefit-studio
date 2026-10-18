/**
 * Staging gate accounts (issue #18): named reviewer access to
 * staging.debikefitstudio.be, provisioned and revoked by Arend after
 * Toshoni's approval. Design: docs/staging-gate.md §3.
 *
 *   npm run staging:access -- --list
 *   npm run staging:access -- --add --identifier <e-mail or username> [--note "<who / approval>"] --expect-host <host>
 *   npm run staging:access -- --reset-password --identifier <id> --expect-host <host>
 *   npm run staging:access -- --revoke --identifier <id> --expect-host <host>
 *
 * A password is never accepted on the command line: `--add` and
 * `--reset-password` generate one, print it ONCE (hand it over privately) and
 * store only its scrypt hash; the hash is never printed. `--reset-password`
 * also ends the account's sessions; `--revoke` sets `revoked_at` on the
 * account and on every unrevoked session, so the person is out on the next
 * request. `--add` on an existing identifier (revoked or not) fails and
 * changes nothing.
 *
 * Write guard: every write to Neon needs `--expect-host` equal to the
 * DATABASE_URL host (`assertWriteTarget`). This catches an accidental mismatch
 * with an independently checked staging host; it does not prove that the URL
 * is staging if the operator supplies the wrong host in both places. Arend
 * must verify the target against the staging branch record before writes.
 * `--list` only reads. Logic: `scripts/lib/staging-access.mts`.
 */
import { config } from 'dotenv';
import {
  assertWriteTarget,
  databaseHost,
  rejectUnknownOptions,
  valueOf,
} from './lib/cli-options.mjs';
import { runStagingAccess, type StagingAccessCommand } from './lib/staging-access.mjs';

config({ path: '.env.local' });

const MODES = ['--list', '--add', '--reset-password', '--revoke'] as const;

function log(symbol: string, message: string) {
  console.log(`${symbol} ${message}`);
}

function parseCommand(args: string[]): StagingAccessCommand {
  const modes = MODES.filter((mode) => args.includes(mode));
  if (modes.length !== 1) {
    throw new Error('choose exactly one of --list, --add, --reset-password, --revoke');
  }
  const mode = modes[0];
  if (mode === '--list') return { kind: 'list' };
  const identifier = valueOf(args, '--identifier');
  if (!identifier) throw new Error('--identifier is required');
  if (mode === '--add') return { kind: 'add', identifier, note: valueOf(args, '--note') ?? '' };
  if (valueOf(args, '--note') !== null) throw new Error('--note only goes with --add');
  return mode === '--revoke'
    ? { kind: 'revoke', identifier }
    : { kind: 'reset-password', identifier };
}

async function main() {
  const args = process.argv.slice(2);
  rejectUnknownOptions(args, [...MODES, '--identifier', '--note', '--expect-host']);
  const command = parseCommand(args);

  const { getCmsDb, cmsDriver } = await import('@/db/cms');
  const driver = cmsDriver();
  const host = databaseHost();
  log('→', `driver: ${driver}${host ? ` (${host})` : ''}`);
  if (command.kind !== 'list') assertWriteTarget(driver, host, valueOf(args, '--expect-host'));

  const result = await runStagingAccess({ db: await getCmsDb(), command, log });
  if (result.password) {
    log('!', 'password (shown once, hand it over privately, never in chat or tickets):');
    console.log(result.password);
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('✗ staging access failed');
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
