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
import { cmsOfferings } from '@/db/cms-offering-schema';
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

/** The changed columns of the services. */
async function restoreServices(deps: CorrectiesDeps, backup: AanbodCorrectiesBackup) {
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
