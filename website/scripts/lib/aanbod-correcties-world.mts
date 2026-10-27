/**
 * Read-only half of `npm run cms:patch-aanbod-correcties`, part one: reads the
 * rows the patch decides on into one plain {@link World}, nothing else. The
 * plan (`aanbod-correcties-plan.mts`) is a pure function of it, so it runs
 * against a synthetic world in a unit test and against the real rows in the
 * dry run (through `readOnlyDb()`) and in the apply (twice: to plan, and to
 * verify). Never writes.
 *
 * Every read goes through `withTransportRetry` (the Neon keep-alive lesson of
 * 20 Oct 2026: a first query on a socket the server closed meanwhile is sent a
 * second time). Rows are read as stored; nothing is parsed or interpreted here.
 */
import { cmsOfferingVariants, cmsOfferings } from '@/db/cms-offering-schema';
import { withTransportRetry } from './aanbod-prices-plan.mjs';
import type { PlanDeps } from './aanbod-rollout.mjs';
import type { SubscriptionRow } from './aanbod-correcties-youth.mjs';

type CmsSchema = PlanDeps['schema'];
export type PageRowFull = CmsSchema['cmsPages']['$inferSelect'];
export type BlockRowFull = CmsSchema['cmsBlocks']['$inferSelect'];
export type LocationRowFull = CmsSchema['cmsLocations']['$inferSelect'];
export type ServiceRowFull = CmsSchema['cmsServices']['$inferSelect'];
/**
 * A provider with what his login says: whether it is active, and the login itself
 * (`cms_users.email`), which only `isToshoni` compares; nothing prints it.
 */
export type ProviderRowFull = CmsSchema['cmsProviders']['$inferSelect'] & {
  userActive: boolean;
  userEmail: string;
};
export type OfferingRowFull = typeof cmsOfferings.$inferSelect;
export type VariantRowFull = typeof cmsOfferingVariants.$inferSelect;

/** Row counts the apply proves: what must not move, and what moves by exactly the plan. */
export type Counts = {
  pages: number;
  blocks: number;
  offerings: number;
  variants: number;
  services: number;
  bookings: number;
  providers: number;
  subscriptions: number;
};

export type World = {
  locale: string;
  /** `cms_site_settings` of the locale: key → stored value. */
  settings: Map<string, unknown>;
  locations: LocationRowFull[];
  mainMenu: { exists: boolean; items: unknown };
  /** Every page of the locale with its draft blocks in order. */
  pages: Array<{ row: PageRowFull; blocks: BlockRowFull[] }>;
  offerings: OfferingRowFull[];
  variants: VariantRowFull[];
  services: ServiceRowFull[];
  providers: ProviderRowFull[];
  subscriptions: SubscriptionRow[];
  counts: Counts;
};

export async function readWorld(deps: PlanDeps): Promise<World> {
  const { asc, eq, and, inArray } = deps.orm;
  const { db, schema, locale } = deps;

  const [
    settingRows,
    locations,
    [menu],
    pageRows,
    offerings,
    services,
    providerRows,
    subscriptions,
  ] = await withTransportRetry(() =>
    Promise.all([
      db
        .select({ key: schema.cmsSiteSettings.key, value: schema.cmsSiteSettings.value })
        .from(schema.cmsSiteSettings)
        .where(eq(schema.cmsSiteSettings.locale, locale)),
      db.select().from(schema.cmsLocations).orderBy(asc(schema.cmsLocations.sortOrder)),
      db
        .select({ items: schema.cmsNavigation.items })
        .from(schema.cmsNavigation)
        .where(
          and(eq(schema.cmsNavigation.locale, locale), eq(schema.cmsNavigation.menuKey, 'main')),
        )
        .limit(1),
      db.select().from(schema.cmsPages).where(eq(schema.cmsPages.locale, locale)),
      db.select().from(cmsOfferings).where(eq(cmsOfferings.locale, locale)),
      db.select().from(schema.cmsServices).where(eq(schema.cmsServices.locale, locale)),
      db
        .select({
          provider: schema.cmsProviders,
          userActive: schema.cmsUsers.isActive,
          userEmail: schema.cmsUsers.email,
        })
        .from(schema.cmsProviders)
        .innerJoin(schema.cmsUsers, eq(schema.cmsUsers.id, schema.cmsProviders.userId)),
      db
        .select({
          providerId: schema.cmsProviderServices.providerId,
          serviceId: schema.cmsProviderServices.serviceId,
          locationId: schema.cmsProviderServices.locationId,
        })
        .from(schema.cmsProviderServices),
    ]),
  );

  const offeringIds = offerings.map((row) => row.id);
  const pageIds = pageRows.map((row) => row.id);
  const [blockRows, variants, ids] = await withTransportRetry(() =>
    Promise.all([
      pageIds.length > 0
        ? db
            .select()
            .from(schema.cmsBlocks)
            .where(inArray(schema.cmsBlocks.pageId, pageIds))
            .orderBy(asc(schema.cmsBlocks.sortOrder))
        : Promise.resolve([]),
      offeringIds.length > 0
        ? db
            .select()
            .from(cmsOfferingVariants)
            .where(inArray(cmsOfferingVariants.offeringId, offeringIds))
        : Promise.resolve([]),
      Promise.all([
        db.select({ id: schema.cmsPages.id }).from(schema.cmsPages),
        db.select({ id: schema.cmsBlocks.id }).from(schema.cmsBlocks),
        db.select({ id: cmsOfferings.id }).from(cmsOfferings),
        db.select({ id: cmsOfferingVariants.offeringId }).from(cmsOfferingVariants),
        db.select({ id: schema.cmsServices.id }).from(schema.cmsServices),
        db.select({ id: schema.cmsBookings.id }).from(schema.cmsBookings),
        db.select({ id: schema.cmsProviders.id }).from(schema.cmsProviders),
        db.select({ id: schema.cmsProviderServices.serviceId }).from(schema.cmsProviderServices),
      ]),
    ]),
  );

  return {
    locale,
    settings: new Map(settingRows.map((row) => [row.key, row.value])),
    locations,
    mainMenu: { exists: Boolean(menu), items: menu?.items ?? null },
    pages: pageRows.map((row) => ({
      row,
      blocks: blockRows.filter((block) => block.pageId === row.id),
    })),
    offerings,
    variants,
    services,
    providers: providerRows.map((entry) => ({
      ...entry.provider,
      userActive: entry.userActive,
      userEmail: entry.userEmail,
    })),
    subscriptions,
    counts: {
      pages: ids[0].length,
      blocks: ids[1].length,
      offerings: ids[2].length,
      variants: ids[3].length,
      services: ids[4].length,
      bookings: ids[5].length,
      providers: ids[6].length,
      subscriptions: ids[7].length,
    },
  };
}
