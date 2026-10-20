/**
 * Toshoni's extra's of 20 Oct 2026 on an EXISTING database: voetanalyse,
 * zadelanalyse and afstellen-schoenplaatjes become extras a visitor can tick
 * when booking a bikefit (still sold alone), bikefit-tweede-fiets an extra
 * only, and both bikefits list those four. Nothing else.
 *
 *   npm run cms:patch-aanbod-extras                         # dry run (default): plan only
 *   npm run cms:patch-aanbod-extras -- --apply --expect-host <host>
 *   npm run cms:patch-aanbod-extras -- --restore <backup.json> --expect-host <host>
 *
 * Options
 *   --apply                  write: backup first, then the three extra columns
 *                            and the links; refuses an offering whose extra
 *                            settings were changed in Beheer since migration 0015
 *   --restore <file>         put a backup written by --apply back
 *   --expect-host <host>     REQUIRED for --apply/--restore against Neon: must
 *                            equal the host in DATABASE_URL
 *   --backup-dir <dir>       where --apply writes its backup
 *                            (default: .rollout-backups/, gitignored)
 *
 * Idempotent: a second run finds nothing to do. Needs migration 0015 and the
 * nine offerings (`cms:patch-aanbod-prijzen`). Logic and guarantees:
 * `scripts/lib/aanbod-extras-patch.mts`. Runbook: `docs/staging-runbook.md` §23.
 */
import { config } from 'dotenv';

import { installRequestContextStubs, cookieJar } from './lib/request-context.mjs';
import { runAanbodExtrasPatch } from './lib/aanbod-extras-patch.mjs';
import {
  assertWriteTarget,
  databaseHost,
  describeError,
  rejectUnknownOptions,
  valueOf,
} from './lib/cli-options.mjs';

config({ path: '.env.local' });
installRequestContextStubs();

function log(symbol: string, message: string) {
  console.log(`${symbol} ${message}`);
}

async function main() {
  const args = process.argv.slice(2);
  rejectUnknownOptions(args, ['--apply', '--restore', '--expect-host', '--backup-dir']);
  const options = {
    apply: args.includes('--apply'),
    restore: valueOf(args, '--restore'),
    expectHost: valueOf(args, '--expect-host'),
    backupDir: valueOf(args, '--backup-dir') ?? '.rollout-backups',
  };
  if (options.apply && options.restore) throw new Error('--apply and --restore cannot be combined');
  const writing = options.apply || options.restore !== null;

  const { getCmsDb, cmsDriver } = await import('@/db/cms');
  const driver = cmsDriver();
  const host = databaseHost();
  log('→', `driver: ${driver}${host ? ` (${host})` : ''}`);
  log(
    '→',
    options.restore
      ? `mode: restore ${options.restore}`
      : options.apply
        ? 'mode: APPLY'
        : 'mode: dry run (nothing is written)',
  );
  if (writing) assertWriteTarget(driver, host, options.expectHost);

  await runAanbodExtrasPatch(options, { db: await getCmsDb(), driver, cookieJar, log });
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('✗ aanbod extras patch failed');
    console.error(describeError(error));
    process.exit(1);
  });
