import { formatPostalAddress } from '@/lib/booking/format';
import type { SiteSettings } from '@/lib/cms/blocks';

/**
 * Pure helpers for the `location` block (`components/studio/blocks/location.tsx`):
 * which address lines to print, what Google is asked to pin, and the two Google
 * Maps URLs. Plain module: no I/O, no Next, no `server-only`, so the unit tests
 * and the data patch can use it.
 *
 * The address is the studio's contact setting (Instellingen → Contact), the same
 * source as the footer, so it is edited in one place and never typed into a
 * component. No street line means no place: a map pin on a town centre would
 * claim an exact address nobody gave.
 *
 * Both URLs are built from the address, URL-encoded, and are only ever used
 * after the visitor's own action: the route is a link to Google Maps, the embed
 * is mounted by the click on the map button (`location-map.tsx`).
 *
 * Content-Security-Policy: the public site has none today. If one is added, the
 * embed needs `frame-src https://www.google.com` (docs/cms-architecture.md §13).
 */

/** The part of `cms_site_settings.contact` the location block reads. */
export type ContactAddress = Pick<
  SiteSettings['contact'],
  'addressLines' | 'postalCode' | 'city' | 'country'
>;

export type StudioPlace = {
  /** Street lines as written in Instellingen, trimmed, empty ones dropped. Never empty. */
  lines: string[];
  /** "9403 Neigem": postal code and municipality; '' when both are empty. */
  postalCity: string;
  /** The whole address on one line, without the country. */
  singleLine: string;
  /** What Google is asked to pin: the address and the country's Dutch name. */
  query: string;
  /** The key-less embed (`output=embed`); only mounted after the visitor's click. */
  embedUrl: string;
  /** Google Maps itself (Maps URLs, `search`); a plain link, nothing is embedded. */
  routeUrl: string;
};

const GOOGLE_MAPS = 'https://www.google.com/maps';

/** Zoom level of the embed: the street and its surroundings. */
const EMBED_ZOOM = '15';

/**
 * `BE` → `België`. A value that is not a two-letter code is used as typed (an
 * editor may have written the name); an empty value stays empty.
 */
export function countryName(code: string): string {
  const value = code.trim();
  if (!/^[A-Za-z]{2}$/.test(value)) return value;
  const iso = value.toUpperCase();
  try {
    return new Intl.DisplayNames(['nl'], { type: 'region' }).of(iso) ?? iso;
  } catch {
    return iso;
  }
}

/**
 * The embed that pins `query`: `q=` makes Google geocode the text and drop a
 * marker, `output=embed` lets it be framed. No API key is involved.
 */
export function mapEmbedUrl(query: string): string {
  const url = new URL(GOOGLE_MAPS);
  url.searchParams.set('q', query);
  url.searchParams.set('z', EMBED_ZOOM);
  url.searchParams.set('output', 'embed');
  return url.toString();
}

/** A link that opens Google Maps on `query`, where the visitor can plan the route. */
export function mapRouteUrl(query: string): string {
  const url = new URL(`${GOOGLE_MAPS}/search/`);
  url.searchParams.set('api', '1');
  url.searchParams.set('query', query);
  return url.toString();
}

/** The place to show, or `null` while Instellingen → Contact holds no street line. */
export function studioPlace(contact: ContactAddress): StudioPlace | null {
  const lines = contact.addressLines.map((line) => line.trim()).filter(Boolean);
  if (lines.length === 0) return null;

  const postalCity = [contact.postalCode.trim(), contact.city.trim()].filter(Boolean).join(' ');
  const singleLine = formatPostalAddress({ ...contact, addressLines: lines });
  const query = [singleLine, countryName(contact.country)].filter(Boolean).join(', ');

  return {
    lines,
    postalCity,
    singleLine,
    query,
    embedUrl: mapEmbedUrl(query),
    routeUrl: mapRouteUrl(query),
  };
}
