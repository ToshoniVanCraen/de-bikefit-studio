/**
 * Read-only half of `npm run cms:patch-site-redesign`, part one: the rows the patch decides on,
 * as one plain {@link RedesignWorld}. The plan (`site-redesign-plan.mts`) is a pure function of
 * it, so it runs on a synthetic world in a test and on the real rows in the dry run (through
 * `readOnlyDb()`) and in the apply (twice: to plan and to verify). Never writes.
 *
 * Every read goes through `withTransportRetry` (the Neon keep-alive lesson of 20 Oct 2026).
 */
import { cmsOfferingVariants, cmsOfferings } from '@/db/cms-offering-schema';
import { withTransportRetry } from './aanbod-prices-plan.mjs';
import type { PlanDeps } from './aanbod-rollout.mjs';

type CmsSchema = PlanDeps['schema'];
export type PageRow = CmsSchema['cmsPages']['$inferSelect'];
export type BlockRow = CmsSchema['cmsBlocks']['$inferSelect'];
export type OfferingRow = typeof cmsOfferings.$inferSelect;

/** Row counts the apply proves: what must not move, and the blocks that move by the plan. */
export type RedesignCounts = {
  pages: number;
  blocks: number;
  offerings: number;
  variants: number;
  services: number;
  providers: number;
  bookings: number;
  menus: number;
  settings: number;
};

export const COUNT_KEYS: ReadonlyArray<keyof RedesignCounts> = [
  'pages',
  'blocks',
  'offerings',
  'variants',
  'services',
  'providers',
  'bookings',
  'menus',
  'settings',
];

export type RedesignWorld = {
  locale: string;
  /** Every page of the locale with its draft blocks in order. */
  pages: Array<{ row: PageRow; blocks: BlockRow[] }>;
  offerings: OfferingRow[];
  counts: RedesignCounts;
};

export async function readRedesignWorld(deps: PlanDeps): Promise<RedesignWorld> {
  const { asc, eq, inArray } = deps.orm;
  const { db, schema, locale } = deps;

  const [pageRows, offerings] = await withTransportRetry(() =>
    Promise.all([
      db.select().from(schema.cmsPages).where(eq(schema.cmsPages.locale, locale)),
      db.select().from(cmsOfferings).where(eq(cmsOfferings.locale, locale)),
    ]),
  );
  const pageIds = pageRows.map((row) => row.id);
  const [blockRows, ids] = await withTransportRetry(() =>
    Promise.all([
      pageIds.length > 0
        ? db
            .select()
            .from(schema.cmsBlocks)
            .where(inArray(schema.cmsBlocks.pageId, pageIds))
            .orderBy(asc(schema.cmsBlocks.sortOrder))
        : Promise.resolve([]),
      Promise.all([
        db.select({ id: schema.cmsPages.id }).from(schema.cmsPages),
        db.select({ id: schema.cmsBlocks.id }).from(schema.cmsBlocks),
        db.select({ id: cmsOfferings.id }).from(cmsOfferings),
        db.select({ id: cmsOfferingVariants.offeringId }).from(cmsOfferingVariants),
        db.select({ id: schema.cmsServices.id }).from(schema.cmsServices),
        db.select({ id: schema.cmsProviders.id }).from(schema.cmsProviders),
        db.select({ id: schema.cmsBookings.id }).from(schema.cmsBookings),
        db.select({ key: schema.cmsNavigation.menuKey }).from(schema.cmsNavigation),
        db.select({ key: schema.cmsSiteSettings.key }).from(schema.cmsSiteSettings),
      ]),
    ]),
  );

  return {
    locale,
    pages: pageRows.map((row) => ({
      row,
      blocks: blockRows.filter((block) => block.pageId === row.id),
    })),
    offerings,
    counts: {
      pages: ids[0].length,
      blocks: ids[1].length,
      offerings: ids[2].length,
      variants: ids[3].length,
      services: ids[4].length,
      providers: ids[5].length,
      bookings: ids[6].length,
      menus: ids[7].length,
      settings: ids[8].length,
    },
  };
}

export function describeCounts(counts: RedesignCounts): string {
  return COUNT_KEYS.map((key) => `${key} ${counts[key]}`).join(', ');
}

/** "blocks 112 (+14)": only what moves. */
export function describeCountChanges(before: RedesignCounts, after: RedesignCounts): string {
  return COUNT_KEYS.filter((key) => after[key] !== before[key])
    .map(
      (key) =>
        `${key} ${after[key]} (${after[key] > before[key] ? '+' : ''}${after[key] - before[key]})`,
    )
    .join(', ');
}
