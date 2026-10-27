/**
 * Core of `npm run cms:patch-aanbod-extras` (and self-test section 17c):
 * Toshoni's extra's on an EXISTING database — and nothing else. The values
 * are the defaults (`src/lib/offers/defaults.ts`):
 *
 *   extras    bikefit-tweede-fiets only: an extra only, never booked alone,
 *             with two choices the visitor picks from (zelfde type 30 min
 *             € 75, ander type 1 u € 150; `addon_options`, migration 0016)
 *   links     bikefit-nieuwe-fiets and bikefit-huidige-fiets allow that one
 *             extra (`cms_offering_addons`)
 *   analyses  voetanalyse, zadelanalyse and afstellen-schoenplaatjes are no
 *             extra: they are included in every bikefit and sold alone
 *             (Toshoni, 27 Oct 2026)
 *
 * The first version of this patch (20 Oct 2026) made the three analyses
 * extras (+30 / +60 / +15 min) and linked four extras to both bikefits, so a
 * visitor paid for them twice. Staging (20 Oct) and production (21 Oct) ran
 * it; this version moves such a database on: it unflags the three, prunes the
 * links down to tweede fiets and leaves tweede fiets with its choices as they
 * are. A database straight from migration 0015 reaches the target in one run.
 * The states and the rules: `aanbod-extras-targets.mts`; the plan and its
 * lines: `aanbod-extras-plan.mts`.
 *
 * Never touched: the copy, prices and variants of any offering, pages,
 * settings, services, providers, bookings. Only the extra columns of
 * `cms_offerings` (`is_addon`, `sold_alone`, `addon_minutes`,
 * `addon_options`) and the link table; the row counts of offerings,
 * services and bookings are checked before and after.
 *
 *   plan     read-only; refuses (`!`) when an offering is missing (run
 *            cms:patch-aanbod-prijzen first), or when its extra columns, its
 *            choices or its links hold neither the target nor a state the
 *            patch knows (fresh, or 20 Oct 2026): an edit made in Beheer
 *   apply    writes a JSON backup FIRST (the extra columns, choices and links
 *            of every offering it changes), then the columns, choices and
 *            links, verifies with a second plan and the public catalogue,
 *            audits `patch.aanbod-extras.apply`
 *   restore  puts the backed-up columns, choices and links back (the backup
 *            of the 27 Oct 2026 run returns the state of 20 Oct)
 *
 * Idempotent per group: a second run finds nothing to do.
 *
 * Dry run: no session, no audit entry, planned against `readOnlyDb()`.
 * Writing modes load their modules (the write side AND the catalogue the
 * verify reads) before the first query — the Neon lesson of 20 Oct 2026:
 * compiling that graph inside the session left the first read on a
 * keep-alive socket the server had closed — open one short-lived admin
 * session and always revoke it.
 */
import { z } from 'zod';

import { cmsOfferingAddons, cmsOfferings } from '@/db/cms-offering-schema';
import type { OfferCatalogue } from '@/lib/offers/offer-catalogue';
import {
  extrasBlockers,
  extrasHasChanges,
  guardCountsExtras,
  planAanbodExtras,
  plannedUpdates,
  printExtrasPlan,
  type ExtrasPlan,
  type PlannedUpdate,
} from './aanbod-extras-plan.mjs';
import { extrasTargets, type ExtrasTarget } from './aanbod-extras-targets.mjs';
import { writeBackup, type PlanDeps, type RolloutDeps } from './aanbod-rollout.mjs';
import {
  findActor,
  readOnlyDb,
  withAdminSession,
  type RolloutRunContext,
} from './aanbod-rollout-run.mjs';

const OFFERING_CACHE_TAGS = ['cms', 'cms:offerings', 'booking'];

// ---------------------------------------------------------------------------
// Backup
// ---------------------------------------------------------------------------

const choiceSchema = z.object({
  key: z.string(),
  label: z.string(),
  minutes: z.number().int(),
  priceCents: z.number().int(),
});

export const aanbodExtrasBackupSchema = z.object({
  kind: z.literal('aanbod-extras-backup'),
  version: z.literal(1),
  createdAt: z.string(),
  locale: z.string(),
  driver: z.string(),
  offerings: z.array(
    z.object({
      id: z.string(),
      slug: z.string(),
      isAddon: z.boolean(),
      soldAlone: z.boolean(),
      addonMinutes: z.number().int().nullable(),
      /** Absent in backups of the first (0015) run: read as no choices. */
      addonOptions: z.array(choiceSchema).default([]),
      addonIds: z.array(z.string()),
    }),
  ),
  guards: z.record(z.string(), z.unknown()),
});
export type AanbodExtrasBackup = z.infer<typeof aanbodExtrasBackupSchema>;

/**
 * The rows the apply changes, as they are now (on staging and production: the
 * state of 20 Oct 2026, with the order of their links), so `--restore` returns
 * exactly that.
 */
function buildBackup(
  plan: ExtrasPlan,
  updates: readonly PlannedUpdate[],
  driver: string,
): AanbodExtrasBackup {
  return aanbodExtrasBackupSchema.parse({
    kind: 'aanbod-extras-backup',
    version: 1,
    createdAt: new Date().toISOString(),
    locale: plan.locale,
    driver,
    offerings: updates.map(({ stored }) => ({
      id: stored.id,
      slug: stored.slug,
      isAddon: stored.isAddon,
      soldAlone: stored.soldAlone,
      addonMinutes: stored.addonMinutes,
      addonOptions: stored.addonOptions,
      addonIds: stored.addonIds,
    })),
    guards: plan.guards,
  });
}

export async function readExtrasBackup(file: string): Promise<AanbodExtrasBackup> {
  const { readFile } = await import('node:fs/promises');
  return aanbodExtrasBackupSchema.parse(JSON.parse(await readFile(file, 'utf8')));
}

// ---------------------------------------------------------------------------
// Apply, verify, restore
// ---------------------------------------------------------------------------

export type AanbodExtrasApplyResult = { changed: boolean; backupPath: string | null };

/**
 * The offering's links become exactly `addonIds`, in this order: the wanted
 * ones are upserted first, then every other one is pruned (neon-http has no
 * transactions, so a failure halfway never leaves a host without an extra it
 * keeps).
 */
async function replaceLinks(deps: RolloutDeps, offeringId: string, addonIds: readonly string[]) {
  const { and, eq, notInArray } = deps.orm;
  for (const [index, addonId] of addonIds.entries()) {
    await deps.db
      .insert(cmsOfferingAddons)
      .values({ offeringId, addonId, sortOrder: index })
      .onConflictDoUpdate({
        target: [cmsOfferingAddons.offeringId, cmsOfferingAddons.addonId],
        set: { sortOrder: index },
      });
  }
  await deps.db
    .delete(cmsOfferingAddons)
    .where(
      addonIds.length > 0
        ? and(
            eq(cmsOfferingAddons.offeringId, offeringId),
            notInArray(cmsOfferingAddons.addonId, [...addonIds]),
          )
        : eq(cmsOfferingAddons.offeringId, offeringId),
    );
}

export async function applyAanbodExtras(
  deps: RolloutDeps,
  options: { backupDir: string; driver: string },
): Promise<AanbodExtrasApplyResult> {
  const { log } = deps;
  const { eq } = deps.orm;
  const plan = await planAanbodExtras(deps);
  const blockers = extrasBlockers(plan);
  if (blockers.length > 0) throw new Error(`patch refused:\n  - ${blockers.join('\n  - ')}`);
  const updated = plannedUpdates(plan);
  if (updated.length === 0) {
    log('=', "nothing to do: the extra's are already as intended");
    return { changed: false, backupPath: null };
  }

  // 1. Backup FIRST. No backup, no write.
  const backup = buildBackup(plan, updated, options.driver);
  const backupPath = await writeBackup(
    backup as unknown as Parameters<typeof writeBackup>[0],
    options.backupDir,
    'aanbod-extras-patch',
  );
  const backupFile = backupPath.split(/[\\/]/).pop() ?? backupPath;
  log('✓', `backup written: ${backupPath}`);

  // 2. The columns, the choices and the links, one offering at a time, each audited.
  for (const entry of updated) {
    const { id } = entry.stored;
    if (entry.columns || entry.options) {
      await deps.db
        .update(cmsOfferings)
        .set({
          ...(entry.columns ?? {}),
          ...(entry.options ? { addonOptions: entry.options } : {}),
          updatedBy: deps.actor.id,
          updatedAt: new Date(),
        })
        .where(eq(cmsOfferings.id, id));
    }
    if (entry.linkIds) await replaceLinks(deps, id, entry.linkIds);
    await deps.auth.recordAudit(deps.db, deps.actor, {
      action: 'offering.update',
      entityType: 'cms_offering',
      entityId: id,
      summary: `${entry.slug}: ${entry.changes.join('; ')} (patch aanbod-extras)`,
    });
    log('~', `offering ${entry.slug} — ${entry.changes.join('; ')}`);
  }
  deps.repo.revalidateContent({ tags: OFFERING_CACHE_TAGS });

  // 3. Verify, and check that no table gained or lost rows.
  const problems = await verifyAanbodExtras(deps);
  if (problems.length > 0) throw new Error(`verification failed:\n  - ${problems.join('\n  - ')}`);
  log('✓', 'offerings and the public catalogue verified');
  const after = await guardCountsExtras(deps);
  for (const key of ['offerings', 'services', 'bookings']) {
    if (after[key] !== plan.guards[key]) {
      throw new Error(`the ${key} table gained or lost rows during the patch!`);
    }
  }
  log('✓', 'offerings, services and bookings: no row added or removed');
  await deps.auth.recordAudit(deps.db, deps.actor, {
    action: 'patch.aanbod-extras.apply',
    entityType: 'cms_rollout',
    summary: "extra's van het aanbod, 20 Oct 2026",
    metadata: { backup: backupFile, offerings: updated.map((entry) => entry.slug) },
  });
  return { changed: true, backupPath };
}

/** The option ids a host's services must offer, in order: `<slug>#<choice>` per choice, else `<slug>`. */
function expectedOptionIds(host: ExtrasTarget, targets: readonly ExtrasTarget[]): string[] {
  return host.addonSlugs.flatMap((slug) => {
    const choices = targets.find((entry) => entry.slug === slug)?.addonOptions ?? [];
    return choices.length > 0 ? choices.map((choice) => `${slug}#${choice.key}`) : [slug];
  });
}

/** What the public catalogue must show for one target, seen as a visitor sees it. */
function catalogueProblems(
  target: ExtrasTarget,
  targets: readonly ExtrasTarget[],
  catalogue: OfferCatalogue,
): string[] {
  const live = catalogue.bySlug[target.slug];
  if (!live) return [`offering ${target.slug} is not in the public catalogue`];
  const { offering } = live;
  const problems: string[] = [];
  if (offering.isAddon !== target.isAddon) {
    problems.push(`offering ${target.slug} should ${target.isAddon ? 'be' : 'not be'} an extra`);
  }
  if (!target.soldAlone && offering.status !== 'addon') {
    problems.push(`offering ${target.slug} should read as an extra only`);
  }
  if (offering.addonOptions.length !== target.addonOptions.length) {
    problems.push(
      `offering ${target.slug} has ${offering.addonOptions.length} keuzes, expected ${target.addonOptions.length}`,
    );
  }
  // A host offers exactly its extras, one option per choice, in order: for a
  // bikefit the two choices of tweede fiets and nothing else.
  if (target.addonSlugs.length === 0 || !offering.isListed) return problems;
  if (offering.bookingMode !== 'direct' || !offering.soldAlone) return problems;
  const expected = expectedOptionIds(target, targets);
  for (const variant of offering.variants) {
    if (!variant.serviceId) continue;
    const offered = (catalogue.addonsByService[variant.serviceId] ?? []).map((option) =>
      option.optionKey ? `${option.slug}#${option.optionKey}` : option.slug,
    );
    if (offered.join(',') !== expected.join(',')) {
      problems.push(
        `service of ${target.slug} (${variant.audience}) offers ${offered.join(', ') || 'nothing'}, expected ${expected.join(', ')}`,
      );
    }
  }
  return problems;
}

/** Invariants after an apply; an empty list means the extras are live as intended. */
export async function verifyAanbodExtras(deps: PlanDeps): Promise<string[]> {
  const plan = await planAanbodExtras(deps);
  const problems = [...extrasBlockers(plan)];
  if (extrasHasChanges(plan)) problems.push('a second plan still finds work');
  const { loadOfferCatalogue } = await import('@/lib/cms/offers-content');
  let catalogue = await loadOfferCatalogue(deps.locale);
  if (catalogue.offers.length === 0) {
    // The store answers a failed read with an empty catalogue (not cached):
    // one transport failure is read past, a real problem shows twice.
    await new Promise((resolve) => setTimeout(resolve, 750));
    catalogue = await loadOfferCatalogue(deps.locale);
  }
  const targets = extrasTargets();
  for (const target of targets) problems.push(...catalogueProblems(target, targets, catalogue));
  return problems;
}

export async function restoreAanbodExtras(deps: RolloutDeps, backup: AanbodExtrasBackup) {
  const { db, log } = deps;
  const { eq } = deps.orm;
  for (const entry of backup.offerings) {
    await db
      .update(cmsOfferings)
      .set({
        isAddon: entry.isAddon,
        soldAlone: entry.soldAlone,
        addonMinutes: entry.addonMinutes,
        addonOptions: entry.addonOptions,
        updatedAt: new Date(),
      })
      .where(eq(cmsOfferings.id, entry.id));
    await replaceLinks(deps, entry.id, entry.addonIds);
    log('~', `offering ${entry.slug} — restored`);
  }
  deps.repo.revalidateContent({ tags: OFFERING_CACHE_TAGS });
}

// ---------------------------------------------------------------------------
// Mode dispatch (shared with the self-test)
// ---------------------------------------------------------------------------

export type AanbodExtrasRunOptions = { apply: boolean; restore: string | null; backupDir: string };

/** The read-only mode: plan and print; no session, no audit entry, no write method on the handle. */
async function dryRun(deps: PlanDeps): Promise<void> {
  const { log } = deps;
  const actor = await findActor(deps);
  log('=', `would act as ${actor.email} (no session is created in a dry run)`);
  const plan = await planAanbodExtras(deps);
  printExtrasPlan(plan, log);
  const blockers = extrasBlockers(plan);
  for (const blocker of blockers) log('!', blocker);
  console.log('');
  const pending = extrasHasChanges(plan);
  log(
    pending ? '→' : '=',
    blockers.length > 0
      ? 'dry run: blocked — fix the items marked ! first'
      : pending
        ? 'dry run: run again with --apply to write'
        : 'dry run: nothing to do',
  );
}

export async function runAanbodExtrasPatch(
  options: AanbodExtrasRunOptions,
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

  // The write side AND the catalogue the verify reads are loaded before the
  // first query (see the header: the Neon keep-alive pause of 20 Oct 2026).
  const writeSide = { repo: await import('@/lib/cms/repo'), auth: await import('@/lib/cms/auth') };
  await import('@/lib/cms/offers-content');
  const actor = await findActor(planDeps);

  await withAdminSession(context, actor.id, 'cms-patch-aanbod-extras', async () => {
    const deps: RolloutDeps = { ...planDeps, ...writeSide, actor };
    if (options.restore !== null) {
      const backup = await readExtrasBackup(options.restore);
      if (backup.locale !== deps.locale) {
        throw new Error(`backup is for locale ${backup.locale}, database runs ${deps.locale}`);
      }
      await restoreAanbodExtras(deps, backup);
      log('✓', 'restore complete');
      return;
    }
    const result = await applyAanbodExtras(deps, {
      backupDir: options.backupDir,
      driver: context.driver,
    });
    log(result.changed ? '✓' : '=', result.changed ? 'apply complete' : 'nothing written');
  });
}
