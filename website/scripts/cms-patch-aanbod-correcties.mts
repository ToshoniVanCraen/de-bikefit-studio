/**
 * Toshoni's corrections of 27 Oct 2026 on an EXISTING database — every data
 * change of that day in one guarded run (staging first, then production): the
 * studio's address and the phone number `+32 473 95 26 33` in the settings and
 * on every page, the two new settings groups, the address of the booking
 * location, the copy corrections of the pages, the offerings and the booking
 * services, the location section on `/afspraak`, the gift voucher on the home
 * page and in the menu, "Jeugd – volledig pakket" on both bikefits, the
 * durations, and Toshoni's offerings as Aanbieder. Nothing else.
 *
 *   npm run cms:patch-aanbod-correcties                         # dry run (default): plan only
 *   npm run cms:patch-aanbod-correcties -- --apply --expect-host <host> --backup-dir <dir>
 *   npm run cms:patch-aanbod-correcties -- --restore <backup.json> --expect-host <host>
 *
 * Options
 *   --apply                  write: backup first (every row it touches), then
 *                            the sections in order, verified on the public
 *                            readers; refuses (`!`) a field that holds neither
 *                            the old nor the new value (an admin's edit), a
 *                            page with unpublished draft edits, Toshoni's
 *                            removal while a service would be left without a
 *                            provider, a youth package no provider would
 *                            offer, and providers among which no profile (or
 *                            more than one) is Toshoni; a refusal comes before
 *                            any write (no session, no backup, no audit entry)
 *   --restore <file>         put a backup written by --apply back and remove
 *                            what it created
 *   --expect-host <host>     REQUIRED for --apply/--restore against Neon: must
 *                            equal the host in DATABASE_URL
 *   --backup-dir <dir>       where --apply writes its backup
 *                            (default: .rollout-backups/, gitignored)
 *
 * Idempotent: a second run finds nothing to do. Needs migrations up to 0017,
 * the nine offerings (`cms:patch-aanbod-prijzen`) and the extra's of the
 * current rules (`cms:patch-aanbod-extras`, which runs BEFORE this one); the
 * build that contains the `location` block must be deployed first. Logic and
 * guarantees: `scripts/lib/aanbod-correcties-patch.mts`. Runbook:
 * `docs/staging-runbook.md` §24.
 */
import { config } from 'dotenv';

import { installRequestContextStubs, cookieJar } from './lib/request-context.mjs';
import { runAanbodCorrectiesPatch } from './lib/aanbod-correcties-patch.mjs';
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

  await runAanbodCorrectiesPatch(options, { db: await getCmsDb(), driver, cookieJar, log });
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('✗ aanbod correcties patch failed');
    console.error(describeError(error));
    process.exit(1);
  });
