import {
  formatDuration,
  formatDurationInProse,
  formatPrice,
  formatPriceInProse,
} from '@/lib/booking/format';
import type { OfferingAudience } from './offering-audience';
import type { AddonChoice, OfferingSettings } from './offering';

/**
 * Extra's (add-ons, 20 Oct 2026). An offering marked "als extra te boeken"
 * (`isAddon`) can be ticked by a visitor who books another offering that
 * lists it under "Extra's bij dit aanbod" (`addonIds`, Beheer → Aanbod). The
 * extra adds its minutes to the appointment and its price to the total; the
 * booking keeps a snapshot of both (`cms_booking_addons`). An offering that
 * is not `soldAlone` exists only as an extra (Bikefit – tweede fiets):
 * listed on `/aanbod`, its page sends the visitor to the offering it belongs
 * to.
 *
 * Choices within an extra (`addonOptions`, Toshoni 20 Oct 2026): an extra
 * may offer several choices with their own time and price ("Zelfde type
 * fiets" 30 min € 75 / "Ander type fiets" 1 u € 150). Each choice is its own
 * {@link BookingAddonOption} with the id `<offering id>#<choice key>`; the
 * visitor picks at most one per extra ({@link pickAddons} refuses two). An
 * extra without choices has one option, its id the offering id, its minutes
 * `addonMinutes` and its price the host variant's audience price.
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
  settings: Pick<
    OfferingSettings,
    'isListed' | 'isAddon' | 'addonMinutes' | 'addonOptions' | 'variants'
  >;
};

/** One extra, or one choice within an extra, as the widget and the actions see it. Plain data. */
export type BookingAddonOption = {
  /** What the visitor picks and the actions receive: the offering id, or `<offering id>#<choice key>`. */
  id: string;
  offeringId: string;
  /** The choice within the extra; `null` for an extra with one price and time. */
  optionKey: string | null;
  slug: string;
  /** An extra's own title, or "Bikefit – tweede fiets – Ander type fiets" for one of its choices. */
  title: string;
  /** The extra's own title when this is one of its choices (the widget groups them), else `null`. */
  groupTitle: string | null;
  /** The row's own text: the choice's label, else the title. */
  label: string;
  /** Minutes added to the appointment. */
  minutes: number;
  /** Added to the price; never null (an extra without a price is not offered). */
  priceCents: number;
  /** "€ 85,00" */
  priceLabel: string;
};

/** The id of a choice within an extra. */
export function addonChoiceId(offeringId: string, key: string): string {
  return `${offeringId}#${key}`;
}

/**
 * The price of an extra for the audience of the variant it is added to:
 * that audience's own variant, else the single option, else the first variant
 * with a price. `null` when the extra has no price at all.
 */
export function addonPriceFor(
  addon: Pick<AddonSource, 'settings'>,
  audience: OfferingAudience,
): number | null {
  const priced = addon.settings.variants.filter((variant) => variant.priceCents != null);
  const priceOf = (wanted: OfferingAudience) =>
    priced.find((variant) => variant.audience === wanted)?.priceCents ?? null;
  return priceOf(audience) ?? priceOf('all') ?? priced[0]?.priceCents ?? null;
}

/**
 * The options a visitor may tick when booking `host` as `audience`, in the
 * host's order: one per extra, or one per choice of an extra with choices.
 * An extra that is hidden, no longer marked as an extra, or has no minutes
 * or no price is left out, never shown half.
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
    const { slug, title } = addon.content;
    const choices = addon.settings.addonOptions ?? [];
    if (choices.length > 0) {
      for (const choice of choices) {
        const choiceId = addonChoiceId(addon.id, choice.key);
        if (options.some((option) => option.id === choiceId)) continue;
        options.push({
          id: choiceId,
          offeringId: addon.id,
          optionKey: choice.key,
          slug,
          title: `${title} – ${choice.label}`,
          groupTitle: title,
          label: choice.label,
          minutes: choice.minutes,
          priceCents: choice.priceCents,
          priceLabel: formatPrice(choice.priceCents),
        });
      }
      continue;
    }
    const minutes = addon.settings.addonMinutes;
    const priceCents = addonPriceFor(addon, audience);
    if (minutes == null || minutes <= 0 || priceCents == null) continue;
    options.push({
      id: addon.id,
      offeringId: addon.id,
      optionKey: null,
      slug,
      title,
      groupTitle: null,
      label: title,
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

export type PickAddonsResult =
  | { ok: true; addons: BookingAddonOption[] }
  /** `unknown`: ids that are no option here; `twice`: extras with more than one choice picked. */
  | { ok: false; reason: 'unknown' | 'twice'; ids: string[] };

/**
 * The options a visitor asked for, as the catalogue allows them: in option
 * order, each once, at most one choice per extra. Refuses the whole request
 * otherwise (the server never books an extra it did not offer).
 */
export function pickAddons(
  options: readonly BookingAddonOption[],
  ids: readonly string[],
): PickAddonsResult {
  const wanted = [...new Set(ids)];
  const unknown = wanted.filter((id) => !options.some((option) => option.id === id));
  if (unknown.length > 0) return { ok: false, reason: 'unknown', ids: unknown };
  const addons = options.filter((option) => wanted.includes(option.id));
  const seen = new Set<string>();
  const twice = new Set<string>();
  for (const addon of addons) {
    if (seen.has(addon.offeringId)) twice.add(addon.offeringId);
    seen.add(addon.offeringId);
  }
  if (twice.size > 0) return { ok: false, reason: 'twice', ids: [...twice] };
  return { ok: true, addons };
}

/** Ticking an option: in or out; a choice takes the place of its siblings (one per extra). */
export function toggleAddonId(
  options: readonly BookingAddonOption[],
  selected: readonly string[],
  id: string,
): string[] {
  const option = options.find((entry) => entry.id === id);
  if (!option) return [...selected];
  if (selected.includes(id)) return selected.filter((entry) => entry !== id);
  const siblings = new Set(
    options.filter((entry) => entry.offeringId === option.offeringId).map((entry) => entry.id),
  );
  return [...selected.filter((entry) => !siblings.has(entry)), id];
}

/** `?extra=<slug>`: the first option of each named extra (its first choice), in option order. */
export function preselectAddonIds(
  options: readonly BookingAddonOption[],
  slugs: readonly string[],
): string[] {
  const ids: string[] = [];
  const seen = new Set<string>();
  for (const option of options) {
    if (!slugs.includes(option.slug) || seen.has(option.offeringId)) continue;
    seen.add(option.offeringId);
    ids.push(option.id);
  }
  return ids;
}

/** "+ 30 min · + € 85,00" */
export function addonMetaLabel(addon: Pick<BookingAddonOption, 'minutes' | 'priceCents'>): string {
  return `+ ${formatDuration(addon.minutes)} · + ${formatPrice(addon.priceCents)}`;
}

/**
 * "€ 75 en 30 minuten extra": the same two facts as {@link addonMetaLabel}, price
 * first, written for a sentence (copy token `{{extra:<slug>[:<choice key>]}}`,
 * 27 Oct 2026). No label and no total: the sentence names the choice itself.
 */
export function addonProseLabel(addon: Pick<BookingAddonOption, 'minutes' | 'priceCents'>): string {
  return `${formatPriceInProse(addon.priceCents)} en ${formatDurationInProse(addon.minutes)} extra`;
}

/** "Samen 2 u 30 min · € 360,00"; the price is left out while the base price is unknown. */
export function totalsLabel(totals: Pick<AddonTotals, 'minutes' | 'priceCents'>): string {
  const duration = `Samen ${formatDuration(totals.minutes)}`;
  return totals.priceCents == null ? duration : `${duration} · ${formatPrice(totals.priceCents)}`;
}

/** "Zelfde type fiets € 75,00 · Ander type fiets € 150,00" — the Kostprijs line of an extra with choices. */
export function addonChoicesPriceLabel(choices: readonly AddonChoice[]): string {
  return choices.map((choice) => `${choice.label} ${formatPrice(choice.priceCents)}`).join(' · ');
}

/** "Zelfde type fiets: 30 min · Ander type fiets: 1 uur" — the Duur line of an extra with choices. */
export function addonChoicesDurationLabel(choices: readonly AddonChoice[]): string {
  return choices.map((choice) => `${choice.label}: ${formatDuration(choice.minutes)}`).join(' · ');
}
