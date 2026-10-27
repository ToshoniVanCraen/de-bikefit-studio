/**
 * Core of `npm run cms:patch-aanbod-correcties` (and self-test section 17d):
 * Toshoni's corrections of 27 Oct 2026 on an EXISTING database — every data
 * change of that day, in one guarded run, for staging first and then
 * production:
 *
 *   settings   the studio's street address and the phone number `+32 473 95 26 33`
 *              in Instellingen → Contact; the two settings groups the code gained
 *              (`business`, `rules`) with their schema defaults
 *   location   the same address on the booking location
 *   pages      the copy corrections (terms, FAQ, appointment, team, "inspanningstest"),
 *              the phone number on every page, the location section on `/afspraak`,
 *              the gift voucher on the home page, the voucher page and the card on `/aanbod`
 *   menu       "Cadeaubon" in front of "Contact"
 *   offerings  the copy of the nine offerings; the free-text price of tweede bezoek
 *   variants   "Jeugd – volledig pakket" (€ 275) on both bikefits, with its booking
 *              service and providers where the fit is booked online
 *   services   the copy of the booking services; durations (both bikefits 2 u,
 *              voetanalyse 30, zadelanalyse 60, schoenplaatjes 15 min)
 *   provider   Toshoni's offerings as Aanbieder, so his name no longer shows
 *
 * Never touched: the extra's (`cms:patch-aanbod-extras` runs BEFORE this one),
 * prices, bookings, providers themselves, users, media. The rules:
 * `aanbod-correcties-targets.mts` and `aanbod-correcties-pages.mts`; the plan:
 * `aanbod-correcties-plan.mts`. Runbook: `docs/staging-runbook.md` §24.
 *
 *   plan     read-only; every field holds the target (`=`), the value it had
 *            before (`~`), or an admin's own (`!`, which refuses the apply)
 *   apply    writes a JSON backup FIRST (every row it touches), then the
 *            sections in the order above through the real repos, verifies on
 *            the public readers with a second plan and the row counts, audits
 *            an entry per entity and `patch.aanbod-correcties.apply`
 *   restore  puts every backed-up row back and removes what the apply created
 *
 * Idempotent: a second run finds nothing to do. Dry run: no session, no audit
 * entry, planned against `readOnlyDb()`. Writing modes load their modules (the
 * write side AND the readers the verify uses) before the first query — the
 * Neon keep-alive lesson of 20 Oct 2026 — open one short-lived admin session and
 * always revoke it.
 */
import { buildCorrectiesBackup, readCorrectiesBackup } from './aanbod-correcties-backup.mjs';
import { applyCorrecties, type CorrectiesDeps } from './aanbod-correcties-apply.mjs';
import {
  correctiesBlockers,
  correctiesHasChanges,
  planCorrecties,
} from './aanbod-correcties-plan.mjs';
import { describeCountChanges, printCorrectiesPlan } from './aanbod-correcties-print.mjs';
import { restoreCorrecties } from './aanbod-correcties-restore.mjs';
import { verifyCorrecties } from './aanbod-correcties-verify.mjs';
import { readWorld } from './aanbod-correcties-world.mjs';
import { writeBackup, type PlanDeps } from './aanbod-rollout.mjs';
import {
  findActor,
  readOnlyDb,
  withAdminSession,
  type RolloutRunContext,
} from './aanbod-rollout-run.mjs';

export type AanbodCorrectiesApplyResult = { changed: boolean; backupPath: string | null };

export async function applyAanbodCorrecties(
  deps: CorrectiesDeps,
  options: { backupDir: string; driver: string },
): Promise<AanbodCorrectiesApplyResult> {
  const { log } = deps;
  const plan = planCorrecties(await readWorld(deps));
  const blockers = correctiesBlockers(plan);
  if (blockers.length > 0) throw new Error(`patch refused:\n  - ${blockers.join('\n  - ')}`);
  if (!correctiesHasChanges(plan)) {
    log('=', 'nothing to do: the corrections of 27 Oct 2026 are already applied');
    return { changed: false, backupPath: null };
  }

  // 1. Backup FIRST. No backup, no write.
  const backupPath = await writeBackup(
    buildCorrectiesBackup(plan, options.driver) as unknown as Parameters<typeof writeBackup>[0],
    options.backupDir,
    'aanbod-correcties-patch',
  );
  const backupFile = backupPath.split(/[\\/]/).pop() ?? backupPath;
  log('✓', `backup written: ${backupPath}`);

  // 2. The sections, in order.
  const summary = await applyCorrecties(deps, plan);

  // 3. Verify on what visitors get, and that the tables moved by exactly the plan.
  const problems = await verifyCorrecties(deps, plan.expected);
  if (problems.length > 0) throw new Error(`verification failed:\n  - ${problems.join('\n  - ')}`);
  log(
    '✓',
    'settings, menu, offerings, services and published pages verified on the public readers',
  );
  log(
    '✓',
    `row counts as planned (${describeCountChanges(plan.guards, plan.expected) || 'none added or removed'}); bookings and providers unchanged`,
  );
  await deps.auth.recordAudit(deps.db, deps.actor, {
    action: 'patch.aanbod-correcties.apply',
    entityType: 'cms_rollout',
    summary: 'correcties van 27 oktober 2026',
    metadata: { backup: backupFile, ...summary },
  });
  return { changed: true, backupPath };
}

export type AanbodCorrectiesRunOptions = {
  apply: boolean;
  restore: string | null;
  backupDir: string;
};

/** The read-only mode: plan and print; no session, no audit entry, no write method on the handle. */
async function dryRun(deps: PlanDeps): Promise<void> {
  const { log } = deps;
  const actor = await findActor(deps);
  log('=', `would act as ${actor.email} (no session is created in a dry run)`);
  const plan = planCorrecties(await readWorld(deps));
  printCorrectiesPlan(plan, log);
  const blockers = correctiesBlockers(plan);
  for (const blocker of blockers) log('!', blocker);
  console.log('');
  const pending = correctiesHasChanges(plan);
  log(
    pending ? '→' : '=',
    blockers.length > 0
      ? 'dry run: blocked — fix the items marked ! first'
      : pending
        ? 'dry run: run again with --apply to write'
        : 'dry run: nothing to do',
  );
}

/** Mode dispatch of the CLI, shared with the self-test. */
export async function runAanbodCorrectiesPatch(
  options: AanbodCorrectiesRunOptions,
  context: RolloutRunContext,
): Promise<void> {
  const { log } = context;
  const writing = options.apply || options.restore !== null;
  const schema = await import('@/db/cms-schema');
  const planDeps: PlanDeps = {
    db: writing ? context.db : readOnlyDb(context.db),
    orm: await import('drizzle-orm'),
    schema,
    blocks: await import('@/lib/cms/blocks'),
    locale: schema.DEFAULT_LOCALE,
    log,
  };
  if (!writing) {
    await dryRun(planDeps);
    return;
  }

  // The write side AND the readers the verify uses are loaded before the first
  // query (see the header: the Neon keep-alive pause of 20 Oct 2026).
  const writeSide = {
    repo: await import('@/lib/cms/repo'),
    auth: await import('@/lib/cms/auth'),
    bookingRepo: await import('@/lib/booking/repo'),
  };
  await import('@/lib/cms/offers-content');
  await import('@/lib/cms/content');
  await import('@/lib/booking/content');
  const actor = await findActor(planDeps);

  await withAdminSession(context, actor.id, 'cms-patch-aanbod-correcties', async () => {
    const deps: CorrectiesDeps = { ...planDeps, ...writeSide, actor };
    if (options.restore !== null) {
      await restoreCorrecties(deps, await readCorrectiesBackup(options.restore));
      log('✓', 'restore complete');
      return;
    }
    const result = await applyAanbodCorrecties(deps, {
      backupDir: options.backupDir,
      driver: context.driver,
    });
    log(result.changed ? '✓' : '=', result.changed ? 'apply complete' : 'nothing written');
    if (result.changed) {
      log(
        '→',
        'deployed sites pick this up within 5 minutes (cache fallback); the provider list too',
      );
    }
  });
}
