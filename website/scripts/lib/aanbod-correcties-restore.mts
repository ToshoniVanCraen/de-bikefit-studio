/**
 * `npm run cms:patch-aanbod-correcties --restore <backup>`: puts back every row
 * the apply touched and removes what it created. The backup is read by zod
 * (`aanbod-correcties-backup.mts`). Order, the reverse of the apply where it
 * matters: the pages (row, draft blocks and with them the published snapshot,
 * through the rollout restore), the menu, Toshoni's offerings, the variant
 * row and the package service, the services' columns, the offerings' columns,
 * the location, the settings.
 *
 * Direct writes where a repo function would add its own rules: a created row is
 * deleted, a changed column is put back. A package service that bookings
 * already point at is not deleted (the bookings keep their service): it is
 * switched off and the variant stops pointing at it.
 */
import { cmsOfferingVariants, cmsOfferings } from '@/db/cms-offering-schema';
import type { SiteSettingKey } from '@/lib/cms/blocks';
import type { AanbodCorrectiesBackup } from './aanbod-correcties-backup.mjs';
import { must, OFFERING_CACHE_TAGS, type CorrectiesDeps } from './aanbod-correcties-apply.mjs';
import { restoreAanbodRollout, type RolloutBackup } from './aanbod-rollout.mjs';

type Dict = Record<string, unknown>;

/** The pages and the menu in the shape `restoreAanbodRollout` takes. */
function rolloutBackupOf(backup: AanbodCorrectiesBackup): RolloutBackup {
  return {
    kind: 'aanbod-rollout-backup',
    version: 1,
    createdAt: backup.createdAt,
    locale: backup.locale,
    driver: backup.driver,
    pages: backup.pages,
    menus: backup.menu ? [{ key: 'main', items: backup.menu.items }] : [],
    redirects: [],
    created: { pageSlugs: [], redirectPaths: [] },
    guards: backup.guards,
  };
}

async function restoreSubscriptions(deps: CorrectiesDeps, backup: AanbodCorrectiesBackup) {
  const { and, eq } = deps.orm;
  const table = deps.schema.cmsProviderServices;
  const { providerId, removed, created } = backup.subscriptions;
  if (providerId && removed.length > 0) {
    // What he offers now (normally nothing) plus what was removed.
    const now = await deps.db
      .select({ serviceId: table.serviceId, locationId: table.locationId })
      .from(table)
      .where(eq(table.providerId, providerId));
    const back = new Map(now.map((row) => [row.serviceId, row.locationId]));
    for (const row of removed) back.set(row.serviceId, row.locationId);
    must(
      'provider offerings',
      await deps.bookingRepo.setProviderServices(
        providerId,
        [...back].map(([serviceId, locationId]) => ({ serviceId, locationId })),
      ),
    );
    deps.log('~', `provider ${providerId} — ${removed.length} offering(s) back`);
  }
  for (const row of created) {
    await deps.db
      .delete(table)
      .where(and(eq(table.providerId, row.providerId), eq(table.serviceId, row.serviceId)));
  }
}

async function restoreVariantsAndServices(deps: CorrectiesDeps, backup: AanbodCorrectiesBackup) {
  const { and, eq, inArray } = deps.orm;
  const services = deps.schema.cmsServices;
  const createdSlugs = backup.services.created.map((entry) => entry.slug);
  const created =
    createdSlugs.length > 0
      ? await deps.db
          .select({ id: services.id, slug: services.slug })
          .from(services)
          .where(and(eq(services.locale, deps.locale), inArray(services.slug, createdSlugs)))
      : [];

  // The variant row first: it points at the service.
  for (const variant of backup.variants) {
    const where = and(
      eq(cmsOfferingVariants.offeringId, variant.offeringId),
      eq(cmsOfferingVariants.audience, variant.audience),
    );
    if (variant.existed) {
      await deps.db
        .update(cmsOfferingVariants)
        .set({ serviceId: variant.serviceId, priceCents: variant.priceCents })
        .where(where);
    } else {
      await deps.db.delete(cmsOfferingVariants).where(where);
    }
    deps.log(
      '~',
      `variant ${variant.audience} of ${variant.offeringId} — ${variant.existed ? 'as it was' : 'removed'}`,
    );
  }

  // The created service, with its subscriptions (cascade), unless a booking uses it.
  for (const service of created) {
    const used = await deps.db
      .select({ id: deps.schema.cmsBookings.id })
      .from(deps.schema.cmsBookings)
      .where(eq(deps.schema.cmsBookings.serviceId, service.id))
      .limit(1);
    if (used.length > 0) {
      await deps.db
        .update(services)
        .set({ isActive: false, updatedAt: new Date() })
        .where(eq(services.id, service.id));
      deps.log('!', `service ${service.slug} has bookings: switched off, not deleted`);
    } else {
      await deps.db.delete(services).where(eq(services.id, service.id));
      deps.log('-', `service ${service.slug} — removed (created by the apply)`);
    }
  }

  // The changed columns of the services that existed.
  for (const entry of backup.services.updated) {
    const values: Dict = {};
    for (const field of entry.fields) values[field] = entry.row[field];
    must(
      `service ${entry.slug}`,
      await deps.bookingRepo.updateService(
        entry.id,
        values as Parameters<typeof deps.bookingRepo.updateService>[1],
      ),
    );
    deps.log('~', `service ${entry.slug} — ${entry.fields.join(', ')} restored`);
  }
}

export async function restoreCorrecties(
  deps: CorrectiesDeps,
  backup: AanbodCorrectiesBackup,
): Promise<void> {
  const { and, eq } = deps.orm;
  const { log } = deps;
  if (backup.locale !== deps.locale) {
    throw new Error(`backup is for locale ${backup.locale}, database runs ${deps.locale}`);
  }

  // Pages and menu: the rollout restore (row, draft blocks and snapshot as they were, audited).
  if (backup.pages.length > 0 || backup.menu)
    await restoreAanbodRollout(deps, rolloutBackupOf(backup));

  await restoreSubscriptions(deps, backup);
  await restoreVariantsAndServices(deps, backup);

  for (const entry of backup.offerings) {
    const values: Dict = {};
    for (const field of entry.fields) values[field] = entry.row[field];
    await deps.db
      .update(cmsOfferings)
      .set({ ...(values as Partial<typeof cmsOfferings.$inferInsert>), updatedAt: new Date() })
      .where(eq(cmsOfferings.id, entry.id));
    log('~', `offering ${entry.slug} — ${entry.fields.join(', ')} restored`);
  }

  if (backup.location) {
    const { id, ...address } = backup.location;
    must('location', await deps.bookingRepo.updateLocation(id, address));
    log('~', 'location — address restored');
  }

  for (const setting of backup.settings) {
    if (setting.existed) {
      must(
        `setting ${setting.key}`,
        await deps.repo.updateSiteSetting(
          deps.locale,
          setting.key as SiteSettingKey,
          setting.value,
        ),
      );
    } else {
      await deps.db
        .delete(deps.schema.cmsSiteSettings)
        .where(
          and(
            eq(deps.schema.cmsSiteSettings.locale, deps.locale),
            eq(deps.schema.cmsSiteSettings.key, setting.key),
          ),
        );
    }
    log(
      '~',
      `setting ${setting.key} — ${setting.existed ? 'restored' : 'removed (created by the apply)'}`,
    );
  }

  await deps.auth.recordAudit(deps.db, deps.actor, {
    action: 'patch.aanbod-correcties.restore',
    entityType: 'cms_rollout',
    summary: 'correcties van 27 oktober 2026 teruggezet',
    metadata: {
      pages: backup.pages.length,
      offerings: backup.offerings.map((entry) => entry.slug),
      services: backup.services.updated.map((entry) => entry.slug),
      createdServices: backup.services.created.map((entry) => entry.slug),
    },
  });
  deps.repo.revalidateContent({ tags: OFFERING_CACHE_TAGS });
}
