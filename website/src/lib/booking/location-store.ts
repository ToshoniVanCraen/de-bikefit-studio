import 'server-only';
import { and, asc, desc, eq } from 'drizzle-orm';
import { unstable_cache } from 'next/cache';
import { getCmsDb } from '@/db/cms';
import { cmsLocations } from '@/db/cms-schema';
import { CMS_TAGS } from '@/lib/cms/content';
import { BOOKING_TAG } from './content';

/**
 * Cached public read of the studio's booking location (Beheer → Locaties):
 * the active location of kind `studio` that is marked "Standaard", else the
 * first active studio by sort order. It is the master of the copy token
 * `{{adres-studio}}` (`src/lib/studio/copy-token-values.ts`); `{{adres}}` is the
 * address of Instellingen → Contact. A location of kind `customer` ("Bij jou
 * thuis") has no address and is never returned.
 *
 * Tags `cms` and `booking`: every location write busts `booking`
 * (`repo-shared.ts#bust`). Plain JSON across the cache boundary. A failed read
 * throws, like the other readers in `content.ts`; the caller degrades.
 */

const REVALIDATE_SECONDS = 300;

export type DefaultStudioLocation = {
  name: string;
  addressLines: string[];
  postalCode: string;
  city: string;
};

export async function getDefaultStudioLocation(): Promise<DefaultStudioLocation | null> {
  const load = unstable_cache(
    async (): Promise<DefaultStudioLocation | null> => {
      const db = await getCmsDb();
      const [row] = await db
        .select()
        .from(cmsLocations)
        .where(and(eq(cmsLocations.isActive, true), eq(cmsLocations.kind, 'studio')))
        .orderBy(desc(cmsLocations.isDefault), asc(cmsLocations.sortOrder), asc(cmsLocations.name))
        .limit(1);
      if (!row) return null;
      return {
        name: row.name,
        addressLines: row.addressLines.filter(Boolean),
        postalCode: row.postalCode,
        city: row.city,
      };
    },
    ['booking-default-studio-location'],
    { tags: [CMS_TAGS.all, BOOKING_TAG], revalidate: REVALIDATE_SECONDS },
  );
  return load();
}
