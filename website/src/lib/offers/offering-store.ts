import 'server-only';
import { asc, eq, inArray } from 'drizzle-orm';
import { unstable_cache } from 'next/cache';
import { getCmsDb } from '@/db/cms';
import { cmsOfferingAddons, cmsOfferings, cmsOfferingVariants } from '@/db/cms-offering-schema';
import { cmsServices, DEFAULT_LOCALE } from '@/db/cms-schema';
import { BOOKING_TAG } from '@/lib/booking/content';
import { CMS_TAGS } from '@/lib/cms/content';
import { settingsFromRows, type OfferingServiceInfo } from './offering';
import { contentFromRow, type OfferingRecord } from './offering-content';

/**
 * Cached read of the offerings (`cms_offerings` + variants: copy and
 * settings) and of the service facts they need, for the public site. The
 * admin screen reads the same tables through `./repo.ts` (uncached,
 * permission-checked).
 *
 * Tags: `cms` (every CMS write), {@link OFFERING_TAG} (Beheer → Aanbod) and
 * `booking` (a provider changing what they offer). Values crossing the cache
 * boundary are plain JSON.
 *
 * A failed read is reported with a fixed code and answered with an empty
 * catalogue (`storeAvailable: false`): the overviews then list nothing and the
 * booking actions refuse every service (fail closed), which is what a missing
 * migration 0010/0011 should look like, never a crash of the page. The empty
 * answer is NOT cached (20 Oct 2026): one transient transport failure must
 * not empty the offer for the next five minutes — the next request reads
 * again. The log names the error's class chain (`Error>NeonDbError>TypeError`
 * is a failed fetch under Drizzle, which sets no name of its own), never a
 * message, since a failed query's message holds its SQL and bound values.
 */

export const OFFERING_TAG = 'cms:offerings';

const REVALIDATE_SECONDS = 300;
/** A thrown error's class name (`TypeError`, `NeonDbError`); anything else is `unknown`. */
const ERROR_NAME_RE = /^[A-Za-z]{1,64}$/;

/** The class names along the cause chain, e.g. `Error>NeonDbError>TypeError`; never a message. */
function errorName(error: unknown): string {
  const names: string[] = [];
  let current: unknown = error;
  for (let depth = 0; current instanceof Error && depth < 4; depth += 1) {
    names.push(ERROR_NAME_RE.test(current.name) ? current.name : 'unknown');
    current = current.cause;
  }
  return names.length > 0 ? names.join('>') : 'unknown';
}

export type OfferingStore = {
  offerings: OfferingRecord[];
  services: OfferingServiceInfo[];
  /** `false` when the offering tables could not be read (e.g. before migration 0011). */
  storeAvailable: boolean;
};

async function readServices(locale: string): Promise<OfferingServiceInfo[]> {
  const db = await getCmsDb();
  return db
    .select({
      id: cmsServices.id,
      slug: cmsServices.slug,
      name: cmsServices.name,
      choiceLabel: cmsServices.choiceLabel,
      durationMinutes: cmsServices.durationMinutes,
      isActive: cmsServices.isActive,
      requiresGuardian: cmsServices.requiresGuardian,
      priceCents: cmsServices.priceCents,
      showPrice: cmsServices.showPrice,
    })
    .from(cmsServices)
    .where(eq(cmsServices.locale, locale))
    .orderBy(asc(cmsServices.sortOrder), asc(cmsServices.name));
}

/** Every offering of a locale (shown or not), uncached. */
export async function readStoredOfferings(locale: string): Promise<OfferingRecord[]> {
  const db = await getCmsDb();
  const rows = await db
    .select()
    .from(cmsOfferings)
    .where(eq(cmsOfferings.locale, locale))
    .orderBy(asc(cmsOfferings.sortOrder), asc(cmsOfferings.title));
  if (rows.length === 0) return [];
  const variants = await db
    .select()
    .from(cmsOfferingVariants)
    .where(
      inArray(
        cmsOfferingVariants.offeringId,
        rows.map((row) => row.id),
      ),
    );
  const links = await db
    .select()
    .from(cmsOfferingAddons)
    .where(
      inArray(
        cmsOfferingAddons.offeringId,
        rows.map((row) => row.id),
      ),
    )
    .orderBy(asc(cmsOfferingAddons.sortOrder));
  return rows.map((row) => ({
    id: row.id,
    locale: row.locale,
    content: contentFromRow(row),
    settings: settingsFromRows(
      row,
      variants.filter((variant) => variant.offeringId === row.id),
      links.filter((link) => link.offeringId === row.id).map((link) => link.addonId),
    ),
    updatedAt: new Date(row.updatedAt).toISOString(),
  }));
}

export async function getOfferingStore(locale: string = DEFAULT_LOCALE): Promise<OfferingStore> {
  const load = unstable_cache(
    async (): Promise<OfferingStore> => {
      const [offerings, services] = await Promise.all([
        readStoredOfferings(locale),
        readServices(locale),
      ]);
      return { offerings, services, storeAvailable: true };
    },
    ['cms-offering-store', locale],
    {
      tags: [CMS_TAGS.all, OFFERING_TAG, BOOKING_TAG],
      revalidate: REVALIDATE_SECONDS,
    },
  );
  try {
    return await load();
  } catch (error) {
    // Outside the cache on purpose: a rejected read is not stored, so the next
    // request reads again. A fixed code and the error's class names, never its
    // message: a failed query's message holds its SQL and bound values.
    console.error('[aanbod] offerings_unavailable', { error: errorName(error) });
    return { offerings: [], services: [], storeAvailable: false };
  }
}
