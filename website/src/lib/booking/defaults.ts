/**
 * Initial booking data written by `scripts/cms-bootstrap.mts` (idempotent) and
 * used by `scripts/cms-seed-booking.mts`. Plain data, no I/O.
 *
 * Decided by Toshoni (24 Sep 2026): five services, prices hidden. Since 17 Oct
 * 2026 only the two fits remain; since 20 Oct 2026 (Toshoni) both take 2 hours
 * and show their price: € 275, under 16 € 150 without the six-month problem
 * follow-up. An existing database gets those values with
 * `npm run cms:patch-aanbod-prijzen`. Nothing is invented beyond what Toshoni
 * gave.
 */

export const DEFAULT_STUDIO_LOCATION = {
  name: 'De Bikefit Studio, Ninove',
  kind: 'studio' as const,
  // The street address is not known yet (see docs/cms-architecture.md §13).
  addressLines: [] as string[],
  postalCode: '',
  city: 'Ninove',
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
      'De volledige bikefit op je eigen fiets, zadel-, voet- en schoenplaatjesanalyse inbegrepen. Probleemopvolging tot zes maanden na je fit is inbegrepen.',
    durationMinutes: 120,
    priceCents: 27500,
    showPrice: true,
    requiresGuardian: false,
    location: null,
    sortOrder: 0,
  },
  {
    slug: 'jeugdfit',
    name: 'Jeugdfit',
    choiceLabel: 'Jeugd',
    description:
      'Voor fietsers onder 16: dezelfde fit, afgestemd op een lichaam in groei, zonder probleemopvolging. Met opvolging kies je Volwassene (€ 275).',
    durationMinutes: 120,
    priceCents: 15000,
    showPrice: true,
    requiresGuardian: true,
    location: null,
    sortOrder: 1,
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
