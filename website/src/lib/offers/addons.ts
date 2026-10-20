import { formatDuration, formatPrice } from '@/lib/booking/format';
import type { OfferingAudience, OfferingSettings } from './offering';

/**
 * Extra's (add-ons, 20 Oct 2026). An offering marked "als extra te boeken"
 * (`isAddon`, with `addonMinutes` and a price) can be ticked by a visitor who
 * books another offering that lists it under "Extra's bij dit aanbod"
 * (`addonIds`, Beheer → Aanbod). The extra adds its minutes to the
 * appointment and its price to the total; the booking keeps a snapshot of
 * both (`cms_booking_addons`). An offering that is not `soldAlone` exists
 * only as an extra (Bikefit – tweede fiets): listed on `/aanbod`, its page
 * sends the visitor to the offering it belongs to.
 *
 * Plain module: no I/O, no Next. Unit-tested in `addons.test.ts`; shared by
 * the catalogue, the booking widget, the booking actions and the self-test.
 */

/** At most this many extras on one booking (the action schemas cap on it too). */
export const MAX_BOOKING_ADDONS = 8;

/** What the catalogue needs of an offering to offer it as an extra. */
export type AddonSource = {
  id: string;
  content: { slug: string; title: string };
  settings: Pick<OfferingSettings, 'isListed' | 'isAddon' | 'addonMinutes' | 'variants'>;
};

/** One extra as the booking widget and the actions see it. Plain data. */
export type BookingAddonOption = {
  offeringId: string;
  slug: string;
  title: string;
  /** Minutes added to the appointment. */
  minutes: number;
  /** Added to the price; never null (an extra without a price is not offered). */
  priceCents: number;
  /** "€ 85,00" */
  priceLabel: string;
};

/**
 * The price of an extra for the audience of the variant it is added to:
 * that audience's own variant, else the single option, else the first variant
 * with a price. `null` when the extra has no price at all.
 */
export function addonPriceFor(
  addon: Pick<AddonSource, 'settings'>,
  audience: OfferingAudience,
): number | null {
  const { variants } = addon.settings;
  const priced = variants.filter((variant) => variant.priceCents != null);
  const exact = priced.find((variant) => variant.audience === audience);
  const single = priced.find((variant) => variant.audience === 'all');
  return exact?.priceCents ?? single?.priceCents ?? priced[0]?.priceCents ?? null;
}

/**
 * The extras a visitor may add when booking `host` as `audience`, in the
 * host's order. An extra that is hidden, no longer marked as an extra, or
 * has no minutes or no price is left out, never shown half.
 */
export function addonOptionsFor(
  host: { id: string; settings: Pick<OfferingSettings, 'addonIds'> },
  audience: OfferingAudience,
  offerings: readonly AddonSource[],
): BookingAddonOption[] {
  const options: BookingAddonOption[] = [];
  for (const id of host.settings.addonIds) {
    if (id === host.id || options.some((option) => option.offeringId === id)) continue;
    const addon = offerings.find((entry) => entry.id === id);
    if (!addon || !addon.settings.isListed || !addon.settings.isAddon) continue;
    const minutes = addon.settings.addonMinutes;
    const priceCents = addonPriceFor(addon, audience);
    if (minutes == null || minutes <= 0 || priceCents == null) continue;
    options.push({
      offeringId: addon.id,
      slug: addon.content.slug,
      title: addon.content.title,
      minutes,
      priceCents,
      priceLabel: formatPrice(priceCents),
    });
  }
  return options;
}

export type AddonTotals = {
  /** The whole appointment. */
  minutes: number;
  /** `null` while the base price is unknown ("Prijs op aanvraag"). */
  priceCents: number | null;
  extraMinutes: number;
  extraCents: number;
};

export function addonTotals(
  base: { durationMinutes: number; priceCents: number | null },
  addons: ReadonlyArray<Pick<BookingAddonOption, 'minutes' | 'priceCents'>>,
): AddonTotals {
  const extraMinutes = addons.reduce((sum, addon) => sum + addon.minutes, 0);
  const extraCents = addons.reduce((sum, addon) => sum + addon.priceCents, 0);
  return {
    minutes: base.durationMinutes + extraMinutes,
    priceCents: base.priceCents == null ? null : base.priceCents + extraCents,
    extraMinutes,
    extraCents,
  };
}

/**
 * The extras a visitor asked for, as the options allow them: in option order,
 * each once. Refuses the whole request when one id is not an option for this
 * service (the server never books an extra it did not offer).
 */
export function pickAddons(
  options: readonly BookingAddonOption[],
  ids: readonly string[],
): { ok: true; addons: BookingAddonOption[] } | { ok: false; unknown: string[] } {
  const wanted = new Set(ids);
  const unknown = [...wanted].filter((id) => !options.some((option) => option.offeringId === id));
  if (unknown.length > 0) return { ok: false, unknown };
  return { ok: true, addons: options.filter((option) => wanted.has(option.offeringId)) };
}

/** "+ 30 min · + € 85,00" */
export function addonMetaLabel(addon: Pick<BookingAddonOption, 'minutes' | 'priceCents'>): string {
  return `+ ${formatDuration(addon.minutes)} · + ${formatPrice(addon.priceCents)}`;
}

/** "Samen 2 u 30 min · € 360,00"; the price is left out while the base price is unknown. */
export function totalsLabel(totals: Pick<AddonTotals, 'minutes' | 'priceCents'>): string {
  const duration = `Samen ${formatDuration(totals.minutes)}`;
  return totals.priceCents == null ? duration : `${duration} · ${formatPrice(totals.priceCents)}`;
}
