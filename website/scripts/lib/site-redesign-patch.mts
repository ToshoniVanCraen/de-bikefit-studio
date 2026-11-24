/**
 * Core of `npm run cms:patch-site-redesign` (and of self-test section 17e): the redesign of
 * 24 Nov 2026 on an EXISTING database (staging first, production on the owner's go). It brings
 * the eight public pages from the state of 31 Oct 2026 to the seeds of the redesign, block for
 * block, and gives the nine offerings their photograph:
 *
 *   pages      `/`, `/aanbod`, `/voor-wie`, `/bikefit`, `/ons-team`, `/veelgestelde-vragen`,
 *              `/cadeaubon`, `/afspraak`: the new sections inserted at their place, photographs
 *              and the design's variants on the blocks that stay, three blocks that change type
 *              converted, the FAQ grouped with the beginners' questions; published last
 *   offerings  `image` to the photograph of its page, only where it is a generated default or
 *              empty (an editor's photo stays)
 *
 * Never touched: menus, settings, services, providers, bookings, media, users, other pages. The
 * rules: `src/lib/studio/seed-content/site-redesign.ts`; the plan: `site-redesign-plan.mts`.
 * Runbook: `docs/staging-runbook.md` §27. THE BUILD WITH THE NEW BLOCK TYPES MUST BE LIVE FIRST:
 * the old code reads a published page with an unknown block type as unpublished.
 *
 *   plan     read-only; every block and field holds the target (`=`), the value it had before
 *            (`~`), or an editor's own (`!`, which refuses the apply)
 *   apply    plans first on `readOnlyDb()`: a blocked plan (or one with nothing to do) stops
 *            before any write, not even a session row; then the JSON backup FIRST, then the
 *            pages and offerings through the real repos, verified on the public readers with a
 *            second plan and the row counts, audited as `patch.site-redesign.apply`
 *   restore  puts every backed-up page and offering image back
 *
 * Idempotent: a second run finds nothing to do. Writing modes load the write side AND the readers
 * the verify uses before the first query (the Neon keep-alive lesson of 20 Oct 2026), open one
 * short-lived admin session and always revoke it.
 */
import {
  findActor,
  readOnlyDb,
  withAdminSession,
  type RolloutRunContext,
} from './aanbod-rollout-run.mjs';
import { writeBackup, type PlanDeps, type RolloutDeps } from './aanbod-rollout.mjs';
import {
  applyRedesign,
  buildRedesignBackup,
  readRedesignBackup,
  restoreRedesign,
} from './site-redesign-apply.mjs';
import {
  planRedesign,
  printRedesignPlan,
  redesignBlockers,
  redesignHasChanges,
  type RedesignPlan,
} from './site-redesign-plan.mjs';
import { verifyRedesign } from './site-redesign-verify.mjs';
import { describeCountChanges, describeCounts, readRedesignWorld } from './site-redesign-world.mjs';

export type RedesignRunOptions = { apply: boolean; restore: string | null; backupDir: string };

const NOTHING_TO_DO = 'nothing to do: the redesign of 24 Nov 2026 is already applied';

function refuseIfBlocked(plan: RedesignPlan): void {
  const blockers = redesignBlockers(plan);
  if (blockers.length > 0) throw new Error(`patch refused:\n  - ${blockers.join('\n  - ')}`);
}

function printGuards(plan: RedesignPlan, log: PlanDeps['log']) {
  log('=', `guards: ${describeCounts(plan.guards)}`);
  const moves = describeCountChanges(plan.guards, plan.expected);
  if (moves) log('→', `after the apply: ${moves}`);
}

/** The read-only mode: plan and print; no session, no audit entry, no write method on the handle. */
async function dryRun(deps: PlanDeps): Promise<void> {
  const { log } = deps;
  const actor = await findActor(deps);
  log('=', `would act as ${actor.email} (no session is created in a dry run)`);
  const plan = planRedesign(await readRedesignWorld(deps));
  printRedesignPlan(plan, log);
  printGuards(plan, log);
  const blockers = redesignBlockers(plan);
  for (const blocker of blockers) log('!', blocker);
  console.log('');
  const pending = redesignHasChanges(plan);
  log(
    pending ? '→' : '=',
    blockers.length > 0
      ? 'dry run: blocked — fix the items marked ! first'
      : pending
        ? 'dry run: run again with --apply to write'
        : 'dry run: nothing to do',
  );
}

async function applySiteRedesign(
  deps: RolloutDeps,
  options: { backupDir: string; driver: string },
): Promise<{ changed: boolean; backupPath: string | null }> {
  const { log } = deps;
  const plan = planRedesign(await readRedesignWorld(deps));
  refuseIfBlocked(plan);
  if (!redesignHasChanges(plan)) {
    log('=', NOTHING_TO_DO);
    return { changed: false, backupPath: null };
  }

  // 1. Backup FIRST. No backup, no write.
  const backupPath = await writeBackup(
    buildRedesignBackup(plan, options.driver) as unknown as Parameters<typeof writeBackup>[0],
    options.backupDir,
    'site-redesign-patch',
  );
  log('✓', `backup written: ${backupPath}`);

  // 2. Pages, then offerings.
  const summary = await applyRedesign(deps, plan);

  // 3. Verify on what visitors get, and that the tables moved by exactly the plan.
  const problems = await verifyRedesign(deps, plan);
  if (problems.length > 0) throw new Error(`verification failed:\n  - ${problems.join('\n  - ')}`);
  log('✓', 'published pages and offer photographs verified on the public readers');
  log(
    '✓',
    `row counts as planned (${describeCountChanges(plan.guards, plan.expected) || 'none added or removed'}); pages, offerings, menus, settings, services, providers and bookings unchanged`,
  );
  await deps.auth.recordAudit(deps.db, deps.actor, {
    action: 'patch.site-redesign.apply',
    entityType: 'cms_rollout',
    summary: 'redesign van 24 november 2026',
    metadata: { backup: backupPath.split(/[\\/]/).pop() ?? backupPath, ...summary },
  });
  return { changed: true, backupPath };
}

/** Mode dispatch of the CLI, shared with the self-test. */
export async function runSiteRedesignPatch(
  options: RedesignRunOptions,
  context: RolloutRunContext,
): Promise<void> {
  const { log } = context;
  if (options.apply && options.restore !== null) {
    throw new Error('--apply and --restore cannot be combined');
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
    await dryRun(planDeps);
    return;
  }

  // The write side AND the readers the verify uses, before the first query.
  const writeSide = {
    repo: await import('@/lib/cms/repo'),
    auth: await import('@/lib/cms/auth'),
  };
  await import('@/lib/cms/content');
  await import('@/lib/cms/offers-content');
  const actor = await findActor(planDeps);

  // A refusal (or nothing to do) stops here, before ANY write: no session, no backup, no audit.
  if (options.restore === null) {
    const precheck = planRedesign(
      await readRedesignWorld({ ...planDeps, db: readOnlyDb(context.db) }),
    );
    refuseIfBlocked(precheck);
    if (!redesignHasChanges(precheck)) {
      log('=', NOTHING_TO_DO);
      log('=', 'nothing written');
      return;
    }
  }
  const backup = options.restore !== null ? await readRedesignBackup(options.restore) : null;
  if (backup && backup.locale !== planDeps.locale) {
    throw new Error(`backup is for locale ${backup.locale}, database runs ${planDeps.locale}`);
  }

  await withAdminSession(context, actor.id, 'cms-patch-site-redesign', async () => {
    const deps: RolloutDeps = { ...planDeps, ...writeSide, actor };
    if (backup) {
      await restoreRedesign(deps, backup);
      log('✓', 'restore complete');
      return;
    }
    const result = await applySiteRedesign(deps, {
      backupDir: options.backupDir,
      driver: context.driver,
    });
    log(result.changed ? '✓' : '=', result.changed ? 'apply complete' : 'nothing written');
    if (result.changed) {
      log('→', 'deployed sites pick this up within 5 minutes (cache fallback)');
    }
  });
}
