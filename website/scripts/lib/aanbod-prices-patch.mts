/**
 * Core of `npm run cms:patch-aanbod-prijzen` (and self-test section 17b):
 * Toshoni's prices and durations of 20 Oct 2026 on an EXISTING database —
 * and nothing else. The values are pure data in `src/lib/offers/aanbod-prices.ts`
 * (old → new, the new ones being the defaults).
 *
 * Scope:
 *   offerings  the seven of 17 Oct 2026: duration text, contents, extras,
 *              meta description, the variant split and the price per variant,
 *              written through the real offers repo (validation, audit,
 *              cache bust); for the fit that is booked online the repo also
 *              sets the two services to 2 hours
 *   created    the two new offerings (tweede bezoek, tweede fiets) from the
 *              defaults when missing
 *   services   volwassenenfit and jeugdfit: price € 275 / € 150 shown in the
 *              widget (a direct write with its own audit entry: the offering
 *              input carries no service price)
 *
 * Never touched: other offerings, pages, menus, settings, media, users,
 * providers and their subscriptions, bookings; no row is added to or removed
 * from the booking tables (`guardCounts()` before and after; the two new
 * offerings are enquiry offerings and create no service).
 *
 *   plan     read-only; refuses (lists `!`) when a field holds neither the old
 *            nor the new value, or an offering or service is missing
 *   apply    writes a JSON backup FIRST (the seven offering rows with their
 *            variants, the two service rows), then the offerings, the new
 *            ones, the service prices; verifies with a second plan and the
 *            public catalogue; audits `patch.aanbod-prijzen.apply`
 *   restore  puts the backed-up rows back (direct writes, caches busted) and
 *            deletes the offerings the apply created
 *
 * Dry run: no session, no audit entry, planned against `readOnlyDb()`
 * (planning lives in `aanbod-prices-plan.mts`). Writing modes open one
 * short-lived admin session and always revoke it.
 */
import { z } from 'zod';

import { cmsOfferingVariants, cmsOfferings } from '@/db/cms-offering-schema';
import { OFFERING_PRICE_CHANGES, SERVICE_PRICE_CHANGES } from '@/lib/offers/aanbod-prices';
import { DEFAULT_OFFERS } from '@/lib/offers/defaults';
import type { OfferingAudience } from '@/lib/offers/offering';
import { stable, writeBackup, type PlanDeps, type RolloutDeps } from './aanbod-rollout.mjs';
import {
  findActor,
  readOnlyDb,
  withAdminSession,
  type RolloutRunContext,
} from './aanbod-rollout-run.mjs';
import {
  aanbodPricesBlockers,
  aanbodPricesHasChanges,
  guardCounts,
  planAanbodPrices,
  printAanbodPricesPlan,
  readStoredOffering,
  readStoredService,
  type AanbodPricesPlan,
  type StoredOffering,
} from './aanbod-prices-plan.mjs';

export * from './aanbod-prices-plan.mjs';

/** The offers repo on top of the rollout deps (the cms repo stays for the cache bust). */
export type PricesDeps = RolloutDeps & { offersRepo: typeof import('@/lib/offers/repo') };

const OFFERING_CACHE_TAGS = ['cms', 'cms:offerings', 'booking'];

// ---------------------------------------------------------------------------
// Backup
// ---------------------------------------------------------------------------

const rowSchema = z.record(z.string(), z.unknown());

export const aanbodPricesBackupSchema = z.object({
  kind: z.literal('aanbod-prices-backup'),
  version: z.literal(1),
  createdAt: z.string(),
  locale: z.string(),
  driver: z.string(),
  offerings: z.array(z.object({ row: rowSchema, variants: z.array(rowSchema) })),
  services: z.array(rowSchema),
  /** Slugs of the offerings the apply creates; a restore deletes them. */
  created: z.array(z.string()),
  guards: z.record(z.string(), z.unknown()),
});
export type AanbodPricesBackup = z.infer<typeof aanbodPricesBackupSchema>;

function toJson(row: object): Record<string, unknown> {
  return JSON.parse(JSON.stringify(row)) as Record<string, unknown>;
}

function buildBackup(plan: AanbodPricesPlan, driver: string): AanbodPricesBackup {
  return aanbodPricesBackupSchema.parse({
    kind: 'aanbod-prices-backup',
    version: 1,
    createdAt: new Date().toISOString(),
    locale: plan.locale,
    driver,
    offerings: plan.offerings
      .filter((entry) => entry.action === 'update' && entry.stored)
      .map((entry) => ({
        row: toJson(entry.stored!.row),
        variants: entry.stored!.variants.map(toJson),
      })),
    services: plan.services
      .filter((entry) => entry.action === 'update' && entry.stored)
      .map((entry) => toJson(entry.stored!)),
    created: plan.created.filter((entry) => entry.action === 'create').map((entry) => entry.slug),
    guards: plan.guards,
  });
}

export async function readPricesBackup(file: string): Promise<AanbodPricesBackup> {
  const { readFile } = await import('node:fs/promises');
  return aanbodPricesBackupSchema.parse(JSON.parse(await readFile(file, 'utf8')));
}

// ---------------------------------------------------------------------------
// Apply
// ---------------------------------------------------------------------------

/** The full content of a stored offering with the changed fields replaced. */
function contentFor(stored: StoredOffering, slug: string) {
  const change = OFFERING_PRICE_CHANGES.find((entry) => entry.slug === slug)!;
  const { row } = stored;
  return {
    slug: row.slug,
    category: row.category,
    sortOrder: row.sortOrder,
    title: row.title,
    summary: row.summary,
    intro: row.intro,
    goal: row.goal,
    contents: change.to.contents,
    extras: change.to.extras,
    extrasNote: row.extrasNote,
    duration: change.to.duration,
    ctaLabel: row.ctaLabel,
    image: row.image ?? undefined,
    metaDescription: change.to.metaDescription,
  };
}

/**
 * The settings to save: the new variant split and prices; a service a variant
 * already books through is kept (by id) and, for a directly booked offering,
 * its facts are passed back with the new duration so the repo updates it.
 */
async function settingsFor(deps: PlanDeps, stored: StoredOffering, slug: string) {
  const change = OFFERING_PRICE_CHANGES.find((entry) => entry.slug === slug)!;
  const direct = stored.row.bookingMode === 'direct';
  const variants = [];
  for (const target of change.to.variants) {
    const current = stored.variants.find((variant) => variant.audience === target.audience);
    const serviceId = current?.serviceId ?? null;
    let service: {
      durationMinutes: number;
      bufferAfterMinutes: number;
      locationId: string | null;
      requiresGuardian: boolean;
    } | null = null;
    if (direct && serviceId) {
      const { eq } = deps.orm;
      const [row] = await deps.db
        .select()
        .from(deps.schema.cmsServices)
        .where(eq(deps.schema.cmsServices.id, serviceId))
        .limit(1);
      if (!row)
        throw new Error(`offering ${slug}: service of variant ${target.audience} is missing`);
      const planned = SERVICE_PRICE_CHANGES.find((entry) => entry.slug === row.slug);
      service = {
        durationMinutes: planned ? planned.to.durationMinutes : row.durationMinutes,
        bufferAfterMinutes: row.bufferAfterMinutes ?? 15,
        locationId: row.locationId,
        requiresGuardian: row.requiresGuardian,
      };
    }
    variants.push({
      audience: target.audience,
      serviceId,
      priceCents: target.priceCents,
      service,
    });
  }
  return {
    isListed: stored.row.isListed,
    bookingMode: stored.row.bookingMode,
    variantMode: change.to.variantMode,
    variants,
  };
}

export type AanbodPricesApplyResult = { changed: boolean; backupPath: string | null };

export async function applyAanbodPrices(
  deps: PricesDeps,
  options: { backupDir: string; driver: string },
): Promise<AanbodPricesApplyResult> {
  const { log, locale } = deps;
  const plan = await planAanbodPrices(deps);
  const blockers = aanbodPricesBlockers(plan);
  if (blockers.length > 0) throw new Error(`patch refused:\n  - ${blockers.join('\n  - ')}`);
  if (!aanbodPricesHasChanges(plan)) {
    log('=', 'nothing to do: the prices of 20 Oct 2026 are already applied');
    return { changed: false, backupPath: null };
  }

  // 1. Backup FIRST. No backup, no write.
  const backup = buildBackup(plan, options.driver);
  const backupPath = await writeBackup(
    backup as unknown as Parameters<typeof writeBackup>[0],
    options.backupDir,
    'aanbod-prices-patch',
  );
  const backupFile = backupPath.split(/[\\/]/).pop() ?? backupPath;
  log('✓', `backup written: ${backupPath}`);

  // 2. The seven offerings, through the repo (validation, audit, cache bust).
  for (const entry of plan.offerings.filter((item) => item.action === 'update')) {
    const stored = entry.stored!;
    const result = await deps.offersRepo.updateOffering(
      stored.row.id,
      {
        content: contentFor(stored, entry.slug),
        settings: await settingsFor(deps, stored, entry.slug),
      },
      locale,
    );
    if (!result.ok) throw new Error(`offering ${entry.slug}: ${result.message}`);
    log('~', `offering ${entry.slug} — ${entry.changes.length} change(s) written`);
  }

  // 3. The two new offerings, from the defaults.
  for (const entry of plan.created.filter((item) => item.action === 'create')) {
    const offering = DEFAULT_OFFERS.find((item) => item.content.slug === entry.slug)!;
    const result = await deps.offersRepo.createOffering(
      {
        content: offering.content,
        settings: {
          isListed: offering.isListed,
          bookingMode: offering.bookingMode,
          variantMode: offering.variantMode,
          variants: offering.variants.map((variant) => ({
            audience: variant.audience,
            serviceId: null,
            priceCents: variant.priceCents,
            service: null,
          })),
        },
      },
      locale,
    );
    if (!result.ok) throw new Error(`offering ${entry.slug}: ${result.message}`);
    log('+', `offering ${entry.slug} — created`);
  }

  // 4. The widget prices of the two services (duration was set in step 2).
  for (const entry of plan.services.filter((item) => item.action === 'update')) {
    const change = SERVICE_PRICE_CHANGES.find((item) => item.slug === entry.slug)!;
    const { eq } = deps.orm;
    await deps.db
      .update(deps.schema.cmsServices)
      .set({
        durationMinutes: change.to.durationMinutes,
        priceCents: change.to.priceCents,
        showPrice: change.to.showPrice,
        updatedAt: new Date(),
      })
      .where(eq(deps.schema.cmsServices.id, entry.stored!.id));
    await deps.auth.recordAudit(deps.db, deps.actor, {
      action: 'service.update',
      entityType: 'cms_service',
      entityId: entry.stored!.id,
      summary: `${entry.slug}: ${entry.changes.join('; ')} (patch aanbod-prijzen)`,
    });
    log('~', `service ${entry.slug} — ${entry.changes.join('; ')}`);
  }
  deps.repo.revalidateContent({ tags: OFFERING_CACHE_TAGS });

  // 5. Verify, and check that nothing was added to or removed from the booking tables.
  const problems = await verifyAanbodPrices(deps);
  if (problems.length > 0) throw new Error(`verification failed:\n  - ${problems.join('\n  - ')}`);
  log('✓', 'offerings, services and the public catalogue verified');
  if (stable(await guardCounts(deps)) !== stable(plan.guards)) {
    throw new Error('a booking table gained or lost rows during the patch!');
  }
  log('✓', 'bookings, services, providers and subscriptions: no row added or removed');
  await deps.auth.recordAudit(deps.db, deps.actor, {
    action: 'patch.aanbod-prijzen.apply',
    entityType: 'cms_rollout',
    summary: 'prijzen en duur van het aanbod, 20 Oct 2026',
    metadata: {
      backup: backupFile,
      offerings: plan.offerings.filter((item) => item.action === 'update').map((item) => item.slug),
      created: backup.created,
      services: plan.services.filter((item) => item.action === 'update').map((item) => item.slug),
    },
  });
  return { changed: true, backupPath };
}

/** Invariants after an apply; an empty list means the prices are live as intended. */
export async function verifyAanbodPrices(deps: PlanDeps): Promise<string[]> {
  const plan = await planAanbodPrices(deps);
  const problems = [...aanbodPricesBlockers(plan)];
  if (aanbodPricesHasChanges(plan)) problems.push('a second plan still finds work');
  const { loadOfferCatalogue } = await import('@/lib/cms/offers-content');
  const catalogue = await loadOfferCatalogue(deps.locale);
  for (const offering of DEFAULT_OFFERS) {
    const live = catalogue.bySlug[offering.content.slug];
    if (!live) {
      problems.push(`offering ${offering.content.slug} is not in the public catalogue`);
      continue;
    }
    if (live.offer.priceLabel === 'Prijs op aanvraag') {
      problems.push(`offering ${offering.content.slug} still shows "Prijs op aanvraag"`);
    }
  }
  return problems;
}

// ---------------------------------------------------------------------------
// Restore and mode dispatch
// ---------------------------------------------------------------------------

export async function restoreAanbodPrices(deps: PricesDeps, backup: AanbodPricesBackup) {
  const { db, log } = deps;
  const { and, eq } = deps.orm;
  for (const entry of backup.offerings) {
    const row = entry.row as Record<string, unknown> & { id: string; slug: string };
    const { id } = row;
    const columns: Record<string, unknown> = { ...row };
    delete columns.id;
    delete columns.locale;
    delete columns.createdAt;
    await db
      .update(cmsOfferings)
      .set({ ...(columns as Partial<typeof cmsOfferings.$inferInsert>), updatedAt: new Date() })
      .where(eq(cmsOfferings.id, id));
    await db.delete(cmsOfferingVariants).where(eq(cmsOfferingVariants.offeringId, id));
    for (const variant of entry.variants) {
      await db.insert(cmsOfferingVariants).values({
        offeringId: id,
        audience: String(variant.audience) as OfferingAudience,
        serviceId: (variant.serviceId as string | null) ?? null,
        priceCents: (variant.priceCents as number | null) ?? null,
      });
    }
    log('~', `offering ${row.slug} — restored`);
  }
  for (const row of backup.services) {
    const service = row as Record<string, unknown> & { id: string; slug: string };
    await db
      .update(deps.schema.cmsServices)
      .set({
        durationMinutes: service.durationMinutes as number,
        priceCents: (service.priceCents as number | null) ?? null,
        showPrice: Boolean(service.showPrice),
        description: String(service.description ?? ''),
        name: String(service.name ?? ''),
        updatedAt: new Date(),
      })
      .where(eq(deps.schema.cmsServices.id, service.id));
    log('~', `service ${service.slug} — restored`);
  }
  for (const slug of backup.created) {
    const stored = await readStoredOffering(deps, slug);
    if (!stored) continue;
    await db
      .delete(cmsOfferings)
      .where(and(eq(cmsOfferings.id, stored.row.id), eq(cmsOfferings.locale, backup.locale)));
    log('-', `offering ${slug} — removed (created by the apply)`);
  }
  deps.repo.revalidateContent({ tags: OFFERING_CACHE_TAGS });
  const after = await readStoredService(deps, 'volwassenenfit');
  if (after) log('=', `volwassenenfit now ${after.durationMinutes} min`);
}

export type AanbodPricesRunOptions = { apply: boolean; restore: string | null; backupDir: string };

/** Mode dispatch of the CLI, shared with the self-test. */
export async function runAanbodPricesPatch(
  options: AanbodPricesRunOptions,
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
  // Load the write side before the first query: importing the offers repo pulls
  // in the booking content and Google's auth library, a graph tsx compiles for
  // seconds; done inside the session that pause left the first Neon request on a
  // keep-alive socket the server had closed ("fetch failed", 20 Oct 2026).
  const writeSide = writing
    ? {
        repo: await import('@/lib/cms/repo'),
        offersRepo: await import('@/lib/offers/repo'),
        auth: await import('@/lib/cms/auth'),
      }
    : null;
  const actor = await findActor(planDeps);

  if (!writing) {
    log('=', `would act as ${actor.email} (no session is created in a dry run)`);
    const plan = await planAanbodPrices(planDeps);
    printAanbodPricesPlan(plan, log);
    const blockers = aanbodPricesBlockers(plan);
    for (const blocker of blockers) log('!', blocker);
    console.log('');
    const pending = aanbodPricesHasChanges(plan);
    log(
      pending ? '→' : '=',
      blockers.length > 0
        ? 'dry run: blocked — fix the items marked ! first'
        : pending
          ? 'dry run: run again with --apply to write'
          : 'dry run: nothing to do',
    );
    return;
  }

  await withAdminSession(context, actor.id, 'cms-patch-aanbod-prijzen', async () => {
    const deps: PricesDeps = { ...planDeps, ...writeSide!, actor };
    if (options.restore !== null) {
      const backup = await readPricesBackup(options.restore);
      if (backup.locale !== deps.locale) {
        throw new Error(`backup is for locale ${backup.locale}, database runs ${deps.locale}`);
      }
      await restoreAanbodPrices(deps, backup);
      log('✓', 'restore complete');
      return;
    }
    const result = await applyAanbodPrices(deps, {
      backupDir: options.backupDir,
      driver: context.driver,
    });
    log(result.changed ? '✓' : '=', result.changed ? 'apply complete' : 'nothing written');
  });
}
