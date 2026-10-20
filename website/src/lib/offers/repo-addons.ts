import 'server-only';
import { and, asc, eq, inArray, notInArray } from 'drizzle-orm';
import type { CmsDatabase } from '@/db/cms';
import { cmsOfferingAddons, cmsOfferings } from '@/db/cms-offering-schema';
import type { RepoResult } from '@/lib/cms/repo';

/**
 * The "Extra's bij dit aanbod" links of an offering (`cms_offering_addons`,
 * 20 Oct 2026), split from `./repo.ts` (over the file-size limit). Called by
 * `writeOffering()` after its permission check; never on its own from a
 * page or an action.
 */

/** The ids of the extras linked to an offering, in their order. */
export async function readAddonLinks(db: CmsDatabase, offeringId: string): Promise<string[]> {
  const rows = await db
    .select({ addonId: cmsOfferingAddons.addonId })
    .from(cmsOfferingAddons)
    .where(eq(cmsOfferingAddons.offeringId, offeringId))
    .orderBy(asc(cmsOfferingAddons.sortOrder));
  return rows.map((row) => row.addonId);
}

/**
 * Makes the links of an offering exactly `addonIds`, in that order. Every id
 * must be an existing offering of the locale that is marked as an extra; an
 * offering cannot be its own extra. Upserts first, then drops the rest, so a
 * failure half-way never leaves the offering without links it had
 * (neon-http has no transactions).
 */
export async function syncOfferingAddons(
  db: CmsDatabase,
  input: { offeringId: string; locale: string; addonIds: readonly string[] },
): Promise<RepoResult<true>> {
  const ids = [...new Set(input.addonIds)];
  if (ids.includes(input.offeringId)) {
    return { ok: false, message: 'Een aanbod kan zichzelf niet als extra hebben.' };
  }
  if (ids.length > 0) {
    const found = await db
      .select({ id: cmsOfferings.id })
      .from(cmsOfferings)
      .where(
        and(
          inArray(cmsOfferings.id, ids),
          eq(cmsOfferings.locale, input.locale),
          eq(cmsOfferings.isAddon, true),
        ),
      );
    if (found.length !== ids.length) {
      return { ok: false, message: 'Een gekozen extra bestaat niet (meer) of is geen extra.' };
    }
  }
  for (const [index, addonId] of ids.entries()) {
    await db
      .insert(cmsOfferingAddons)
      .values({ offeringId: input.offeringId, addonId, sortOrder: index })
      .onConflictDoUpdate({
        target: [cmsOfferingAddons.offeringId, cmsOfferingAddons.addonId],
        set: { sortOrder: index },
      });
  }
  await db
    .delete(cmsOfferingAddons)
    .where(
      and(
        eq(cmsOfferingAddons.offeringId, input.offeringId),
        ids.length > 0 ? notInArray(cmsOfferingAddons.addonId, ids) : undefined,
      ),
    );
  return { ok: true, data: true };
}
