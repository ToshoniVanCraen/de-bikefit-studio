/**
 * Staging gate accounts (issue #18): named reviewer access to
 * staging.debikefitstudio.be, provisioned and revoked by Arend after
 * Toshoni's approval. Design: docs/staging-gate.md §3.
 *
 *   npm run staging:access -- --list
 *   <secret store> | npm run staging:access -- --add --identifier <e-mail or username> [--note "<who / approval>"] --expect-host <host> --password-stdin
 *   <secret store> | npm run staging:access -- --reset-password --identifier <id> --expect-host <host> --password-stdin
 *   npm run staging:access -- --revoke --identifier <id> --expect-host <host>
 *
 *   fallback (no vault item yet, e.g. locally): --add / --reset-password without
 *   --password-stdin generate a password and print it ONCE.
 *
 * Vault-first is the staging handoff: the password is created in the
 * reviewer's vault item first and piped in, e.g.
 * `op read 'op://<vault>/<item>/password' | npm run staging:access -- … --password-stdin`
 * (runbook §20). It is never accepted on the command line or from an
 * environment variable: `--password-stdin` refuses a terminal, reads at most
 * `PASSWORD_STDIN_MAX_BYTES` (802) of stdin, strips one trailing newline,
 * applies the CMS strength rules (`src/lib/staging-gate/password-stdin.ts`),
 * all before any database work, and the password is then never printed,
 * logged or returned. Without the flag a generated password is printed once
 * (hand it over privately). Only the scrypt hash is stored; it is never
 * printed. Every refusal is a fixed message: no argument value and no byte of
 * stdin is ever repeated, and stray arguments are refused by position.
 * `--reset-password` also ends the account's sessions; `--revoke` sets
 * `revoked_at` on the account and on every unrevoked session, so the person
 * is out on the next request. `--add` on an existing identifier (revoked or
 * not) fails and changes nothing.
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
  PASSWORD_STDIN_TTY_REFUSAL,
  passwordStdinSourceAllowed,
  readProvidedPassword,
} from '@/lib/staging-gate/password-stdin';
import {
  assertWriteTarget,
  databaseHost,
  rejectBooleanFlagValues,
  rejectPositionals,
  rejectUnknownOptions,
  valueOf,
} from './lib/cli-options.mjs';
import { runStagingAccess, type StagingAccessCommand } from './lib/staging-access.mjs';

config({ path: '.env.local' });

const MODES = ['--list', '--add', '--reset-password', '--revoke'] as const;
const PASSWORD_STDIN = '--password-stdin';
/** Options without a value (`--flag=value` is refused). */
const FLAGS = [...MODES, PASSWORD_STDIN];
/** Options that take the next argument as their value. */
const VALUE_OPTIONS = ['--identifier', '--note', '--expect-host'];

function log(symbol: string, message: string) {
  console.log(`${symbol} ${message}`);
}

function parseCommand(args: string[]): StagingAccessCommand {
  const modes = MODES.filter((mode) => args.includes(mode));
  if (modes.length !== 1) {
    throw new Error('choose exactly one of --list, --add, --reset-password, --revoke');
  }
  const mode = modes[0];
  if (args.includes(PASSWORD_STDIN) && mode !== '--add' && mode !== '--reset-password') {
    throw new Error('--password-stdin only goes with --add or --reset-password');
  }
  if (mode === '--list') return { kind: 'list' };
  const identifier = valueOf(args, '--identifier');
  if (!identifier) throw new Error('--identifier is required');
  if (mode === '--add') return { kind: 'add', identifier, note: valueOf(args, '--note') ?? '' };
  if (valueOf(args, '--note') !== null) throw new Error('--note only goes with --add');
  return mode === '--revoke'
    ? { kind: 'revoke', identifier }
    : { kind: 'reset-password', identifier };
}

/** The vault-first password from stdin; every refusal is a fixed message without any input. */
async function passwordFromStdin(): Promise<string> {
  if (!passwordStdinSourceAllowed(process.stdin.isTTY)) throw new Error(PASSWORD_STDIN_TTY_REFUSAL);
  const provided = await readProvidedPassword(process.stdin);
  if (!provided.ok) throw new Error(provided.message);
  return provided.password;
}

async function main() {
  const args = process.argv.slice(2);
  rejectUnknownOptions(args, [...FLAGS, ...VALUE_OPTIONS]);
  rejectBooleanFlagValues(args, FLAGS);
  rejectPositionals(args, VALUE_OPTIONS);
  const command = parseCommand(args);
  const { getCmsDb, cmsDriver } = await import('@/db/cms');
  const driver = cmsDriver();
  const host = databaseHost();
  if (command.kind !== 'list') assertWriteTarget(driver, host, valueOf(args, '--expect-host'));

  // Refuse a wrong write target before consuming the vault password. No
  // connection/query has been opened yet; invalid stdin also fails before DB work.
  const fromStdin = args.includes(PASSWORD_STDIN);
  if (fromStdin && (command.kind === 'add' || command.kind === 'reset-password')) {
    command.password = await passwordFromStdin();
  }

  log('→', `driver: ${driver}${host ? ` (${host})` : ''}`);
  const result = await runStagingAccess({ db: await getCmsDb(), command, log });
  // A provided password is never printed (the core does not return it either).
  if (!fromStdin && result.password) {
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
