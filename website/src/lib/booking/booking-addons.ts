import 'server-only';
import { asc, inArray } from 'drizzle-orm';
import type { CmsDatabase } from '@/db/cms';
import { cmsBookingAddons, type CmsBookingAddon } from '@/db/cms-offering-schema';
import type { BookingAddonOption } from '@/lib/offers/addons';
import { formatDuration } from './format';

/**
 * The extras of a booking (`cms_booking_addons`, 20 Oct 2026): a snapshot
 * per booking of the title, minutes and price of every extra the customer
 * ticked, so a later change in Beheer → Aanbod never rewrites what was
 * booked. The booking's `ends_at` already includes the extra minutes.
 * Read by the admin list, the mails and the calendar event; written once by
 * `createPublicBooking()`.
 */

export async function listBookingAddons(
  db: CmsDatabase,
  bookingIds: readonly string[],
): Promise<Map<string, CmsBookingAddon[]>> {
  const byBooking = new Map<string, CmsBookingAddon[]>();
  if (bookingIds.length === 0) return byBooking;
  const rows = await db
    .select()
    .from(cmsBookingAddons)
    .where(inArray(cmsBookingAddons.bookingId, [...bookingIds]))
    .orderBy(asc(cmsBookingAddons.sortOrder));
  for (const row of rows) {
    byBooking.set(row.bookingId, [...(byBooking.get(row.bookingId) ?? []), row]);
  }
  return byBooking;
}

export async function insertBookingAddons(
  db: CmsDatabase,
  bookingId: string,
  addons: readonly BookingAddonOption[],
): Promise<void> {
  if (addons.length === 0) return;
  await db.insert(cmsBookingAddons).values(
    addons.map((addon, index) => ({
      bookingId,
      offeringId: addon.offeringId,
      slug: addon.slug,
      title: addon.title,
      minutes: addon.minutes,
      priceCents: addon.priceCents,
      sortOrder: index,
    })),
  );
}

/** "Voetanalyse (30 min)" per extra, for mails, the calendar event and the admin. */
export function addonLines(
  addons: ReadonlyArray<Pick<CmsBookingAddon, 'title' | 'minutes'>>,
): string[] {
  return addons.map((addon) => `${addon.title} (${formatDuration(addon.minutes)})`);
}
