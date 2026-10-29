/**
 * `npm run cms:patch-aanbod-correcties --restore <backup>`: puts back every row
 * the apply touched and removes what it created. The backup is read by zod
 * (`aanbod-correcties-backup.mts`). Order, the reverse of the apply where it
 * matters: the pages (row, draft blocks and with them the published snapshot,
 * through the rollout restore), the menu, Toshoni's offerings, the services'
 * columns (the guardian rule among them), the offerings' columns, the location,
 * the settings.
 *
 * Direct writes where a repo function would add its own rules: a created row is
 * deleted, a changed column is put back.
 *
 * Takes no mode: it reverses what the backup lists. The backup of a run with
 * `--staging-retain-toshoni` removed none of Toshoni's offerings, so his set is
 * not written here; what he offers stays as it is.
 */
import { cmsOfferings, cmsOfferingVariants } from '@/db/cms-offering-schema';
import type { SiteSettingKey } from '@/lib/cms/blocks';
import type { AanbodCorrectiesBackup } from './aanbod-correcties-backup.mjs';
import { must, OFFERING_CACHE_TAGS, type CorrectiesDeps } from './aanbod-correcties-apply.mjs';
import { restoreAanbodRollout, type PlanDeps, type RolloutBackup } from './aanbod-rollout.mjs';
import {
  LEGACY_PACKAGE_NAME,
  LEGACY_PACKAGE_SLUG,
  planPackageGuard,
} from './aanbod-correcties-plan-booking.mjs';
import { readWorld } from './aanbod-correcties-world.mjs';

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
  const { eq } = deps.orm;
  const table = deps.schema.cmsProviderServices;
  const { providerId, removed } = backup.subscriptions;
  // Only when the apply removed his offerings (never with `staging-retain`); never a partial set.
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
}

/** Refuse a stale or foreign package backup before any restore write. */
export async function preflightLegacyRestore(deps: PlanDeps, backup: AanbodCorrectiesBackup) {
  const entries = backup.services.updated.filter((item) => item.fields.includes('isActive'));
  if (entries.length === 0) return;
  if (entries.length !== 1)
    throw new Error('legacy package restore: ambiguous active-service entries');
  const [entry] = entries;
  const before = entry.row;
  if (
    entry.slug !== LEGACY_PACKAGE_SLUG ||
    before.slug !== LEGACY_PACKAGE_SLUG ||
    before.name !== LEGACY_PACKAGE_NAME ||
    before.locale !== backup.locale ||
    before.isActive !== true
  ) {
    throw new Error('legacy package restore: backup identity is not the exact active service');
  }
  const world = await readWorld(deps);
  const current = world.services.find((service) => service.id === entry.id);
  const guard = planPackageGuard(world);
  if (
    !current ||
    current.slug !== entry.slug ||
    current.name !== before.name ||
    current.isActive ||
    guard.blockers.length > 0
  ) {
    throw new Error(
      `legacy package restore: service identity or references changed; stop for manual review (${guard.blockers.join('; ')})`,
    );
  }
}

/** The changed columns of the services. */
async function restoreServices(deps: CorrectiesDeps, backup: AanbodCorrectiesBackup) {
  for (const entry of backup.services.updated) {
    const values: Dict = {};
    for (const field of entry.fields) values[field] = entry.row[field];
    if (entry.fields.includes('isActive')) {
      // Mirror the forward guard in the one SQL statement that reactivates the
      // exact row. Writers must also be paused for the restore window.
      const { and, eq, notExists } = deps.orm;
      const services = deps.schema.cmsServices;
      const bookings = deps.schema.cmsBookings;
      const updated = await deps.db
        .update(services)
        .set({ isActive: true, updatedAt: new Date() })
        .where(
          and(
            eq(services.id, entry.id),
            eq(services.locale, backup.locale),
            eq(services.slug, LEGACY_PACKAGE_SLUG),
            eq(services.name, LEGACY_PACKAGE_NAME),
            eq(services.isActive, false),
            notExists(
              deps.db
                .select({ id: cmsOfferingVariants.offeringId })
                .from(cmsOfferingVariants)
                .where(eq(cmsOfferingVariants.serviceId, entry.id)),
            ),
            notExists(
              deps.db
                .select({ id: bookings.id })
                .from(bookings)
                .where(eq(bookings.serviceId, entry.id)),
            ),
          ),
        )
        .returning({ id: services.id });
      if (updated.length !== 1)
        throw new Error(
          `legacy package restore: service ${entry.id} changed after preflight; stop for manual review`,
        );
      await deps.auth.recordAudit(deps.db, deps.actor, {
        action: 'service.update',
        entityType: 'cms_service',
        entityId: entry.id,
        summary: `${entry.slug}: reactivated from correction backup`,
      });
      delete values.isActive;
    }
    if (Object.keys(values).length > 0) {
      must(
        `service ${entry.slug}`,
        await deps.bookingRepo.updateService(
          entry.id,
          values as Parameters<typeof deps.bookingRepo.updateService>[1],
        ),
      );
    }
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

  await preflightLegacyRestore(deps, backup);

  // Pages and menu: the rollout restore (row, draft blocks and snapshot as they were, audited).
  if (backup.pages.length > 0 || backup.menu)
    await restoreAanbodRollout(deps, rolloutBackupOf(backup));

  await restoreSubscriptions(deps, backup);
  await restoreServices(deps, backup);

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
      providerMode: backup.providerMode,
      pages: backup.pages.length,
      offerings: backup.offerings.map((entry) => entry.slug),
      services: backup.services.updated.map((entry) => entry.slug),
    },
  });
  deps.repo.revalidateContent({ tags: OFFERING_CACHE_TAGS });
}
