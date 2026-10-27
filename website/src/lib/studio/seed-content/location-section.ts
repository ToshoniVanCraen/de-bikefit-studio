import { LOCATION_DEFAULTS } from '@/lib/cms/blocks-location';
import type { SeedBlock } from './shared';

/**
 * The studio's street address and the "Locatie" section of `/afspraak`
 * (Toshoni, 27 Oct 2026: "On the contact page, add a section about Location,
 * with a small Google Maps element with the location pinned, as well as text
 * with the exact address. Write this address in the footer as well instead of
 * Ninove", with Halsesteenweg 406 a in Neigem, and later that day a line about
 * the parking). The postal code is Neigem's own, 9403: the one in the first
 * message belongs to other villages and was corrected the same day. Plain data,
 * no I/O.
 *
 * Neigem belongs to Ninove, so the booking location keeps its name "De Bikefit
 * Studio, Ninove" and only gains the address.
 *
 * Who uses what:
 *  - `cms:seed` publishes {@link LOCATION_BLOCK} as the last block of `/afspraak`
 *    (`appointment.ts`);
 *  - `cms:patch-aanbod-correcties` (an existing database) writes
 *    {@link STUDIO_CONTACT_ADDRESS} into Instellingen → Contact (the footer, the
 *    JSON-LD postal address, the e-mail footers and the `location` block all read
 *    it), {@link STUDIO_LOCATION_ADDRESS} into the location "De Bikefit Studio,
 *    Ninove" (Beheer → Locaties) and inserts {@link LOCATION_BLOCK} on
 *    `/afspraak` (`AFSPRAAK_PAGE.slug`) after its last block, unless the page
 *    already holds a `location` block. Deploy this code before publishing that
 *    page: a snapshot with a block type the running code does not know counts as
 *    unpublished (docs/cms-architecture.md §5).
 *
 * Before this change both addresses held no street, no postal code and the city
 * "Ninove" (the guard values for a patch that must not overwrite an editor's
 * own edit). The booking location default in `lib/booking/defaults.ts` repeats
 * these values (a domain module cannot import from here, B5); the unit test
 * keeps the two in step.
 */

export type StudioAddress = {
  addressLines: readonly string[];
  postalCode: string;
  city: string;
  /** ISO country code, as Instellingen → Contact and `cms_locations` store it. */
  country: string;
};

/** Instellingen → Contact: `addressLines`, `postalCode`, `city`, `country`. */
export const STUDIO_CONTACT_ADDRESS: StudioAddress = {
  addressLines: ['Halsesteenweg 406 a'],
  postalCode: '9403',
  city: 'Neigem',
  country: 'BE',
};

/** The location "De Bikefit Studio, Ninove" (`cms_locations`): the same place, same columns. */
export const STUDIO_LOCATION_ADDRESS: StudioAddress = STUDIO_CONTACT_ADDRESS;

/**
 * The section to insert, with every field explicit so a validated copy equals
 * it (the patch compares stored data to this). The address is not in the block:
 * it is read from the settings above.
 */
export const LOCATION_BLOCK: SeedBlock = {
  type: 'location',
  data: {
    variant: 'gray',
    eyebrow: 'Locatie',
    title: LOCATION_DEFAULTS.title,
    intro: '',
    note: LOCATION_DEFAULTS.note,
    showMap: true,
    mapLabel: LOCATION_DEFAULTS.mapLabel,
    routeLabel: LOCATION_DEFAULTS.routeLabel,
  },
};
