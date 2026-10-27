/**
 * The legal identity of the business behind the site: since 27 Oct 2026 only
 * the DEFAULTS of the `business` settings (Beheer → Instellingen →
 * Bedrijfsgegevens, `src/lib/cms/site-settings.ts`), which are the master of
 * the legal name, the registered office, the enterprise number and the VAT
 * number. The legal pages state them through the copy tokens `{{bedrijf}}`,
 * `{{zetel}}`, `{{kbo}}` and `{{btw}}`, and the JSON-LD Organization reads
 * the settings; nothing types them again. The public footer no longer shows
 * the identity line (Toshoni's review, 13 Oct 2026).
 *
 * The phone pair stays a constant fallback besides: the error pages
 * (`app/global-error.tsx`, `app/(studio)/error.tsx`) render when the database
 * or the settings cannot be read, and the offer page and the gift voucher
 * block use it while Instellingen → Contact holds no phone number.
 *
 * Source: KBO public search (kbopub.economie.fgov.be), enterprise number
 * 1036.912.281, consulted 24 Sep 2026. The RPR division follows from the
 * registered office (Asse, arrondissement Halle-Vilvoorde) and should be
 * checked against the Belgisch Staatsblad publication.
 *
 * Belgian law (art. III.74 WER, art. 2:20 WVV) requires the name, legal form,
 * registered office, enterprise number and an e-mail address on the website:
 * `/privacy` and `/algemene-voorwaarden` state them, and the footer shows the
 * public address from `cms_site_settings.contact.email`
 * (info@debikefitstudio.be, confirmed by Toshoni on 13 Oct 2026).
 *
 * Plain module (no `server-only`, no I/O): safe in server components, e-mail
 * templates and scripts alike.
 */
export const LEGAL_IDENTITY = {
  /** Legal name including the legal form. */
  name: 'Qarakter BV',
  /** Trade name (handelsnaam) the public knows. */
  tradeName: 'De Bikefit Studio',
  /** Registered office (maatschappelijke zetel): street and number. */
  street: 'Weversstraat 7',
  postalCode: '1730',
  /** Municipality of the registered office. */
  city: 'Asse',
  /** ISO country code of the registered office. */
  country: 'BE',
  /** Enterprise (KBO) number, which is also the VAT number. */
  kbo: 'BE 1036.912.281',
  /** Rechtspersonenregister: court division of the registered office. */
  rpr: 'Brussel, Nederlandstalige afdeling',
  phoneLabel: '+32 473 95 26 33',
  phoneHref: 'tel:+32473952633',
} as const;

/** Site-relative paths of the two legal pages (seeded by `scripts/cms-seed.mts`). */
export const LEGAL_LINKS = {
  privacy: '/privacy',
  terms: '/algemene-voorwaarden',
} as const;
