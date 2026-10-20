/**
 * Toshoni's prices and durations of 20 Oct 2026 on an EXISTING database: the
 * seven offerings get their price, duration text, contents and extras, the
 * two new offerings (tweede bezoek, tweede fiets) are created, the two booking
 * services become 2 hours with their price shown. Nothing else.
 *
 *   npm run cms:patch-aanbod-prijzen                         # dry run (default): plan only
 *   npm run cms:patch-aanbod-prijzen -- --apply --expect-host <host>
 *   npm run cms:patch-aanbod-prijzen -- --restore <backup.json> --expect-host <host>
 *
 * Options
 *   --apply                  write: backup first, then the offerings (through
 *                            the repo), the new offerings, the service prices;
 *                            refuses a field an admin changed since the rollout
 *   --restore <file>         put a backup written by --apply back
 *   --expect-host <host>     REQUIRED for --apply/--restore against Neon: must
 *                            equal the host in DATABASE_URL
 *   --backup-dir <dir>       where --apply writes its backup
 *                            (default: .rollout-backups/, gitignored)
 *
 * Idempotent: a second run finds nothing to do. Logic and guarantees:
 * `scripts/lib/aanbod-prices-patch.mts`; the values: `src/lib/offers/aanbod-prices.ts`.
 * Runbook: `docs/staging-runbook.md` §22.
 */
import { config } from 'dotenv';

import { installRequestContextStubs, cookieJar } from './lib/request-context.mjs';
import { runAanbodPricesPatch } from './lib/aanbod-prices-patch.mjs';
import {
  assertWriteTarget,
  databaseHost,
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

  await runAanbodPricesPatch(options, { db: await getCmsDb(), driver, cookieJar, log });
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('✗ aanbod prices patch failed');
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
