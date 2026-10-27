/**
 * The writes of `npm run cms:patch-aanbod-correcties`, one function per
 * section, in the order they run (see the header of `aanbod-correcties-plan.mts`).
 * Everything goes through the real repos wherever one fits (settings, the
 * location, services, subscriptions, the menu, pages: permissions, validation,
 * audit, cache bust); only what no repo function does alone is a direct write
 * with its own audit entry: the copy columns of an offering (`updateOffering`
 * would rewrite the name and description of the booking services of a fit that
 * is booked online on every call) and the third variant row.
 *
 * Called by `applyAanbodCorrecties` (`aanbod-correcties-patch.mts`) after the
 * plan found no blocker and the backup was written. neon-http has no
 * transactions: each section is ordered so a failure halfway leaves valid data,
 * and a repeated run finds the finished sections as intended.
 */
import { cmsOfferingVariants, cmsOfferings } from '@/db/cms-offering-schema';
import type { BlockType, SiteSettingKey } from '@/lib/cms/blocks';
import { AUDIENCE_LABELS } from '@/lib/offers/offering';
import { STUDIO_LOCATION_ADDRESS } from '@/lib/studio/seed-content/location-section';
import type { CorrectiesPlan, PagePlan } from './aanbod-correcties-plan.mjs';
import type { RolloutDeps } from './aanbod-rollout.mjs';

/** The booking repo on top of the rollout deps (the cms repo stays for settings, pages and the cache bust). */
export type CorrectiesDeps = RolloutDeps & { bookingRepo: typeof import('@/lib/booking/repo') };

export const OFFERING_CACHE_TAGS = ['cms', 'cms:offerings', 'booking'];

/** What the apply wrote, for the closing audit entry. */
export type ApplySummary = {
  settings: string[];
  location: boolean;
  variants: string[];
  services: string[];
  offerings: string[];
  provider: string[];
  menu: boolean;
  pages: string[];
};

export function must<T>(
  label: string,
  result: { ok: true; data: T } | { ok: false; message: string },
): T {
  if (!result.ok) throw new Error(`${label}: ${result.message}`);
  return result.data;
}

const PACKAGE_LABEL = AUDIENCE_LABELS['youth-package'];

async function applySettings(deps: CorrectiesDeps, plan: CorrectiesPlan, summary: ApplySummary) {
  for (const entry of plan.settings.filter((item) => item.action === 'update')) {
    must(
      `setting ${entry.key}`,
      await deps.repo.updateSiteSetting(deps.locale, entry.key as SiteSettingKey, entry.value),
    );
    summary.settings.push(entry.key);
    deps.log('~', `setting ${entry.key} — ${entry.changes.join('; ')}`);
  }
}

async function applyLocation(deps: CorrectiesDeps, plan: CorrectiesPlan, summary: ApplySummary) {
  const { row } = plan.location;
  if (plan.location.action !== 'update' || !row) return;
  must(
    `location ${row.name}`,
    await deps.bookingRepo.updateLocation(row.id, {
      addressLines: [...STUDIO_LOCATION_ADDRESS.addressLines],
      postalCode: STUDIO_LOCATION_ADDRESS.postalCode,
      city: STUDIO_LOCATION_ADDRESS.city,
      country: STUDIO_LOCATION_ADDRESS.country,
    }),
  );
  summary.location = true;
  deps.log('~', `location ${row.name} — ${plan.location.changes.join('; ')}`);
}

/**
 * The providers get the package service by adding it to what they offer
 * already (`setProviderServices` replaces a provider's whole set): with
 * `staging-retain` that is how Toshoni keeps every offering he has.
 */
async function subscribe(
  deps: CorrectiesDeps,
  serviceId: string,
  targets: ReadonlyArray<{ providerId: string; locationId: string | null }>,
) {
  const { eq } = deps.orm;
  const table = deps.schema.cmsProviderServices;
  for (const target of targets) {
    const current = await deps.db
      .select({ serviceId: table.serviceId, locationId: table.locationId })
      .from(table)
      .where(eq(table.providerId, target.providerId));
    must(
      `provider ${target.providerId}`,
      await deps.bookingRepo.setProviderServices(target.providerId, [
        ...current,
        { serviceId, locationId: target.locationId },
      ]),
    );
  }
}

/** The third variant: its service first, then the row, then who offers it. */
async function applyPackages(deps: CorrectiesDeps, plan: CorrectiesPlan, summary: ApplySummary) {
  for (const entry of plan.packages.filter((item) => item.action === 'update')) {
    let serviceId = entry.thirdBefore?.serviceId ?? null;
    if (entry.service.kind === 'existing') serviceId = entry.service.id;
    if (entry.service.kind === 'create') {
      const created = must(
        `service ${entry.service.facts.slug}`,
        await deps.bookingRepo.createService({ ...entry.service.facts, locale: deps.locale }),
      );
      serviceId = created.id;
      summary.services.push(created.slug);
    }
    if (entry.variant !== 'exists' || entry.service.kind === 'create') {
      await deps.db
        .insert(cmsOfferingVariants)
        .values({
          offeringId: entry.offeringId,
          audience: 'youth-package',
          serviceId,
          priceCents: entry.priceCents,
        })
        .onConflictDoUpdate({
          target: [cmsOfferingVariants.offeringId, cmsOfferingVariants.audience],
          set: { serviceId, priceCents: entry.priceCents },
        });
      await deps.auth.recordAudit(deps.db, deps.actor, {
        action: 'offering.update',
        entityType: 'cms_offering',
        entityId: entry.offeringId,
        summary: `${entry.slug}: ${PACKAGE_LABEL} (patch aanbod-correcties)`,
        metadata: { variant: 'youth-package', serviceId, priceCents: entry.priceCents },
      });
      summary.variants.push(entry.slug);
    }
    if (serviceId && entry.subscribe.length > 0) await subscribe(deps, serviceId, entry.subscribe);
    deps.log('~', `variant ${entry.slug} — ${entry.changes.join('; ')}`);
  }
}

/** The copy and the duration of the booking services, through `updateService` (validated, audited). */
async function applyServices(deps: CorrectiesDeps, plan: CorrectiesPlan, summary: ApplySummary) {
  for (const entry of plan.services.filter((item) => item.action === 'update')) {
    if (!entry.row) continue;
    must(`service ${entry.slug}`, await deps.bookingRepo.updateService(entry.row.id, entry.writes));
    summary.services.push(entry.slug);
    deps.log('~', `service ${entry.slug} — ${entry.changes.join('; ')}`);
  }
  for (const entry of plan.durations.filter((item) => item.action === 'update')) {
    if (!entry.row) continue;
    must(
      `service ${entry.row.slug}`,
      await deps.bookingRepo.updateService(entry.row.id, { durationMinutes: entry.minutes }),
    );
    deps.log('~', `duration ${entry.label} — ${entry.changes.join('; ')}`);
  }
}

/** Only the columns named in the correction, with an `offering.update` entry each. */
async function applyOfferings(deps: CorrectiesDeps, plan: CorrectiesPlan, summary: ApplySummary) {
  const { eq } = deps.orm;
  for (const entry of plan.offerings.filter((item) => item.action === 'update')) {
    if (!entry.row) continue;
    await deps.db
      .update(cmsOfferings)
      .set({
        ...(entry.writes as Partial<typeof cmsOfferings.$inferInsert>),
        updatedBy: deps.actor.id,
        updatedAt: new Date(),
      })
      .where(eq(cmsOfferings.id, entry.row.id));
    await deps.auth.recordAudit(deps.db, deps.actor, {
      action: 'offering.update',
      entityType: 'cms_offering',
      entityId: entry.row.id,
      summary: `${entry.slug}: ${Object.keys(entry.writes).join(', ')} (patch aanbod-correcties)`,
    });
    summary.offerings.push(entry.slug);
    deps.log('~', `offering ${entry.slug} — ${entry.changes.join('; ')}`);
  }
}

/**
 * Toshoni's offerings go; the provider row, its bookings and its calendar link stay.
 * With `staging-retain` he stays: his set is never written here, so never emptied.
 */
async function applyProvider(deps: CorrectiesDeps, plan: CorrectiesPlan, summary: ApplySummary) {
  if (plan.providerMode === 'staging-retain') return;
  const { provider, rows } = plan.provider;
  if (!provider || rows.length === 0) return;
  must(
    `provider ${provider.displayName}`,
    await deps.bookingRepo.setProviderServices(provider.id, []),
  );
  summary.provider.push(provider.displayName);
  deps.log('~', `provider ${provider.displayName} — ${plan.provider.changes.join('; ')}`);
}

async function applyMenu(deps: CorrectiesDeps, plan: CorrectiesPlan, summary: ApplySummary) {
  if (plan.menu.action !== 'update' || !plan.menu.items) return;
  must('menu main', await deps.repo.updateNavigation(deps.locale, 'main', plan.menu.items));
  summary.menu = true;
  deps.log('~', `menu main — ${plan.menu.changes.join('; ')}`);
}

/** Blocks, the page's own texts, then publish: the live snapshot of a page changes last. */
async function applyPage(deps: CorrectiesDeps, page: PagePlan) {
  const { row } = page;
  if (!row) return;
  const { repo } = deps;
  const label = `page ${page.path}`;
  for (const block of page.ops.deletes) {
    must(`${label} (${block.type})`, await repo.deleteBlock(block.id as string));
  }
  for (const { block, data } of page.ops.updates) {
    must(`${label} (${block.type})`, await repo.updateBlock(block.id as string, data));
  }
  for (const insert of page.ops.inserts) {
    const added = must(
      `${label} (${insert.type})`,
      await repo.addBlock(row.id, insert.type as BlockType, insert.index),
    );
    must(`${label} (${insert.type})`, await repo.updateBlock(added.id, insert.data));
  }
  if (Object.keys(page.fields).length > 0) {
    must(label, await repo.updatePage(row.id, page.fields));
  }
  if (page.publish) must(label, await repo.publishPage(row.id));
  deps.log(
    '~',
    `${label} — ${page.changes.length} change(s)${page.publish ? ', published' : ', draft only'}`,
  );
}

/** Runs every section of an unblocked plan. */
export async function applyCorrecties(
  deps: CorrectiesDeps,
  plan: CorrectiesPlan,
): Promise<ApplySummary> {
  // A plan that keeps Toshoni lists none of his offerings to remove: checked before any row.
  if (plan.providerMode === 'staging-retain' && plan.provider.rows.length > 0) {
    throw new Error(
      'provider: a plan that keeps Toshoni lists offerings to remove; no row written',
    );
  }
  const summary: ApplySummary = {
    settings: [],
    location: false,
    variants: [],
    services: [],
    offerings: [],
    provider: [],
    menu: false,
    pages: [],
  };
  await applySettings(deps, plan, summary);
  await applyLocation(deps, plan, summary);
  await applyPackages(deps, plan, summary);
  await applyServices(deps, plan, summary);
  await applyOfferings(deps, plan, summary);
  await applyProvider(deps, plan, summary);
  await applyMenu(deps, plan, summary);
  for (const page of plan.pages.filter((item) => item.action === 'update')) {
    await applyPage(deps, page);
    summary.pages.push(page.path);
  }
  deps.repo.revalidateContent({ tags: OFFERING_CACHE_TAGS });
  return summary;
}
