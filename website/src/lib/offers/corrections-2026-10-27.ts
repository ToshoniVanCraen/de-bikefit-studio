import { DEFAULT_SERVICES, type DefaultService } from '@/lib/booking/defaults';
import { OFFERING_PRICE_CHANGES } from './aanbod-prices';
import { DEFAULT_OFFERS } from './defaults';
import type { OfferingContent } from './offering-content';

/**
 * Toshoni's text corrections of 27 Oct 2026 for the offerings and the booking
 * services, as exact from → to operations: the pure half of
 * `npm run cms:patch-aanbod-correcties` (the I/O half lives in `scripts/lib/`).
 * The defaults (`./defaults.ts`, `@/lib/booking/defaults`) already hold the
 * target text; this module says what an EXISTING database holds today and what
 * it becomes. Plain data, no I/O.
 *
 * What changes, in one place:
 *
 *   refer to the master   no price, duration, follow-up window or voucher period
 *                         is typed as a literal any more: the texts carry copy
 *                         tokens (`{{prijs:<offering>:<audience>}}`,
 *                         `{{opvolging:volwassene}}`, `{{extra:<offering>:<choice>}}`,
 *                         `{{tweede-bezoek-gratis}}`, `{{duur:<service>}}`) that the
 *                         public site resolves from the master at render time
 *                         (`src/lib/studio/copy-tokens*.ts`). The meta descriptions of
 *                         the single-priced offerings no longer name the length (the
 *                         Duur line says it, and no token reads an asked-for
 *                         offering's Duur); the Duur of "aankoop nieuwe fiets" is
 *                         `{{duur:volwassenenfit}}`; the one of "tweede fiets" no
 *                         longer repeats the minutes of its choices
 *   the two fits          also the content of 27 Oct that the patch of 20 Oct did not
 *                         know: the youth price as a token (one-off only, 29 Oct), the
 *                         new-bike adjustment inside the follow-up, the second bike as
 *                         the only extra
 *   one term              "inspanningstest" for "lactaattest" (title, meta, extras of
 *                         coaching); the slug and the URL stay
 *   tweede bezoek         the free-text Kostprijs ("gratis binnen zes maanden na je
 *                         fit, daarna € 75") that the page reads instead of "€ 75"
 *   services              Jeugdfit is "Jeugdfit – eenmalig"; the descriptions type no
 *                         price or follow-up window (a token where one is named)
 *
 * Rules the patch applies, per offering and per service:
 *
 *   - `from` and `to` hold the same keys, only the ones that change; the patch
 *     compares and writes exactly those, so an editor's change to any other
 *     field never blocks it.
 *   - A field that holds `to` is done (idempotent); a field that holds neither
 *     `from` nor `to` was edited in Beheer: a conflict, the patch refuses.
 *   - `from` is the text as it is on the live databases BEFORE the patch: for the
 *     two fits the values the patch of 20 Oct wrote (frozen in `./aanbod-prices.ts`),
 *     for the others the defaults of 20 Oct (still the live text), with the earlier
 *     corrections of this day chained in (`lactaattest`, `coaching`): one entry per
 *     offering carries the FINAL text, so nothing is written twice.
 *   - `to` is read from the defaults, so the two can never drift
 *     (`corrections-2026-10-27.test.ts`).
 *
 * The page texts of the same day (terms, FAQ, appointment, team, ...) are
 * `CORRECTION_PAGE_SPECS` in `@/lib/studio/seed-content/corrections-2026-10-27`.
 */

export const OFFERING_TEXT_FIELDS = [
  'title',
  'summary',
  'intro',
  'goal',
  'contents',
  'extras',
  'extrasNote',
  'duration',
  'priceText',
  'metaDescription',
] as const;

/** The editorial fields of an offering that this correction may change. */
export type OfferingTextFields = Pick<OfferingContent, (typeof OFFERING_TEXT_FIELDS)[number]>;

export type OfferingTextCorrection = {
  slug: string;
  from: Partial<OfferingTextFields>;
  to: Partial<OfferingTextFields>;
};

/** The booking-service fields a text correction may change. */
export type ServiceTextFields = Pick<DefaultService, 'name' | 'choiceLabel' | 'description'>;

export type ServiceTextCorrection = {
  slug: string;
  from: ServiceTextFields;
  to: ServiceTextFields;
};

// ------------------------------------------------------------- offerings ----

/** What the patch of 20 Oct 2026 left in the two fits (the defaults moved on since). */
function fitOf20Oct(
  slug: string,
): Pick<OfferingTextFields, 'contents' | 'extras' | 'metaDescription'> {
  const change = OFFERING_PRICE_CHANGES.find((entry) => entry.slug === slug);
  if (!change) throw new Error(`offering corrections: no 20 Oct state for ${slug}`);
  return {
    contents: [...change.to.contents],
    extras: [...change.to.extras],
    metaDescription: change.to.metaDescription,
  };
}

/**
 * The live text before the patch, per offering. Written out on purpose: these
 * are facts about the databases, not a view on the defaults.
 */
const LIVE_BEFORE: ReadonlyArray<{ slug: string; from: Partial<OfferingTextFields> }> = [
  {
    slug: 'bikefit-nieuwe-fiets',
    // The Duur "2 uur" (20 Oct) follows the Volwassenenfit service from now on: `{{duur:volwassenenfit}}`.
    from: { ...fitOf20Oct('bikefit-nieuwe-fiets'), duration: '2 uur' },
  },
  { slug: 'bikefit-huidige-fiets', from: fitOf20Oct('bikefit-huidige-fiets') },
  {
    slug: 'bikefit-tweede-bezoek',
    from: {
      summary: 'Een opvolgmoment na je bikefit: gratis tot zes maanden na je fit, daarna € 75.',
      goal: 'Een opvolgmoment na je bikefit: gratis tot zes maanden na je fit, daarna € 75.',
      contents: [
        'We bespreken wat je sinds je fit voelde op de fiets.',
        'We bekijken je positie opnieuw en sturen bij waar nodig.',
        'Tot zes maanden na je bikefit is deze probleemopvolging gratis.',
        'Na meer dan zes maanden kost een tweede bezoek € 75.',
      ],
      // The column is new (migration 0017): empty on every database that ran the patch of 20 Oct.
      priceText: '',
      metaDescription:
        'Tweede bezoek na je bikefit: gratis probleemopvolging tot zes maanden na je fit, daarna € 75 voor een uur bijsturen.',
    },
  },
  {
    slug: 'bikefit-tweede-fiets',
    from: {
      contents: [
        'Zelfde type fiets: € 75 en 30 minuten extra; je afspraak duurt dan 2,5 uur.',
        'Ander type fiets: € 150 en 1 uur extra; je afspraak duurt dan 3 uur.',
        'We nemen de maten van je eerste fiets over en stemmen de tweede erop af.',
      ],
      duration: '30 minuten tot 1 uur extra, aansluitend op je bikefit',
      metaDescription:
        'Tweede fiets afstemmen tijdens je bikefit: € 75 voor hetzelfde type fiets (30 minuten extra), € 150 voor een ander type (1 uur extra).',
    },
  },
  {
    slug: 'voetanalyse',
    from: {
      metaDescription:
        'Voetanalyse voor fietsers: voetstand, ondersteuning, pasvorm van je schoenen en drukpunten, met persoonlijk advies. € 85, 30 minuten.',
    },
  },
  {
    slug: 'zadelanalyse',
    from: {
      metaDescription:
        'Zadelanalyse: we bekijken je zadel, houding en ondersteuning en testen samen een positie die beter bij jou past. € 60, 1 uur.',
    },
  },
  {
    slug: 'afstellen-schoenplaatjes',
    from: {
      metaDescription:
        'Schoenplaatjes laten afstellen: we kijken je schoenen en plaatjes na, stellen ze af en controleren het resultaat samen. € 15, 15 minuten.',
    },
  },
  {
    slug: 'lactaattest',
    from: {
      title: 'Lactaattest',
      metaDescription:
        'Lactaattest voor fietsers: stapsgewijze inspanning met lactaatmetingen, en uitleg over wat de resultaten betekenen voor je training. € 120.',
    },
  },
  {
    slug: 'coaching',
    from: {
      extras: ['Een lactaattest.', 'Een bikefit.', 'Aanvullende opvolging, in overleg.'],
      metaDescription:
        'Fietscoaching: kennismaking, je doelen en beschikbare tijd, persoonlijk trainingsadvies en opvolging zoals we samen afspreken. € 65.',
    },
  },
];

/** The fields named in `from`, read from the offering's default content. */
function defaultTextOf(slug: string, keys: ReadonlyArray<keyof OfferingTextFields>) {
  const offering = DEFAULT_OFFERS.find((entry) => entry.content.slug === slug);
  if (!offering) throw new Error(`offering corrections: no default offering "${slug}"`);
  const to: Record<string, unknown> = {};
  for (const key of keys) {
    const value = offering.content[key];
    to[key] = Array.isArray(value) ? [...value] : value;
  }
  return to as Partial<OfferingTextFields>;
}

/**
 * One entry per offering, in the order of the defaults, each with the final
 * text. The patch writes exactly the fields named in `from`.
 */
export const OFFERING_TEXT_CORRECTIONS: ReadonlyArray<OfferingTextCorrection> = LIVE_BEFORE.map(
  ({ slug, from }) => ({
    slug,
    from,
    to: defaultTextOf(slug, Object.keys(from) as Array<keyof OfferingTextFields>),
  }),
);

// -------------------------------------------------------------- services ----

function serviceTextOf(slug: string): ServiceTextFields {
  const service = DEFAULT_SERVICES.find((entry) => entry.slug === slug);
  if (!service) throw new Error(`service corrections: no default service "${slug}"`);
  return {
    name: service.name,
    choiceLabel: service.choiceLabel,
    description: service.description,
  };
}

/**
 * The booking services as they are live today. Jeugdfit is renamed; both
 * descriptions stop typing the price and the follow-up window.
 */
export const SERVICE_TEXT_CORRECTIONS: ReadonlyArray<ServiceTextCorrection> = [
  {
    slug: 'volwassenenfit',
    from: {
      name: 'Volwassenenfit',
      choiceLabel: 'Volwassene',
      description:
        'De volledige bikefit op je eigen fiets, zadel-, voet- en schoenplaatjesanalyse inbegrepen. Probleemopvolging tot zes maanden na je fit is inbegrepen.',
    },
    to: serviceTextOf('volwassenenfit'),
  },
  {
    slug: 'jeugdfit',
    from: {
      name: 'Jeugdfit',
      choiceLabel: 'Jeugd',
      description:
        'Voor fietsers onder 16: dezelfde fit, afgestemd op een lichaam in groei, zonder probleemopvolging. Met opvolging kies je Volwassene (€ 275).',
    },
    to: serviceTextOf('jeugdfit'),
  },
];
