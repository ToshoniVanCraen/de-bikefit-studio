/**
 * The options of `npm run cms:patch-aanbod-correcties` (the shell is
 * `../cms-patch-aanbod-correcties.mts`): parsed, combined and checked against the
 * target before the first query. Pure apart from the errors it throws; unit tests:
 * `./aanbod-correcties-options.test.ts`. Runbook: `docs/staging-runbook.md` §24.
 *
 * `--staging-retain-toshoni` (Toshoni, 27 Oct 2026, 15:12; staging only) keeps him
 * as a provider with every offering (`ProviderMode`,
 * `aanbod-correcties-youth.mts`). The same explicit flags bind every run of it to
 * one host: on Neon the dry run needs `--expect-host` too, equal to the
 * DATABASE_URL host as for `--apply`, so the dry run and the apply read the same
 * database. A restore takes no mode (it puts back what its backup lists), so the
 * flag is refused next to `--restore`. Whether the database is the one the flag
 * was decided for (one provider, Toshoni) is the plan's own guard, shared by the
 * dry run and the apply. No error repeats a value (`cli-options.mts`).
 */
import { STAGING_RETAIN_FLAG, type ProviderMode } from './aanbod-correcties-youth.mjs';
import {
  assertWriteTarget,
  rejectBooleanFlagValues,
  rejectPositionals,
  rejectUnknownOptions,
  valueOf,
} from './cli-options.mjs';

const BOOLEAN_FLAGS = ['--apply', STAGING_RETAIN_FLAG];
const VALUE_FLAGS = ['--restore', '--expect-host', '--backup-dir'];

export type CorrectiesCliOptions = {
  apply: boolean;
  /** The backup to put back (`--restore <file>`); null otherwise. */
  restore: string | null;
  expectHost: string | null;
  backupDir: string;
  /** `staging-retain` with `--staging-retain-toshoni`, else `remove`. */
  providerMode: ProviderMode;
};

/** A restore takes no mode: it puts back what its backup lists, whatever the apply kept. */
export function assertRestoreTakesNoMode(
  options: Pick<CorrectiesCliOptions, 'restore' | 'providerMode'>,
): void {
  if (options.restore !== null && options.providerMode !== 'remove') {
    throw new Error(
      `${STAGING_RETAIN_FLAG} and --restore cannot be combined: a restore takes no mode, it puts back what its backup lists`,
    );
  }
}

/** The options of the command line (what follows `--`); refuses what does not fit. */
export function parseCorrectiesOptions(args: string[]): CorrectiesCliOptions {
  rejectUnknownOptions(args, [...BOOLEAN_FLAGS, ...VALUE_FLAGS]);
  rejectBooleanFlagValues(args, BOOLEAN_FLAGS);
  // A word after a flag is no value of it: `--staging-retain-toshoni false` would switch it on.
  rejectPositionals(args, VALUE_FLAGS);
  const options: CorrectiesCliOptions = {
    apply: args.includes('--apply'),
    restore: valueOf(args, '--restore'),
    expectHost: valueOf(args, '--expect-host'),
    backupDir: valueOf(args, '--backup-dir') ?? '.rollout-backups',
    providerMode: args.includes(STAGING_RETAIN_FLAG) ? 'staging-retain' : 'remove',
  };
  if (options.apply && options.restore !== null) {
    throw new Error('--apply and --restore cannot be combined');
  }
  assertRestoreTakesNoMode(options);
  return options;
}

/**
 * Before the first query: a write to Neon needs `--expect-host` equal to the
 * DATABASE_URL host (`assertWriteTarget`), and so does a dry run with
 * `--staging-retain-toshoni`. PGlite (a local database, the self-test) needs none.
 */
export function assertCorrectiesTarget(
  options: Pick<CorrectiesCliOptions, 'apply' | 'restore' | 'expectHost' | 'providerMode'>,
  driver: string,
  host: string | null,
): void {
  const writing = options.apply || options.restore !== null;
  const retain = options.providerMode === 'staging-retain';
  if (retain && !writing && driver === 'neon-http' && !options.expectHost) {
    throw new Error(
      `${STAGING_RETAIN_FLAG} needs --expect-host on Neon, for the dry run too; this DATABASE_URL points at ${host}`,
    );
  }
  if (writing || retain) assertWriteTarget(driver, host, options.expectHost);
}
