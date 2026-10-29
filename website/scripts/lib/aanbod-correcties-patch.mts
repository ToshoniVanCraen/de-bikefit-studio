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
 *   services   the copy of the booking services; no guardian asked for on the youth
 *              services (Toshoni, 29 Oct 2026); durations (both bikefits 2 u,
 *              voetanalyse 30, zadelanalyse 60, schoenplaatjes 15 min)
 *   provider   Toshoni's offerings as Aanbieder, so his name no longer shows; or,
 *              with `providerMode: 'staging-retain'` (`--staging-retain-toshoni`,
 *              staging only, Toshoni 27 Oct 2026), he stays with every offering
 *
 * The youth package "Jeugd – volledig pakket" of that day is withdrawn (Toshoni,
 * 29 Oct 2026): never made. Package variants/unknown services block; the one
 * known Production orphan can only be soft-deactivated with an explicit flag.
 *
 * Never touched: the extra's (`cms:patch-aanbod-extras` runs BEFORE this one),
 * prices, bookings, providers themselves, users, media. The rules:
 * `aanbod-correcties-targets.mts` and `aanbod-correcties-pages.mts`; the plan:
 * `aanbod-correcties-plan.mts`. Runbook: `docs/staging-runbook.md` §25.
 *
 *   plan     read-only; every field holds the target (`=`), the value it had
 *            before (`~`), or an admin's own (`!`, which refuses the apply); the
 *            one admin's text a correction keeps, production's /aanbod subtitle
 *            of 21 Oct 2026, stays as it is (`= … kept as it is`)
 *   apply    plans first on `readOnlyDb()`: a blocked plan (or one with nothing
 *            to do) stops before any write, not even a session row; then writes
 *            a JSON backup FIRST (every row it touches), then the sections in the
 *            order above through the real repos, verifies on the public readers
 *            with a second plan and the row counts, audits an entry per entity
 *            and `patch.aanbod-correcties.apply`
 *   restore  puts every backed-up row back and removes what the apply created
 *
 * The provider mode is one value for the whole run: the dry run, the precheck,
 * the plan of the apply and the second plan of its verify are all made in it,
 * and the backup and the audit entry record it. A restore takes none.
 *
 * Idempotent: a second run finds nothing to do. Dry run: no session, no audit
 * entry, planned against `readOnlyDb()`. Writing modes load their modules (the
 * write side AND the readers the verify uses) before the first query — the
 * Neon keep-alive lesson of 20 Oct 2026 — open one short-lived admin session and
 * always revoke it.
 */
import { buildCorrectiesBackup, readCorrectiesBackup } from './aanbod-correcties-backup.mjs';
import { applyCorrecties, type CorrectiesDeps } from './aanbod-correcties-apply.mjs';
import { assertRestoreTakesNoMode, RECONCILE_PACKAGE_FLAG } from './aanbod-correcties-options.mjs';
import {
  correctiesBlockers,
  correctiesHasChanges,
  defaultInputs,
  planCorrecties,
  type CorrectiesPlan,
} from './aanbod-correcties-plan.mjs';
import { describeCountChanges, printCorrectiesPlan } from './aanbod-correcties-print.mjs';
import { preflightLegacyRestore, restoreCorrecties } from './aanbod-correcties-restore.mjs';
import { verifyCorrecties } from './aanbod-correcties-verify.mjs';
import { readWorld } from './aanbod-correcties-world.mjs';
import { STAGING_RETAIN_FLAG, type ProviderMode } from './aanbod-correcties-youth.mjs';
import { writeBackup, type PlanDeps } from './aanbod-rollout.mjs';
import {
  findActor,
  readOnlyDb,
  withAdminSession,
  type RolloutRunContext,
} from './aanbod-rollout-run.mjs';

export type AanbodCorrectiesApplyResult = { changed: boolean; backupPath: string | null };

/** Throws the refusal of a plan with blockers: every `!` line, as the dry run prints them. */
function refuseIfBlocked(plan: CorrectiesPlan): void {
  const blockers = correctiesBlockers(plan);
  if (blockers.length > 0) throw new Error(`patch refused:\n  - ${blockers.join('\n  - ')}`);
}

const NOTHING_TO_DO = 'nothing to do: the corrections of 27 Oct 2026 are already applied';

export async function applyAanbodCorrecties(
  deps: CorrectiesDeps,
  options: {
    backupDir: string;
    driver: string;
    providerMode: ProviderMode;
    reconcilePackageService?: boolean;
  },
): Promise<AanbodCorrectiesApplyResult> {
  const { log } = deps;
  const plan = planCorrecties(
    await readWorld(deps),
    defaultInputs(),
    options.providerMode,
    options.reconcilePackageService,
  );
  refuseIfBlocked(plan);
  if (!correctiesHasChanges(plan)) {
    log('=', NOTHING_TO_DO);
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
  const problems = await verifyCorrecties(deps, plan);
  if (problems.length > 0) throw new Error(`verification failed:\n  - ${problems.join('\n  - ')}`);
  log(
    '✓',
    'settings, menu, offerings, services and published pages verified on the public readers',
  );
  log(
    '✓',
    `row counts as planned (${describeCountChanges(plan.guards, plan.expected) || 'none added or removed'}); bookings and providers unchanged`,
  );
  const kept = plan.providerMode === 'staging-retain' ? plan.provider.provider : null;
  if (kept) {
    log(
      '✓',
      `provider ${kept.displayName} kept (${STAGING_RETAIN_FLAG}): in the public provider list, with every offering he had`,
    );
  }
  await deps.auth.recordAudit(deps.db, deps.actor, {
    action: 'patch.aanbod-correcties.apply',
    entityType: 'cms_rollout',
    summary: 'correcties van 27 oktober 2026',
    metadata: { backup: backupFile, providerMode: plan.providerMode, ...summary },
  });
  return { changed: true, backupPath };
}

export type AanbodCorrectiesRunOptions = {
  apply: boolean;
  restore: string | null;
  backupDir: string;
  /** Toshoni's offerings go (`remove`) or stay (`staging-retain`); one value for the whole run. */
  providerMode: ProviderMode;
  reconcilePackageService?: boolean;
};

/** The read-only mode: plan and print; no session, no audit entry, no write method on the handle. */
async function dryRun(
  deps: PlanDeps,
  providerMode: ProviderMode,
  reconcilePackageService = false,
): Promise<void> {
  const { log } = deps;
  const actor = await findActor(deps);
  log('=', `would act as ${actor.email} (no session is created in a dry run)`);
  const plan = planCorrecties(
    await readWorld(deps),
    defaultInputs(),
    providerMode,
    reconcilePackageService,
  );
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
  const { providerMode } = options;
  assertRestoreTakesNoMode(options);
  if (options.reconcilePackageService) {
    log(
      '→',
      `package reconciliation: ${RECONCILE_PACKAGE_FLAG} (exact legacy row only; soft deactivate)`,
    );
  }
  if (providerMode === 'staging-retain') {
    log(
      '→',
      'provider mode: staging retain — Toshoni stays a provider with every offering (staging only)',
    );
  }
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
    await dryRun(planDeps, providerMode, options.reconcilePackageService);
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

  // An apply that has to refuse (or has nothing to do) stops here, before ANY write:
  // planned on the read-only handle, so no session row, no backup, no audit entry.
  // The apply plans again inside its session; what changed in between is caught there.
  if (options.restore === null) {
    const precheck = planCorrecties(
      await readWorld({ ...planDeps, db: readOnlyDb(context.db) }),
      defaultInputs(),
      providerMode,
      options.reconcilePackageService,
    );
    refuseIfBlocked(precheck);
    if (!correctiesHasChanges(precheck)) {
      log('=', NOTHING_TO_DO);
      log('=', 'nothing written');
      return;
    }
  }

  const restoreBackup =
    options.restore !== null ? await readCorrectiesBackup(options.restore) : null;
  if (restoreBackup) {
    if (restoreBackup.locale !== planDeps.locale)
      throw new Error(
        `backup is for locale ${restoreBackup.locale}, database runs ${planDeps.locale}`,
      );
    await preflightLegacyRestore({ ...planDeps, db: readOnlyDb(context.db) }, restoreBackup);
  }

  await withAdminSession(context, actor.id, 'cms-patch-aanbod-correcties', async () => {
    const deps: CorrectiesDeps = { ...planDeps, ...writeSide, actor };
    if (restoreBackup) {
      await restoreCorrecties(deps, restoreBackup);
      log('✓', 'restore complete');
      return;
    }
    const result = await applyAanbodCorrecties(deps, {
      backupDir: options.backupDir,
      driver: context.driver,
      providerMode,
      reconcilePackageService: options.reconcilePackageService,
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
