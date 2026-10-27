import { z } from 'zod';
import { LEGAL_IDENTITY } from '@/lib/studio/legal';
import { RULE_MONTHS_MAX, RULE_MONTHS_MIN } from '@/lib/studio/months-in-words';

/**
 * Site settings: the `(locale, key) -> jsonb` store `cms_site_settings`, one zod
 * schema per key. Plain module (zod and the legal constants only, no I/O), split
 * out of `blocks.ts` on 27 Oct 2026 (that file was far past the size limit,
 * docs/engineering-best-practices.md S1) and re-exported from there, so
 * `@/lib/cms/blocks` stays the import path of every caller.
 *
 * Every field has a default, so a missing row (an existing database that never
 * got the key) behaves exactly like the documented defaults:
 * `getSiteSettings()` (`content.ts`) starts from {@link defaultSiteSettings} and
 * lays the stored rows over it. A stored value that no longer validates falls
 * back to the defaults of the WHOLE key ({@link parseSiteSetting}), which is why
 * the settings action checks a form against the schema itself before it saves.
 *
 * **One master per fact (27 Oct 2026).** The groups below are the masters of the
 * facts that copy refers to through tokens (`src/lib/studio/copy-tokens.ts`):
 * `contact` (phone, e-mail, the studio's address), `business` (the legal
 * identity), `rules` (the lengths of follow-up, free second visit and voucher
 * validity). Copy types none of them again.
 */

/** A length in `rules`: whole months within `RULE_MONTHS_MIN`..`RULE_MONTHS_MAX`. */
const rulesMonths = (fallback: number) =>
  z
    .number({ error: 'Geef een geheel aantal maanden.' })
    .int('Geef een geheel aantal maanden.')
    .min(RULE_MONTHS_MIN, `Minstens ${RULE_MONTHS_MIN} maand.`)
    .max(RULE_MONTHS_MAX, `Maximaal ${RULE_MONTHS_MAX} maanden.`)
    .default(fallback);

/**
 * `cms_site_settings` is a `(locale, key) -> jsonb` store. Each key's value is
 * validated by its own schema below. Beheer → Instellingen renders a form per
 * key (`src/components/admin/settings-forms.tsx`); the public site reads them
 * through `getSiteSettings(locale)`.
 */
export const siteSettingSchemas = {
  site: z.object({
    name: z.string().default('De Bikefit Studio'),
    /** The one-liner under the name: the share image and the JSON-LD slogan. */
    tagline: z.string().default('Pijnvrij fietsen begint hier'),
    mission: z.string().default(''),
    logoMediaId: z.string().nullable().default(null),
  }),
  contact: z.object({
    phoneLabel: z.string().default(''),
    phoneHref: z.string().default(''),
    email: z.string().default(''),
    addressLines: z.array(z.string()).default([]),
    postalCode: z.string().default(''),
    city: z.string().default(''),
    /** ISO country code for the JSON-LD postal address. */
    country: z.string().default('BE'),
    hours: z.string().default(''),
    website: z.string().default(''),
  }),
  seo: z.object({
    defaultMetaTitle: z.string().default(''),
    titleTemplate: z.string().default('%s · De Bikefit Studio'),
    defaultMetaDescription: z.string().default(''),
    defaultOgImageMediaId: z.string().nullable().default(null),
    /** Staging must never be indexed; flipped on for production. */
    allowIndexing: z.boolean().default(false),
  }),
  organization: z.object({
    /** schema.org type for the site-wide JSON-LD. */
    type: z.string().default('LocalBusiness'),
    // `legalName` and `vatNumber` moved to `business` on 27 Oct 2026 (one master
    // per fact); a stored value is ignored.
    sameAs: z.array(z.string()).default([]),
    priceRange: z.string().default(''),
    areaServed: z.array(z.string()).default([]),
    latitude: z.number().nullable().default(null),
    longitude: z.number().nullable().default(null),
  }),
  analytics: z.object({
    // The measurement id is NOT a setting: the tag reads the environment variable
    // `NEXT_PUBLIC_GA4_MEASUREMENT_ID`, and nothing ships until `enabled` is on.
    /** Numeric GA4 property id for the Data API (admin dashboard); env `GA4_PROPERTY_ID` wins. */
    ga4PropertyId: z.string().default(''),
    enabled: z.boolean().default(false),
  }),
  /**
   * Booking rules (Worker A, `src/lib/booking/settings.ts`). Every field has a
   * default so a missing row behaves exactly like the documented defaults.
   */
  booking: z.object({
    slotStepMinutes: z.number().int().min(5).max(240).default(30),
    minNoticeHours: z
      .number()
      .int()
      .min(0)
      .max(24 * 60)
      .default(24),
    horizonDays: z.number().int().min(1).max(730).default(56),
    defaultBufferAfterMinutes: z.number().int().min(0).max(240).default(15),
    cancelUntilHours: z
      .number()
      .int()
      .min(0)
      .max(24 * 60)
      .default(48),
    timezone: z.string().min(1).default('Europe/Brussels'),
    introTitle: z.string().default('Maak een afspraak'),
    introText: z.string().default(''),
    confirmationText: z
      .string()
      .default(
        'Je ontvangt een uitnodiging in je mailbox. Daarin vind je alle details en een link om te annuleren.',
      ),
    showProviderChoice: z.boolean().default(true),
  }),
  /**
   * The legal identity behind the studio (27 Oct 2026): the master of
   * `{{bedrijf}}`, `{{zetel}}`, `{{kbo}}` and `{{btw}}`, which the privacy
   * statement, the terms and the e-mails refer to, and of the JSON-LD
   * Organization's legal name and VAT id. The defaults are `LEGAL_IDENTITY`
   * (`src/lib/studio/legal.ts`), so a database without the row shows the same
   * facts as before. The enterprise (KBO) number is also the VAT number.
   */
  business: z.object({
    /** Legal name including the legal form, e.g. "Qarakter BV". */
    legalName: z
      .string()
      .max(120, 'De naam is te lang (max. 120 tekens).')
      .default(LEGAL_IDENTITY.name),
    /** Registered office (maatschappelijke zetel): street lines, then postal code and municipality. */
    seatAddressLines: z
      .array(z.string().max(120, 'Een adresregel is te lang (max. 120 tekens).'))
      .max(4, 'Maximaal 4 adresregels.')
      .default(() => [LEGAL_IDENTITY.street]),
    seatPostalCode: z
      .string()
      .max(20, 'De postcode is te lang.')
      .default(LEGAL_IDENTITY.postalCode),
    seatCity: z.string().max(120, 'De gemeente is te lang.').default(LEGAL_IDENTITY.city),
    /** ISO country code. */
    seatCountry: z
      .string()
      .max(2, 'Gebruik een landcode van 2 letters, bv. BE.')
      .default(LEGAL_IDENTITY.country),
    /** Ondernemingsnummer (KBO), as it is written: "BE 1036.912.281". */
    enterpriseNumber: z
      .string()
      .max(30, 'Het ondernemingsnummer is te lang.')
      .default(LEGAL_IDENTITY.kbo),
    /** Btw-nummer, as it is written. */
    vatNumber: z.string().max(30, 'Het btw-nummer is te lang.').default(LEGAL_IDENTITY.kbo),
  }),
  /**
   * The lengths that copy states in words (27 Oct 2026): `{{opvolging:volwassene}}`,
   * `{{opvolging:jeugd-pakket}}`, `{{tweede-bezoek-gratis}}` and
   * `{{cadeaubon-geldigheid}}` print them through `monthsInWords()`
   * (`src/lib/studio/months-in-words.ts`: 6 → "zes maanden", 12 → "een jaar").
   * They are the studio's decisions as text; nothing computes with them.
   */
  rules: z.object({
    /** Problem follow-up included with an adult fit. */
    followUpMonthsAdult: rulesMonths(6),
    /** Follow-up included with the full Jeugd package. */
    followUpMonthsYouthPackage: rulesMonths(12),
    /** A second visit within this long after the fit is free. */
    secondVisitFreeMonths: rulesMonths(6),
    /** How long a gift voucher is valid after purchase. */
    voucherValidityMonths: rulesMonths(12),
  }),
} as const;

export type SiteSettingKey = keyof typeof siteSettingSchemas;
export const SITE_SETTING_KEYS = Object.keys(siteSettingSchemas) as SiteSettingKey[];

export type SiteSettings = {
  [K in SiteSettingKey]: z.infer<(typeof siteSettingSchemas)[K]>;
};

export function isSiteSettingKey(value: string): value is SiteSettingKey {
  return Object.prototype.hasOwnProperty.call(siteSettingSchemas, value);
}

/** Parses a stored value, falling back to the schema defaults when invalid. */
export function parseSiteSetting<K extends SiteSettingKey>(
  key: K,
  value: unknown,
): SiteSettings[K] {
  const parsed = siteSettingSchemas[key].safeParse(value ?? {});
  return (parsed.success ? parsed.data : siteSettingSchemas[key].parse({})) as SiteSettings[K];
}

/** Every setting with its schema defaults applied — the shape of a fresh site. */
export function defaultSiteSettings(): SiteSettings {
  return Object.fromEntries(
    SITE_SETTING_KEYS.map((key) => [key, siteSettingSchemas[key].parse({})]),
  ) as SiteSettings;
}
