/**
 * Shared helpers of self-test section 17d (`aanbod-correcties.mts`): the
 * context `cms-selftest.mts` hands to the section, `run()` which drives
 * `cms:patch-aanbod-correcties` through the entry point of the CLI and keeps
 * what it printed in `lines`, and the three things that make the section leave
 * the throwaway PGlite as it found it:
 *
 *  - {@link snapshotState} / {@link restoreState}: every row of the tables the
 *    patch (and the fixture) touches, taken before and put back after (pages and
 *    blocks, settings, menus, locations, services, offerings, providers, their
 *    subscriptions). The sections before 17d leave pages, services and a
 *    provider behind, so the fixture works on a clean slate and gives it back.
 *  - {@link fingerprint}: what a visitor and an admin can see of those tables,
 *    without the columns that always move (`updated_at`, `published_at`, ids of
 *    rows that are re-made), so "restore returns the state before" is one
 *    comparison.
 */
import * as orm from 'drizzle-orm';
import type { CmsDatabase } from '@/db/cms';
import { cmsOfferingAddons, cmsOfferings, cmsOfferingVariants } from '@/db/cms-offering-schema';
import { runAanbodCorrectiesPatch } from '../lib/aanbod-correcties-patch.mjs';
import { canonicalJson } from '../lib/aanbod-correcties-targets.mjs';

export type Check = (label: string, condition: boolean, detail?: string) => void;

export type CorrectiesSectionContext = {
  db: CmsDatabase;
  check: Check;
  section: (title: string) => void;
  cookieJar: Map<string, string>;
  backupDir: string;
  admin: { id: string; email: string };
};

type Schema = typeof import('@/db/cms-schema');

export async function createCorrectiesKit(
  ctx: Pick<CorrectiesSectionContext, 'db' | 'cookieJar' | 'backupDir'>,
) {
  const { db, cookieJar, backupDir } = ctx;
  const schema = await import('@/db/cms-schema');
  const locale = schema.DEFAULT_LOCALE;

  /** What the last `run()` printed, `symbol message` per line. */
  const lines: string[] = [];
  const log = (symbol: string, message: string) => {
    lines.push(`${symbol} ${message}`);
  };
  const run = (options: { apply: boolean; restore: string | null }) => {
    lines.length = 0;
    return runAanbodCorrectiesPatch(
      { ...options, backupDir },
      { db, driver: 'pglite', cookieJar, log },
    );
  };
  const backupPathOf = () =>
    lines.find((line) => line.startsWith('✓ backup written: '))?.slice('✓ backup written: '.length);
  const auditCount = async (action?: string) =>
    (
      await db
        .select({ id: schema.cmsAuditLog.id })
        .from(schema.cmsAuditLog)
        .where(action ? orm.eq(schema.cmsAuditLog.action, action) : undefined)
    ).length;

  const { and, eq } = orm;
  const serviceRow = async (slug: string) =>
    (
      await db
        .select()
        .from(schema.cmsServices)
        .where(and(eq(schema.cmsServices.locale, locale), eq(schema.cmsServices.slug, slug)))
    )[0] ?? null;
  const offeringRow = async (slug: string) =>
    (
      await db
        .select()
        .from(cmsOfferings)
        .where(and(eq(cmsOfferings.locale, locale), eq(cmsOfferings.slug, slug)))
    )[0] ?? null;
  const pageRow = async (slug: string) =>
    (
      await db
        .select()
        .from(schema.cmsPages)
        .where(and(eq(schema.cmsPages.locale, locale), eq(schema.cmsPages.slug, slug)))
    )[0] ?? null;
  const subscriptions = async (providerId: string) =>
    (
      await db
        .select()
        .from(schema.cmsProviderServices)
        .where(eq(schema.cmsProviderServices.providerId, providerId))
    ).sort((a, b) => a.serviceId.localeCompare(b.serviceId));
  const sessions = async () => (await db.select().from(schema.cmsSessions)).length;

  return {
    db,
    schema,
    locale,
    lines,
    run,
    backupPathOf,
    auditCount,
    serviceRow,
    offeringRow,
    pageRow,
    subscriptions,
    sessions,
  };
}

export type CorrectiesKit = Awaited<ReturnType<typeof createCorrectiesKit>>;

/** The lines of the last run that name an entity or block the patch. */
export const planLines = (lines: readonly string[]) => lines.filter((line) => /^[~=!] /.test(line));

// ---------------------------------------------------------------------------
// The state the section found, and gives back
// ---------------------------------------------------------------------------

export async function snapshotState(db: CmsDatabase, schema: Schema) {
  return {
    pages: await db.select().from(schema.cmsPages),
    blocks: await db.select().from(schema.cmsBlocks),
    settings: await db.select().from(schema.cmsSiteSettings),
    navigation: await db.select().from(schema.cmsNavigation),
    locations: await db.select().from(schema.cmsLocations),
    services: await db.select().from(schema.cmsServices),
    providers: await db.select({ id: schema.cmsProviders.id }).from(schema.cmsProviders),
    users: await db.select({ id: schema.cmsUsers.id }).from(schema.cmsUsers),
    subscriptions: await db.select().from(schema.cmsProviderServices),
    offerings: await db.select().from(cmsOfferings),
    variants: await db.select().from(cmsOfferingVariants),
    links: await db.select().from(cmsOfferingAddons),
  };
}

export type State = Awaited<ReturnType<typeof snapshotState>>;

/** Puts the tables back as `state` found them; rows the section made are removed. */
export async function restoreState(db: CmsDatabase, schema: Schema, state: State) {
  const { notInArray } = orm;
  const ids = (rows: ReadonlyArray<{ id: string }>) => rows.map((row) => row.id);

  // Content with no inbound references: wiped and written back as it was.
  await db.delete(schema.cmsPages);
  if (state.pages.length > 0) await db.insert(schema.cmsPages).values(state.pages);
  if (state.blocks.length > 0) await db.insert(schema.cmsBlocks).values(state.blocks);
  await db.delete(schema.cmsSiteSettings);
  if (state.settings.length > 0) await db.insert(schema.cmsSiteSettings).values(state.settings);
  await db.delete(schema.cmsNavigation);
  if (state.navigation.length > 0) await db.insert(schema.cmsNavigation).values(state.navigation);

  // Offerings: cascade removes variants and links; the snapshot rows come back.
  await db.delete(cmsOfferings);
  if (state.offerings.length > 0) await db.insert(cmsOfferings).values(state.offerings);

  // Providers and services the section made go; the others are put back as they were.
  const providerIds = ids(state.providers);
  await db
    .delete(schema.cmsProviders)
    .where(providerIds.length > 0 ? notInArray(schema.cmsProviders.id, providerIds) : undefined);
  const userIds = ids(state.users);
  await db
    .delete(schema.cmsUsers)
    .where(userIds.length > 0 ? notInArray(schema.cmsUsers.id, userIds) : undefined);
  const serviceIds = ids(state.services);
  await db
    .delete(schema.cmsServices)
    .where(serviceIds.length > 0 ? notInArray(schema.cmsServices.id, serviceIds) : undefined);
  for (const service of state.services) {
    const { id, createdAt, ...values } = service;
    void createdAt;
    await db.update(schema.cmsServices).set(values).where(orm.eq(schema.cmsServices.id, id));
  }
  const locationIds = ids(state.locations);
  await db
    .delete(schema.cmsLocations)
    .where(locationIds.length > 0 ? notInArray(schema.cmsLocations.id, locationIds) : undefined);
  for (const location of state.locations) {
    const { id, createdAt, ...values } = location;
    void createdAt;
    await db.update(schema.cmsLocations).set(values).where(orm.eq(schema.cmsLocations.id, id));
  }
  await db.delete(schema.cmsProviderServices);
  if (state.subscriptions.length > 0) {
    await db.insert(schema.cmsProviderServices).values(state.subscriptions);
  }
  if (state.variants.length > 0) await db.insert(cmsOfferingVariants).values(state.variants);
  if (state.links.length > 0) await db.insert(cmsOfferingAddons).values(state.links);
}

/** The columns that always move or are made anew; nothing a person can see. */
const VOLATILE = new Set([
  'updatedAt',
  'updatedBy',
  'createdAt',
  'createdBy',
  'publishedAt',
  'lastLoginAt',
]);

function visible(row: object): Record<string, unknown> {
  return Object.fromEntries(Object.entries(row).filter(([key]) => !VOLATILE.has(key)));
}

/**
 * What can be seen of the tables the patch touches, as one string. Ids of
 * rows the patch re-makes (variants, subscriptions) are replaced by the slug or
 * name they belong to.
 */
export async function fingerprint(db: CmsDatabase, schema: Schema): Promise<string> {
  const [
    pages,
    blocks,
    settings,
    navigation,
    locations,
    services,
    providers,
    subs,
    offerings,
    variants,
  ] = await Promise.all([
    db.select().from(schema.cmsPages),
    db.select().from(schema.cmsBlocks),
    db.select().from(schema.cmsSiteSettings),
    db.select().from(schema.cmsNavigation),
    db.select().from(schema.cmsLocations),
    db.select().from(schema.cmsServices),
    db.select().from(schema.cmsProviders),
    db.select().from(schema.cmsProviderServices),
    db.select().from(cmsOfferings),
    db.select().from(cmsOfferingVariants),
  ]);
  const serviceSlug = new Map(services.map((row) => [row.id, row.slug]));
  const providerName = new Map(providers.map((row) => [row.id, row.displayName]));
  const offeringSlug = new Map(offerings.map((row) => [row.id, row.slug]));
  const pageSlug = new Map(pages.map((row) => [row.id, row.slug]));
  const sorted = <T,>(list: T[]) => list.map((entry) => canonicalJson(entry)).sort();
  return canonicalJson({
    pages: sorted(
      pages.map((row) => {
        const snapshot = row.publishedSnapshot as {
          blocks?: Record<string, unknown>[];
          seo?: unknown;
        } | null;
        return {
          ...visible(row),
          // The snapshot's block ids are made anew like the block rows' ids.
          publishedSnapshot: snapshot
            ? {
                blocks: snapshot.blocks?.map(({ id, ...block }) => {
                  void id;
                  return block;
                }),
                seo: snapshot.seo,
              }
            : null,
        };
      }),
    ),
    // Ids of blocks and services are made anew by an apply; the page and the slug name them.
    blocks: sorted(
      blocks.map(({ id, ...row }) => {
        void id;
        return { ...visible(row), pageId: pageSlug.get(row.pageId) };
      }),
    ),
    settings: sorted(settings.map(visible)),
    navigation: sorted(navigation.map(visible)),
    locations: sorted(locations.map(visible)),
    services: sorted(
      services.map(({ id, ...row }) => {
        void id;
        return visible(row);
      }),
    ),
    offerings: sorted(offerings.map(visible)),
    variants: sorted(
      variants.map((row) => ({
        offering: offeringSlug.get(row.offeringId),
        audience: row.audience,
        service: row.serviceId ? serviceSlug.get(row.serviceId) : null,
        priceCents: row.priceCents,
      })),
    ),
    subscriptions: sorted(
      subs.map((row) => ({
        provider: providerName.get(row.providerId),
        service: serviceSlug.get(row.serviceId),
        locationId: row.locationId,
      })),
    ),
  });
}

/** Which tables two fingerprints differ in, and the first differing entries: the detail of a failed check. */
export function diffPrints(a: string, b: string): string {
  const left = JSON.parse(a) as Record<string, string[]>;
  const right = JSON.parse(b) as Record<string, string[]>;
  return Object.keys(left)
    .flatMap((table) => {
      const only = (from: string[], other: string[]) =>
        from.filter((entry) => !other.includes(entry));
      const removed = only(left[table], right[table]);
      const added = only(right[table], left[table]);
      // The first place the two entries differ, with a little before it.
      const around = (text: string | undefined, other: string | undefined) => {
        if (!text) return '';
        let at = 0;
        while (other && at < text.length && text[at] === other[at]) at += 1;
        return text.slice(Math.max(0, at - 30), at + 110);
      };
      return removed.length + added.length === 0
        ? []
        : [`${table}: -${around(removed[0], added[0])} +${around(added[0], removed[0])}`];
    })
    .join(' | ');
}
