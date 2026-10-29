/**
 * Toshoni's corrections of 27 Oct 2026 on an EXISTING database — every data
 * change of that day in one guarded run (staging first, then production): the
 * studio's address and the phone number `+32 473 95 26 33` in the settings and
 * on every page, the two new settings groups, the address of the booking
 * location, the copy corrections of the pages, the offerings and the booking
 * services, the location section on `/afspraak`, the gift voucher on the home
 * page and in the menu, no guardian asked for on the youth services (29 Oct
 * 2026), the durations, and Toshoni's offerings as Aanbieder. Nothing else; a
 * package variant/unknown service blocks; the one known Production orphan needs
 * an explicit, guarded soft-deactivation flag.
 *
 *   npm run cms:patch-aanbod-correcties                         # dry run (default): plan only
 *   npm run cms:patch-aanbod-correcties -- --apply --expect-host <host> --backup-dir <dir>
 *   npm run cms:patch-aanbod-correcties -- --restore <backup.json> --expect-host <host>
 *   npm run cms:patch-aanbod-correcties -- --reconcile-prod-youth-service --expect-host <host>
 *   npm run cms:patch-aanbod-correcties -- --apply --reconcile-prod-youth-service --expect-host <host> --backup-dir <dir>
 *
 * On staging (Toshoni, 27 Oct 2026, 15:12: he stays a provider there) every run,
 * the dry runs too, carries the same two flags:
 *
 *   npm run cms:patch-aanbod-correcties -- --staging-retain-toshoni --expect-host <host>
 *   npm run cms:patch-aanbod-correcties -- --apply --staging-retain-toshoni \
 *     --expect-host <host> --backup-dir <dir>
 *
 * Options
 *   --apply                  write: backup first (every row it touches), then
 *                            the sections in order, verified on the public
 *                            readers; refuses (`!`) a field that holds neither
 *                            the old nor the new value (an admin's edit; the
 *                            one it keeps instead: production's /aanbod
 *                            subtitle of 21 Oct 2026, exactly), a
 *                            page with unpublished draft edits, Toshoni's
 *                            removal while a service would be left without a
 *                            provider, a database that holds the withdrawn
 *                            unsafe youth package state, and providers among which no
 *                            profile (or more than one) is Toshoni; a refusal
 *                            comes before any write (no session, no backup, no
 *                            audit entry)
 *   --staging-retain-toshoni STAGING ONLY: Toshoni stays a provider with every
 *                            offering (without it, the default and production's
 *                            rule, his offerings go); refused (`!`) unless the
 *                            database has exactly one provider, Toshoni, active;
 *                            takes no value; needs --expect-host on Neon for
 *                            the dry run too; not with --restore
 *   --reconcile-prod-youth-service  PRODUCTION ONLY, only after a fresh plan/GO:
 *                            deactivate exactly bikefit-nieuwe-fiets-jeugd-pakket
 *                            in place if it has the audited name and no variant
 *                            or booking/booking-block references; no deletion, no subscription
 *                            change from this reconciliation. Refuses unknown
 *                            package states. Requires --expect-host on Neon even
 *                            for the dry run; not with staging-retain or restore.
 *   --restore <file>         put a backup written by --apply back and remove
 *                            what it created
 *   --expect-host <host>     REQUIRED for --apply/--restore against Neon (and for
 *                            any run with --staging-retain-toshoni or
 *                            --reconcile-prod-youth-service): must equal
 *                            the host in DATABASE_URL
 *   --backup-dir <dir>       where --apply writes its backup
 *                            (default: .rollout-backups/, gitignored)
 *
 * Idempotent: a second run finds nothing to do. Needs migrations up to 0017,
 * the nine offerings (`cms:patch-aanbod-prijzen`) and the extra's of the
 * current rules (`cms:patch-aanbod-extras`, which runs BEFORE this one); the
 * build that contains the `location` block must be deployed first. Logic and
 * guarantees: `scripts/lib/aanbod-correcties-patch.mts`; the options:
 * `scripts/lib/aanbod-correcties-options.mts`. Runbook: `docs/staging-runbook.md` §§25–26.
 */
import { config } from 'dotenv';

import { installRequestContextStubs, cookieJar } from './lib/request-context.mjs';
import { runAanbodCorrectiesPatch } from './lib/aanbod-correcties-patch.mjs';
import {
  assertCorrectiesTarget,
  parseCorrectiesOptions,
} from './lib/aanbod-correcties-options.mjs';
import { databaseHost, describeError } from './lib/cli-options.mjs';

config({ path: '.env.local' });
installRequestContextStubs();

function log(symbol: string, message: string) {
  console.log(`${symbol} ${message}`);
}

async function main() {
  const options = parseCorrectiesOptions(process.argv.slice(2));

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
  // Before the first query: Neon needs --expect-host to write, and with the staging flag.
  assertCorrectiesTarget(options, driver, host);

  await runAanbodCorrectiesPatch(options, { db: await getCmsDb(), driver, cookieJar, log });
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('✗ aanbod correcties patch failed');
    console.error(describeError(error));
    process.exit(1);
  });
