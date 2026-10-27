/**
 * Initial booking data written by `scripts/cms-bootstrap.mts` (idempotent) and
 * used by `scripts/cms-seed-booking.mts`. Plain data, no I/O.
 *
 * Decided by Toshoni (24 Sep 2026): five services, prices hidden. Since 17 Oct
 * 2026 only the fits remain; since 20 Oct 2026 (Toshoni) they take 2 hours and
 * show their price. Since 27 Oct 2026 (Toshoni) there are three, so the youth
 * price is explicit everywhere: Volwassenenfit € 275 with six months of problem
 * follow-up; Jeugdfit – eenmalig € 150, under 16, one fit without follow-up;
 * Jeugdfit – volledig pakket € 275, under 16, with a year of free follow-up,
 * which the studio recommends because young riders grow fast. An existing
 * database got the values of 20 Oct with `npm run cms:patch-aanbod-prijzen`;
 * the third service and the new names reach it with the data patch of 27 Oct
 * (`cms:bootstrap` also creates a missing service, never renames one). Nothing is
 * invented beyond what Toshoni gave.
 */

export const DEFAULT_STUDIO_LOCATION = {
  name: 'De Bikefit Studio, Ninove',
  kind: 'studio' as const,
  // Halsesteenweg 406 a, 9403 Neigem, given by Toshoni on 27 Oct 2026. Neigem is part of
  // Ninove, so the name keeps "Ninove". The same address as `STUDIO_LOCATION_ADDRESS`
  // (`studio/seed-content/location-section.ts`; a domain module cannot import from there):
  // its unit test keeps the two equal.
  addressLines: ['Halsesteenweg 406 a'],
  postalCode: '9403',
  city: 'Neigem',
  country: 'BE',
  notes: null,
  isDefault: true,
  isActive: true,
  sortOrder: 0,
};

/** Where "Fit aan huis" happens: the customer's address, asked in the booking form. */
export const CUSTOMER_LOCATION = {
  name: 'Bij jou thuis',
  kind: 'customer' as const,
  addressLines: [] as string[],
  postalCode: '',
  city: '',
  country: 'BE',
  notes: 'Het adres vult de klant in bij het boeken.',
  isDefault: false,
  isActive: true,
  sortOrder: 1,
};

export type DefaultService = {
  slug: string;
  name: string;
  /** Short label under an offer with several services; '' = the name (`cms_services.choice_label`). */
  choiceLabel: string;
  description: string;
  durationMinutes: number;
  /** Price in cents shown in the booking widget when `showPrice`; `null` = "Prijs op aanvraag". */
  priceCents: number | null;
  showPrice: boolean;
  requiresGuardian: boolean;
  /** `'customer'` → linked to {@link CUSTOMER_LOCATION}; `null` → provider default. */
  location: 'customer' | null;
  sortOrder: number;
};

export const DEFAULT_SERVICES: DefaultService[] = [
  {
    slug: 'volwassenenfit',
    name: 'Volwassenenfit',
    choiceLabel: 'Volwassene',
    description:
      'De volledige bikefit op je eigen fiets, zadel-, voet- en schoenplaatjesanalyse inbegrepen. Probleemopvolging tot {{opvolging:volwassene}} na je fit is inbegrepen.',
    durationMinutes: 120,
    priceCents: 27500,
    showPrice: true,
    requiresGuardian: false,
    location: null,
    sortOrder: 0,
  },
  {
    slug: 'jeugdfit',
    name: 'Jeugdfit – eenmalig',
    choiceLabel: 'Jeugd – eenmalig',
    description:
      'Voor fietsers onder 16: één fit, zonder opvolging. Met het volledige pakket ({{prijs:bikefit-huidige-fiets:youth-package}}) krijg je {{opvolging:jeugd-pakket}} gratis opvolging; dat raden we aan, want jonge renners groeien snel.',
    durationMinutes: 120,
    priceCents: 15000,
    showPrice: true,
    requiresGuardian: true,
    location: null,
    sortOrder: 1,
  },
  {
    slug: 'jeugdfit-pakket',
    name: 'Jeugdfit – volledig pakket',
    choiceLabel: 'Jeugd – volledig pakket',
    description:
      'Voor fietsers onder 16: de volledige fit met {{opvolging:jeugd-pakket}} gratis opvolging. Aangeraden: jonge renners groeien snel, en hun fiets groeit niet vanzelf mee.',
    durationMinutes: 120,
    priceCents: 27500,
    showPrice: true,
    requiresGuardian: true,
    location: null,
    sortOrder: 2,
  },
];

/**
 * The older services that are not part of the offer (Toshoni, 17 Oct 2026:
 * "only keep what was originally in the offering"). `cms:bootstrap` no longer
 * creates them; `cms:migrate-aanbod` deactivates them on an existing database
 * (soft, like Beheer → Aanbod's delete: existing bookings keep their service)
 * and removes the hidden offerings that stood in for them.
 */
export const RETIRED_SERVICE_SLUGS = ['gezinspakket', 'fit-aan-huis', 'inspanningstest'] as const;

/** Mon–Fri 09:00–18:00, Sat 09:00–13:00 (weekday 0 = Sunday). */
export const DEFAULT_PROVIDER_HOURS = [
  ...[1, 2, 3, 4, 5].map((weekday) => ({ weekday, startMinute: 9 * 60, endMinute: 18 * 60 })),
  { weekday: 6, startMinute: 9 * 60, endMinute: 13 * 60 },
];
