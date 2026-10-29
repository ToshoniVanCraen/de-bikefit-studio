import { z } from 'zod';
import {
  AUDIENCE_LABELS,
  OFFERING_AUDIENCES,
  OFFERING_VARIANT_MODES,
  audiencesFor,
  isAcceptedAudienceSet,
  type OfferingAudience,
  type OfferingVariantMode,
} from './offering-audience';

// The audiences and the Kostprijs / Duur lines live in two small siblings (this file is past
// the size limit). What callers imported from here stays here; the newer helpers
// (`isSplitAudience`, `audienceRank`, …) come from `./offering-audience`. Named, not
// `export *`: the CLIs (tsx, CommonJS output) only see names that are spelled out.
export {
  AUDIENCE_LABELS,
  OFFERING_AUDIENCES,
  OFFERING_VARIANT_MODES,
  audiencesFor,
  type OfferingAudience,
  type OfferingVariantMode,
} from './offering-audience';
export {
  offeringDurationLabel,
  offeringPriceLabel,
  offeringPriceText,
  variantPriceLabel,
} from './offering-labels';

/**
 * Offering settings — what Beheer → Aanbod decides per offering (its copy is
 * `./offering-content.ts`; both live on the same `cms_offerings` row).
 *
 * Plain module: no I/O, no Next, no `server-only`. Unit-tested in
 * `offering.test.ts`; shared by the public blocks, the booking block, the
 * admin screen, the migration script and the self-test.
 *
 * Per offering, in ONE place (tables `cms_offerings` + `cms_offering_variants`,
 * `src/db/cms-offering-schema.ts`):
 *
 *  - `isListed`: shown on the website (overviews, its own page, `/afspraak`);
 *  - `variantMode`: `single` (one option) or `audience` (Volwassene and Jeugd –
 *    eenmalig apart, each its own booking service, duration and price;
 *    `./offering-audience.ts`);
 *  - `bookingMode`: `direct` (online booking through `/afspraak?dienst=<slug>`)
 *    or `enquiry` (the enquiry form on the offer page);
 *  - per variant: the booking service (`cms_services`) it is booked as, and its
 *    public price in cents (`null` = "Prijs op aanvraag", never € 0).
 *
 * Whether a direct offering is bookable RIGHT NOW is not stored: a variant is
 * bookable when its service is active and at least one active provider (with an
 * active account) is subscribed to it, the same rule as `listPublicServices()`.
 * A direct offering without any bookable variant is `unavailable` (temporarily,
 * shown greyed out), which is different from `enquiry` (on purpose).
 */

export const OFFERING_BOOKING_MODES = ['direct', 'enquiry'] as const;
export type OfferingBookingMode = (typeof OFFERING_BOOKING_MODES)[number];

/** € 10.000,00: a technical upper bound, not a business rule. */
export const OFFERING_MAX_PRICE_CENTS = 1_000_000;

/** At most this many extras linked to one offering. */
export const OFFERING_MAX_ADDONS = 12;
/** At most this many choices within one extra (the admin card shows this many rows). */
export const OFFERING_MAX_ADDON_CHOICES = 4;

/**
 * A choice within an extra (20 Oct 2026): "Zelfde type fiets" 30 min € 75 /
 * "Ander type fiets" 1 u € 150. `key` is a slug derived from the label, stable
 * across saves, and part of what the widget sends (`<offering id>#<key>`).
 */
export type AddonChoice = { key: string; label: string; minutes: number; priceCents: number };

/** `addon`: not sold alone — only ticked as an extra when booking another offering (20 Oct 2026). */
export type OfferingStatus = 'bookable' | 'unavailable' | 'enquiry' | 'addon';

/** Shown on cards, the offer page and in Beheer. */
export const OFFERING_STATUS_LABELS: Record<OfferingStatus, string> = {
  bookable: 'Online te boeken',
  unavailable: 'Tijdelijk niet online te boeken',
  enquiry: 'Op aanvraag',
  addon: 'Enkel als extra bij een afspraak',
};

export type OfferingVariant = {
  audience: OfferingAudience;
  serviceId: string | null;
  priceCents: number | null;
};

export type OfferingSettings = {
  isListed: boolean;
  bookingMode: OfferingBookingMode;
  variantMode: OfferingVariantMode;
  /** Exactly the audiences of `variantMode`, in that order (`isAcceptedAudienceSet`). */
  variants: OfferingVariant[];
  /** Can be ticked as an extra when booking an offering that lists it (20 Oct 2026). */
  isAddon: boolean;
  /** Booked or asked for on its own; `false` = an extra only (needs `isAddon`). */
  soldAlone: boolean;
  /** Minutes an extra adds to the appointment; `null` unless `isAddon`. */
  addonMinutes: number | null;
  /** "Extra's bij dit aanbod": ids of the extras a visitor may add, in order. */
  addonIds: string[];
  /** Choices within this extra, in order; empty = one price (the variants') and one time (`addonMinutes`). */
  addonOptions: AddonChoice[];
};

/** `stored` = a `cms_offerings` row; `legacy` = derived from the offer block (no row yet). */
export type OfferingSource = 'stored' | 'legacy';

// ---------------------------------------------------------------------------
// Validation (Beheer → Aanbod)
// ---------------------------------------------------------------------------

/**
 * The booking facts of one variant, written to its `cms_services` row by the
 * same save (17 Oct 2026: Diensten folded into Aanbod). Name, label and slug
 * of that row follow the offering; these four are the admin's per variant.
 */
export const variantServiceInputSchema = z.object({
  durationMinutes: z
    .number()
    .int('De duur moet een geheel aantal minuten zijn.')
    .min(5, 'De duur is minstens 5 minuten.')
    .max(720, 'De duur is maximaal 12 uur.'),
  /** `null` → the `booking` setting's default buffer. */
  bufferAfterMinutes: z
    .number()
    .int('De buffer moet een geheel aantal minuten zijn.')
    .min(0, 'De buffer kan niet negatief zijn.')
    .max(240, 'De buffer is maximaal 4 uur.')
    .nullable()
    .default(null),
  /** `null` → the provider's default location. */
  locationId: z.string().trim().min(1).max(64, 'Ongeldige locatie.').nullable().default(null),
});

export type VariantServiceInput = z.infer<typeof variantServiceInputSchema>;

const addonChoiceSchema = z.object({
  key: z
    .string()
    .trim()
    .min(1, 'Ongeldige keuze.')
    .max(40, 'Ongeldige keuze.')
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Ongeldige keuze.'),
  label: z
    .string()
    .trim()
    .min(1, 'Geef elke keuze een naam.')
    .max(60, 'De naam van een keuze is te lang (max. 60 tekens).'),
  minutes: z
    .number()
    .int('De tijd van een keuze moet een geheel aantal minuten zijn.')
    .min(5, 'Een keuze duurt minstens 5 minuten.')
    .max(720, 'Een keuze duurt maximaal 12 uur.'),
  priceCents: z
    .number()
    .int('Geef de prijs van elke keuze in euro.')
    .min(1, 'Elke keuze heeft een prijs nodig.')
    .max(OFFERING_MAX_PRICE_CENTS, 'De prijs is te hoog.'),
});

/** Stored choices, read defensively: anything malformed reads as no choices. */
export function parseAddonChoices(value: unknown): AddonChoice[] {
  const parsed = z.array(addonChoiceSchema).safeParse(value ?? []);
  if (!parsed.success) return [];
  const seen = new Set<string>();
  return parsed.data.filter((choice) => !seen.has(choice.key) && seen.add(choice.key));
}

const variantSchema = z.object({
  audience: z.enum(OFFERING_AUDIENCES),
  /** The existing service row of this variant, if any (kept; never re-created). */
  serviceId: z.string().trim().max(64, 'Ongeldige dienst.').nullable().default(null),
  priceCents: z
    .number()
    .int('Geef de prijs in euro, bv. 150 of 149,50.')
    .min(1, 'Een prijs van € 0 kan niet; laat het veld leeg voor “Prijs op aanvraag”.')
    .max(OFFERING_MAX_PRICE_CENTS, 'De prijs is te hoog.')
    .nullable()
    .default(null),
  /** Required for direct booking; ignored (kept as it was) for an enquiry. */
  service: variantServiceInputSchema.nullable().default(null),
});

export const offeringInputSchema = z
  .object({
    isListed: z.boolean(),
    bookingMode: z.enum(OFFERING_BOOKING_MODES),
    variantMode: z.enum(OFFERING_VARIANT_MODES),
    variants: z.array(variantSchema).max(OFFERING_AUDIENCES.length),
    isAddon: z.boolean().default(false),
    soldAlone: z.boolean().default(true),
    addonMinutes: z
      .number()
      .int('De extra tijd moet een geheel aantal minuten zijn.')
      .min(5, 'De extra tijd is minstens 5 minuten.')
      .max(720, 'De extra tijd is maximaal 12 uur.')
      .nullable()
      .default(null),
    addonIds: z
      .array(z.string().trim().min(1).max(64, 'Ongeldige extra.'))
      .max(OFFERING_MAX_ADDONS, `Maximaal ${OFFERING_MAX_ADDONS} extra’s per aanbod.`)
      .default([]),
    addonOptions: z
      .array(addonChoiceSchema)
      .max(OFFERING_MAX_ADDON_CHOICES, `Maximaal ${OFFERING_MAX_ADDON_CHOICES} keuzes per extra.`)
      .default([]),
  })
  .superRefine((value, ctx) => {
    const given = value.variants.map((variant) => variant.audience);
    if (!isAcceptedAudienceSet(value.variantMode, given)) {
      ctx.addIssue({
        code: 'custom',
        message: 'De varianten passen niet bij de gekozen opdeling.',
      });
      return;
    }
    if (value.bookingMode === 'direct') {
      for (const variant of value.variants) {
        if (!variant.service) {
          const which = AUDIENCE_LABELS[variant.audience];
          ctx.addIssue({
            code: 'custom',
            message: which
              ? `Vul voor ${which} de duur in om het online te boeken.`
              : 'Vul de duur in om dit aanbod online te boeken.',
          });
        }
      }
    }
    const services = value.variants
      .map((variant) => variant.serviceId)
      .filter((id): id is string => Boolean(id));
    if (new Set(services).size !== services.length) {
      ctx.addIssue({
        code: 'custom',
        message: 'Elke variant heeft een eigen dienst nodig (eigen duur en formulier).',
      });
    }
    if (value.isAddon) {
      // With choices each choice carries its own time and price; without, the
      // extra needs the extra time and a price on every variant.
      const choices = value.addonOptions.length > 0;
      if (!choices && value.addonMinutes == null) {
        ctx.addIssue({
          code: 'custom',
          message: 'Vul in hoeveel minuten deze extra bij een afspraak komt, of geef keuzes op.',
        });
      }
      if (!choices && value.variants.some((variant) => variant.priceCents == null)) {
        ctx.addIssue({
          code: 'custom',
          message: 'Een extra heeft een prijs nodig; zonder prijs kan ze niet mee geboekt worden.',
        });
      }
      const keys = value.addonOptions.map((choice) => choice.key);
      if (new Set(keys).size !== keys.length) {
        ctx.addIssue({ code: 'custom', message: 'Twee keuzes hebben dezelfde naam.' });
      }
    } else if (!value.soldAlone) {
      ctx.addIssue({
        code: 'custom',
        message: 'Een aanbod dat niet apart te boeken is, moet een extra zijn.',
      });
    }
    if (new Set(value.addonIds).size !== value.addonIds.length) {
      ctx.addIssue({ code: 'custom', message: 'Een extra staat dubbel in de lijst.' });
    }
  });

export type OfferingInput = z.input<typeof offeringInputSchema>;

export type ValidatedOfferingInput = {
  settings: OfferingSettings;
  /** Per audience of the mode: the service facts to write, or `null` (enquiry, nothing given). */
  services: Partial<Record<OfferingAudience, VariantServiceInput | null>>;
};

export function validateOfferingInput(
  raw: unknown,
): { ok: true; data: ValidatedOfferingInput } | { ok: false; message: string } {
  const parsed = offeringInputSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      message: [...new Set(parsed.error.issues.map((i) => i.message))].join(' '),
    };
  }
  const data = parsed.data;
  const services: ValidatedOfferingInput['services'] = {};
  for (const variant of data.variants) services[variant.audience] = variant.service;
  return {
    ok: true,
    data: {
      settings: {
        isListed: data.isListed,
        bookingMode: data.bookingMode,
        variantMode: data.variantMode,
        variants: data.variants.map((variant) => ({
          audience: variant.audience,
          serviceId: variant.serviceId || null,
          priceCents: variant.priceCents,
        })),
        isAddon: data.isAddon,
        soldAlone: data.isAddon ? data.soldAlone : true,
        addonMinutes: data.isAddon ? data.addonMinutes : null,
        addonIds: data.addonIds,
        addonOptions: data.isAddon ? data.addonOptions : [],
      },
      services,
    },
  };
}

/**
 * Settings from stored rows. Defensive: an unknown mode reads as the safe
 * default (`enquiry`, `single`), a missing variant row as "no service, no
 * price", and rows of audiences the mode does not use are ignored (they stay
 * in the table until the next save rewrites the variants).
 */
export function settingsFromRows(
  row: {
    isListed: boolean;
    bookingMode: string;
    variantMode: string;
    isAddon?: boolean;
    soldAlone?: boolean;
    addonMinutes?: number | null;
    /** The `addon_options` jsonb column, parsed defensively. */
    addonOptions?: unknown;
  },
  variantRows: ReadonlyArray<{
    audience: string;
    serviceId: string | null;
    priceCents: number | null;
  }>,
  /** The linked extras (`cms_offering_addons`), in order. */
  addonIds: readonly string[] = [],
): OfferingSettings {
  const bookingMode: OfferingBookingMode = row.bookingMode === 'direct' ? 'direct' : 'enquiry';
  const variantMode: OfferingVariantMode = row.variantMode === 'audience' ? 'audience' : 'single';
  const isAddon = row.isAddon === true;
  const minutes = row.addonMinutes;
  return {
    isListed: row.isListed,
    bookingMode,
    variantMode,
    isAddon,
    // An offering that is neither an extra nor sold alone would be unreachable: it reads as sold alone.
    soldAlone: isAddon ? row.soldAlone !== false : true,
    addonMinutes:
      isAddon && typeof minutes === 'number' && Number.isInteger(minutes) && minutes >= 5
        ? minutes
        : null,
    addonIds: [...new Set(addonIds)],
    addonOptions: isAddon ? parseAddonChoices(row.addonOptions) : [],
    variants: audiencesFor(variantMode).map((audience) => {
      const found = variantRows.find((entry) => entry.audience === audience);
      const price = found?.priceCents ?? null;
      return {
        audience,
        serviceId: found?.serviceId ?? null,
        priceCents: price != null && price >= 1 ? price : null,
      };
    }),
  };
}

// ---------------------------------------------------------------------------
// The service facts an offering needs (`cms_services`, any provider count)
// ---------------------------------------------------------------------------

export type OfferingServiceInfo = {
  id: string;
  slug: string;
  name: string;
  choiceLabel: string;
  durationMinutes: number;
  isActive: boolean;
  requiresGuardian: boolean;
  priceCents: number | null;
  showPrice: boolean;
};

// ---------------------------------------------------------------------------
// Resolution: settings + services + who offers what → what the public sees
// ---------------------------------------------------------------------------

export type ResolvedVariant = {
  audience: OfferingAudience;
  /** "Volwassene", "Jeugd – eenmalig"; '' for the single option. */
  label: string;
  serviceId: string | null;
  serviceSlug: string | null;
  serviceName: string | null;
  /** From the active service; `null` without one. */
  durationMinutes: number | null;
  requiresGuardian: boolean;
  priceCents: number | null;
  /** Direct mode, active service, ≥ 1 active provider subscribed. */
  bookable: boolean;
};

export type ResolvedOffering = {
  source: OfferingSource;
  isListed: boolean;
  bookingMode: OfferingBookingMode;
  variantMode: OfferingVariantMode;
  status: OfferingStatus;
  variants: ResolvedVariant[];
  isAddon: boolean;
  soldAlone: boolean;
  addonMinutes: number | null;
  addonIds: string[];
  addonOptions: AddonChoice[];
};

export function resolveOffering(input: {
  settings: OfferingSettings;
  source: OfferingSource;
  services: readonly OfferingServiceInfo[];
  /** Services that are public on `/afspraak` (active, offered by an active provider). */
  bookableServiceIds: ReadonlySet<string>;
}): ResolvedOffering {
  const { settings } = input;
  const direct = settings.bookingMode === 'direct';
  const variants: ResolvedVariant[] = settings.variants.map((variant) => {
    const service = variant.serviceId
      ? (input.services.find((entry) => entry.id === variant.serviceId) ?? null)
      : null;
    const active = Boolean(service?.isActive);
    return {
      audience: variant.audience,
      label: AUDIENCE_LABELS[variant.audience],
      serviceId: variant.serviceId,
      serviceSlug: service?.slug ?? null,
      serviceName: service?.name ?? null,
      durationMinutes: active && service ? service.durationMinutes : null,
      requiresGuardian: Boolean(service?.requiresGuardian),
      priceCents: variant.priceCents,
      bookable: direct && active && Boolean(service) && input.bookableServiceIds.has(service!.id),
    };
  });
  // An extra that is not sold alone is never booked on its own, whatever its booking mode.
  const addonOnly = settings.isAddon === true && settings.soldAlone === false;
  const status: OfferingStatus = addonOnly
    ? 'addon'
    : !direct
      ? 'enquiry'
      : variants.some((variant) => variant.bookable)
        ? 'bookable'
        : 'unavailable';
  return {
    source: input.source,
    isListed: settings.isListed,
    bookingMode: settings.bookingMode,
    variantMode: settings.variantMode,
    status,
    variants,
    isAddon: settings.isAddon === true,
    soldAlone: !addonOnly,
    addonMinutes: settings.addonMinutes ?? null,
    addonIds: [...(settings.addonIds ?? [])],
    addonOptions: settings.isAddon === true ? [...(settings.addonOptions ?? [])] : [],
  };
}

// The Kostprijs and Duur lines of an offering: `./offering-labels.ts` (re-exported above).

/**
 * The booking-service slugs `/afspraak` may use for this offering, in variant
 * order: only bookable variants of a listed, bookable offering. Empty for an
 * enquiry, unavailable or hidden offering, so the booking page never offers
 * another service in its place.
 */
export function offeringBookingSlugs(
  offering: Pick<ResolvedOffering, 'isListed' | 'status' | 'variants'>,
): string[] {
  if (!offering.isListed || offering.status !== 'bookable') return [];
  return offering.variants
    .filter((variant) => variant.bookable && variant.serviceSlug)
    .map((variant) => variant.serviceSlug!);
}

/**
 * Services an offering holds back from `/afspraak`: a service that is a
 * variant of some offering is booked through an offering only — when none of
 * the offerings that use it is shown on the website (published and listed)
 * and booked directly, the widget does not offer it on its own either, and
 * the server refuses it. Services no offering uses stay bookable on their own
 * (Gezinspakket, Fit aan huis, Inspanningstest), as before.
 */
export function withheldServiceIds(
  offerings: ReadonlyArray<{
    visible: boolean;
    settings: Pick<OfferingSettings, 'bookingMode' | 'variants'> & { soldAlone?: boolean };
  }>,
): Set<string> {
  const claimed = new Set<string>();
  const offered = new Set<string>();
  for (const offering of offerings) {
    for (const variant of offering.settings.variants) {
      if (!variant.serviceId) continue;
      claimed.add(variant.serviceId);
      if (
        offering.visible &&
        offering.settings.bookingMode === 'direct' &&
        offering.settings.soldAlone !== false
      ) {
        offered.add(variant.serviceId);
      }
    }
  }
  return new Set([...claimed].filter((id) => !offered.has(id)));
}
