import 'server-only';
import { loadOfferCatalogue } from '@/lib/cms/offers-content';
import { pickAddons, type BookingAddonOption } from '@/lib/offers/addons';

/**
 * The extras a visitor asked for, checked against what the catalogue offers
 * for that service (`addonsByService`, from Beheer → Aanbod). The server
 * decides the minutes and the price from the catalogue, never from the
 * client; an id that is not an extra of this service refuses the whole
 * request. Shared by `availabilityAction` and `createPublicBooking()`.
 * Without extras nothing is read.
 */
export type ResolvedBookingAddons =
  { ok: true; addons: BookingAddonOption[]; extraMinutes: number } | { ok: false };

export async function resolveBookingAddons(
  serviceId: string,
  addonIds: readonly string[],
  locale: string,
): Promise<ResolvedBookingAddons> {
  if (addonIds.length === 0) return { ok: true, addons: [], extraMinutes: 0 };
  const catalogue = await loadOfferCatalogue(locale);
  const picked = pickAddons(catalogue.addonsByService[serviceId] ?? [], addonIds);
  if (!picked.ok) return { ok: false };
  return {
    ok: true,
    addons: picked.addons,
    extraMinutes: picked.addons.reduce((sum, addon) => sum + addon.minutes, 0),
  };
}
