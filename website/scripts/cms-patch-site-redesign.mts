/**
 * The redesign of 24 Nov 2026 on an EXISTING database (staging first, then production on
 * Toshoni's go): the eight public pages get the sections, photographs and block types of the new
 * design, exactly as a fresh `cms:seed` writes them, and the nine offerings their photograph.
 * Menus, settings, services, providers and bookings are not touched.
 *
 *   npm run cms:patch-site-redesign                         # dry run (default): plan only
 *   npm run cms:patch-site-redesign -- --apply --expect-host <host> --backup-dir <dir>
 *   npm run cms:patch-site-redesign -- --restore <backup.json> --expect-host <host>
 *
 * Options
 *   --apply                write: backup first (every page and offering it touches), then the
 *                          pages and offerings, verified on the public readers; refuses (`!`)
 *                          a block or field that holds neither the old nor the new value (an
 *                          editor's change), a page with unpublished draft edits, a page that
 *                          is missing or not published; a refusal comes before any write (no
 *                          session, no backup, no audit entry)
 *   --restore <file>       put a backup written by --apply back
 *   --expect-host <host>   REQUIRED for --apply/--restore against Neon: must equal the host in
 *                          DATABASE_URL
 *   --backup-dir <dir>     where --apply writes its backup (default: .rollout-backups/, gitignored)
 *
 * ORDER: deploy the build of the redesign FIRST (the old code reads a published page with an
 * unknown block type as unpublished: the page would go dark), then this patch. Between the two
 * the old content renders in the new look. No migration. Idempotent: a second run finds nothing
 * to do. Logic: `scripts/lib/site-redesign-patch.mts`. Runbook: `docs/staging-runbook.md` §27.
 */
import { config } from 'dotenv';

import { installRequestContextStubs, cookieJar } from './lib/request-context.mjs';
import { runSiteRedesignPatch } from './lib/site-redesign-patch.mjs';
import {
  assertWriteTarget,
  databaseHost,
  describeError,
  rejectBooleanFlagValues,
  rejectPositionals,
  rejectUnknownOptions,
  valueOf,
} from './lib/cli-options.mjs';

config({ path: '.env.local' });
installRequestContextStubs();

const BOOLEAN_FLAGS = ['--apply'];
const VALUE_FLAGS = ['--restore', '--expect-host', '--backup-dir'];

function log(symbol: string, message: string) {
  console.log(`${symbol} ${message}`);
}

async function main() {
  const args = process.argv.slice(2);
  rejectUnknownOptions(args, [...BOOLEAN_FLAGS, ...VALUE_FLAGS]);
  rejectBooleanFlagValues(args, BOOLEAN_FLAGS);
  rejectPositionals(args, VALUE_FLAGS);
  const apply = args.includes('--apply');
  const restore = valueOf(args, '--restore');
  if (apply && restore !== null) throw new Error('--apply and --restore cannot be combined');

  const { getCmsDb, cmsDriver } = await import('@/db/cms');
  const driver = cmsDriver();
  const host = databaseHost();
  log('→', `driver: ${driver}${host ? ` (${host})` : ''}`);
  log(
    '→',
    restore
      ? `mode: restore ${restore}`
      : apply
        ? 'mode: APPLY'
        : 'mode: dry run (nothing is written)',
  );
  // Before the first query: a write to Neon needs --expect-host equal to the DATABASE_URL host.
  if (apply || restore !== null) assertWriteTarget(driver, host, valueOf(args, '--expect-host'));

  await runSiteRedesignPatch(
    { apply, restore, backupDir: valueOf(args, '--backup-dir') ?? '.rollout-backups' },
    { db: await getCmsDb(), driver, cookieJar, log },
  );
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('✗ site redesign patch failed');
    console.error(describeError(error));
    process.exit(1);
  });
