import type { CmsLocation } from '@/db/cms-schema';

/**
 * Small display helpers shared by the booking modules, e-mails and admin UI.
 * Plain module (type-only imports).
 */

export type LocationLike = Pick<
  CmsLocation,
  'name' | 'kind' | 'addressLines' | 'postalCode' | 'city' | 'country'
>;

export type FormattedLocation = {
  /** e.g. "De Bikefit Studio, Ninove" or "Bij jou thuis". */
  label: string;
  /** Address lines only (may be empty when the address is unknown). */
  addressLines: string[];
  /** Name + address on one line, for calendar events. */
  singleLine: string;
};

export function formatLocation(location: LocationLike | null | undefined): FormattedLocation {
  if (!location) return { label: '', addressLines: [], singleLine: '' };
  if (location.kind === 'customer') {
    return { label: location.name || 'Bij jou thuis', addressLines: [], singleLine: location.name };
  }
  const cityLine = [location.postalCode, location.city].filter(Boolean).join(' ');
  const addressLines = [...(location.addressLines ?? []).filter(Boolean), cityLine].filter(Boolean);
  const singleLine = [location.name, ...addressLines].filter(Boolean).join(', ');
  return { label: location.name, addressLines, singleLine };
}

/**
 * One line of postal address from the contact settings (Instellingen →
 * Contact): "Straat 1, 9400 Ninove"; '' while nothing is filled in. The same
 * rule as a location's address in {@link formatLocation}.
 */
export function formatPostalAddress(input: {
  addressLines: readonly string[];
  postalCode: string;
  city: string;
}): string {
  const cityLine = [input.postalCode.trim(), input.city.trim()].filter(Boolean).join(' ');
  return [...input.addressLines.map((line) => line.trim()), cityLine].filter(Boolean).join(', ');
}

/**
 * `4500` → `'€ 45,00'` (nl-BE). Booking prices are cents; the legacy webshop's
 * decimal-euro prices use `formatPrice` in `src/lib/format.ts` instead.
 */
export function formatPrice(priceCents: number | null | undefined): string {
  if (priceCents == null) return '';
  return new Intl.NumberFormat('nl-BE', { style: 'currency', currency: 'EUR' }).format(
    priceCents / 100,
  );
}

/**
 * `27500` → `'€ 275'`, `7550` → `'€ 75,50'` (nl-BE): an amount as it reads in a
 * sentence, and what the copy tokens print (`{{prijs:<slug>:<audience>}}`,
 * `{{extra:…}}`; `src/lib/studio/copy-tokens.ts`). Whole euros drop the
 * decimals, any other amount keeps both. {@link formatPrice} stays as it is for
 * the structured labels (cards, the widget, the e-mails' tables).
 */
export function formatPriceInProse(priceCents: number | null | undefined): string {
  if (priceCents == null) return '';
  const digits = priceCents % 100 === 0 ? 0 : 2;
  return new Intl.NumberFormat('nl-BE', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(priceCents / 100);
}

/**
 * An admin price field → cents: "149,50" / "149.50" / "€ 150" / "150"; `null`
 * when empty, `undefined` when it is not an amount (at most two decimals).
 * Shared by Beheer → Diensten and Beheer → Aanbod.
 */
export function euroInputToCents(raw: string): number | null | undefined {
  if (!raw) return null;
  const normalized = raw.replace(/\s|€/g, '').replace(',', '.');
  if (!/^\d+(\.\d{1,2})?$/.test(normalized)) return undefined;
  return Math.round(Number(normalized) * 100);
}

/** `90` → `'1 u 30 min'`, `60` → `'1 uur'`, `45` → `'45 min'`. */
export function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m} min`;
  if (m === 0) return h === 1 ? '1 uur' : `${h} uur`;
  return `${h} u ${m} min`;
}

/**
 * A duration written out for a sentence: `15` → `'15 minuten'`, `60` → `'1 uur'`,
 * `90` → `'1 uur 30 minuten'`, `120` → `'2 uur'`. What the copy token
 * `{{extra:…}}` prints ("€ 75 en 30 minuten extra"); `{{duur:…}}` and the widget
 * keep the short {@link formatDuration}.
 */
export function formatDurationInProse(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  const parts = [
    h > 0 ? `${h} uur` : '',
    m > 0 ? (m === 1 ? '1 minuut' : `${m} minuten`) : '',
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(' ') : '0 minuten';
}

/**
 * URL-safe slug from a Dutch name: `'Fit aan huis'` → `'fit-aan-huis'`. At most
 * 80 characters; hyphens are trimmed AFTER the cut, so a truncated slug never
 * ends in `-` (the service form would refuse it).
 */
export function slugify(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .slice(0, 80)
    .replace(/^-+|-+$/g, '');
}
