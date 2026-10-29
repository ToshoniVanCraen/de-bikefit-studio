import { DEFAULT_SERVICES } from '@/lib/booking/defaults';
import { OFFER_DURATION_FALLBACK } from './catalogue';
import { DEFAULT_OFFERS, type DefaultOffering } from './defaults';
import type { OfferingAudience, OfferingVariantMode } from './offering';

/**
 * What Toshoni's prices and durations of 20 Oct 2026 change on an EXISTING
 * database, field by field, with the value each field held before (the
 * defaults of 17–19 Oct 2026). `npm run cms:patch-aanbod-prijzen`
 * (`scripts/lib/aanbod-prices-*.mts`) reads this: a field that holds neither
 * the old nor the new value was edited by an admin and blocks the patch. The
 * new values come from the defaults themselves, so the two can never drift
 * (`aanbod-prices.test.ts`) — except for what Toshoni's corrections of 27 Oct
 * 2026 moved on in the defaults: the two fits (the youth price made explicit)
 * and the copy of five other offerings (one term
 * "inspanningstest", copy tokens instead of typed prices; `corrections-2026-10-27.ts`).
 * Their targets are written out below, as this patch left them on the live
 * database, so a re-run on a database at the 20 Oct values still ends in
 * "already at the 20 Oct 2026 values". Plain data, no I/O.
 */

export const AANBOD_PRICES_DATE = '2026-10-20';

export type OfferingPriceState = {
  duration: string;
  contents: string[];
  extras: string[];
  metaDescription: string;
  variantMode: OfferingVariantMode;
  variants: Array<{ audience: OfferingAudience; priceCents: number | null }>;
};

export type OfferingPriceChange = {
  slug: string;
  from: OfferingPriceState;
  to: OfferingPriceState;
};

/**
 * The service's description is not part of the change: every save of the
 * offering that books through it rewrites the description from the offering's
 * summary (`syncVariantService` in `src/lib/offers/repo.ts`).
 */
export type ServicePriceState = {
  durationMinutes: number;
  priceCents: number | null;
  showPrice: boolean;
};

export type ServicePriceChange = { slug: string; from: ServicePriceState; to: ServicePriceState };

function stateOf(offering: DefaultOffering): OfferingPriceState {
  return {
    duration: offering.content.duration,
    contents: [...offering.content.contents],
    extras: [...offering.content.extras],
    metaDescription: offering.content.metaDescription,
    variantMode: offering.variantMode,
    variants: offering.variants.map((variant) => ({
      audience: variant.audience,
      priceCents: variant.priceCents,
    })),
  };
}

// The text the patch of 20 Oct 2026 wrote into the two fits. Frozen on purpose: the defaults of
// 27 Oct 2026 say it differently (`src/lib/offers/defaults.ts`), and a re-run of this patch on a
// database that has the 20 Oct values must keep reporting "already at the 20 Oct 2026 values".
const INCLUDED_ANALYSES_20_OCT =
  'Zadelanalyse, voetanalyse en het afstellen van je schoenplaatjes zitten erin.';
const FOLLOW_UP_20_OCT =
  'Probleemopvolging tot zes maanden na je fit is inbegrepen. Onder 16: € 150 zonder opvolging, € 275 met.';
const SECOND_VISIT_20_OCT = 'Een tweede bezoek na meer dan zes maanden: € 75.';
const SECOND_BIKE_20_OCT = 'Een tweede fiets erbij: vanaf € 75.';
/** Volwassene € 275, Jeugd € 150: the two variants. */
const FIT_VARIANTS_20_OCT: OfferingPriceState['variants'] = [
  { audience: 'adult', priceCents: 27500 },
  { audience: 'youth', priceCents: 15000 },
];

type FitFields = Pick<
  OfferingPriceState,
  'duration' | 'contents' | 'extras' | 'metaDescription' | 'variants'
>;

/** The two fits as the 20 Oct 2026 patch left them; the other offerings still follow the defaults. */
const FITS_OF_20_OCT: Record<string, FitFields> = {
  'bikefit-nieuwe-fiets': {
    // Typed "2 uur" then; since 27 Oct 2026 the default says `{{duur:volwassenenfit}}`.
    duration: '2 uur',
    contents: [
      'Een gesprek over hoe en waarvoor je fietst, en wat je doelen zijn.',
      'We bekijken je houding en hoe beweeglijk je bent.',
      'Je krijgt advies over een passende maat, geometrie en afstelling voor je nieuwe fiets.',
      INCLUDED_ANALYSES_20_OCT,
      FOLLOW_UP_20_OCT,
    ],
    extras: [
      'Afstelling van je nieuwe fiets na de aankoop.',
      SECOND_VISIT_20_OCT,
      SECOND_BIKE_20_OCT,
    ],
    metaDescription:
      'Bikefit vóór je een nieuwe fiets koopt: gesprek, blik op je houding en beweeglijkheid, en advies over maat, geometrie en afstelling. € 275, onder 16 € 150.',
    variants: FIT_VARIANTS_20_OCT,
  },
  'bikefit-huidige-fiets': {
    duration: OFFER_DURATION_FALLBACK,
    contents: [
      'Een intakegesprek over je fietsgebruik, je doelen en wat je voelt op de fiets.',
      'We bekijken je positie en beweging met 3D-bewegingsanalyse.',
      'We kijken je zadel, stuur en schoenplaatjes na.',
      'Aanpassingen testen we samen uit, met uitleg bij elke stap.',
      INCLUDED_ANALYSES_20_OCT,
      FOLLOW_UP_20_OCT,
    ],
    extras: [
      SECOND_VISIT_20_OCT,
      SECOND_BIKE_20_OCT,
      'Nieuwe onderdelen, altijd apart en vooraf besproken.',
    ],
    metaDescription:
      'Bikefit op je huidige fiets: intake, 3D-bewegingsanalyse, zadel, stuur en schoenplaatjes, en aanpassingen die we samen uittesten. € 275, onder 16 € 150.',
    variants: FIT_VARIANTS_20_OCT,
  },
};

/**
 * The copy fields of the other offerings that the corrections of 27 Oct 2026
 * moved on (`src/lib/offers/corrections-2026-10-27.ts` names them in `from`),
 * as the patch of 20 Oct 2026 left them: the test is called "inspanningstest"
 * since (title and meta description of `lactaattest`, an extra of `coaching`)
 * and the meta descriptions of the offerings with a price stopped typing it.
 * Only these fields are frozen; every other field of these offerings still
 * follows the defaults. `aanbod-prices.test.ts` keeps this list in step with
 * the corrections.
 */
export const COPY_OF_20_OCT: Readonly<
  Record<string, Partial<Pick<OfferingPriceState, 'contents' | 'extras' | 'metaDescription'>>>
> = {
  voetanalyse: {
    metaDescription:
      'Voetanalyse voor fietsers: voetstand, ondersteuning, pasvorm van je schoenen en drukpunten, met persoonlijk advies. € 85, 30 minuten.',
  },
  zadelanalyse: {
    metaDescription:
      'Zadelanalyse: we bekijken je zadel, houding en ondersteuning en testen samen een positie die beter bij jou past. € 60, 1 uur.',
  },
  'afstellen-schoenplaatjes': {
    metaDescription:
      'Schoenplaatjes laten afstellen: we kijken je schoenen en plaatjes na, stellen ze af en controleren het resultaat samen. € 15, 15 minuten.',
  },
  lactaattest: {
    metaDescription:
      'Lactaattest voor fietsers: stapsgewijze inspanning met lactaatmetingen, en uitleg over wat de resultaten betekenen voor je training. € 120.',
  },
  coaching: {
    extras: ['Een lactaattest.', 'Een bikefit.', 'Aanvullende opvolging, in overleg.'],
    metaDescription:
      'Fietscoaching: kennismaking, je doelen en beschikbare tijd, persoonlijk trainingsadvies en opvolging zoals we samen afspreken. € 65.',
  },
};

function target(slug: string): OfferingPriceState {
  const offering = DEFAULT_OFFERS.find((entry) => entry.content.slug === slug);
  if (!offering) throw new Error(`aanbod-prices: no default offering ${slug}`);
  if (Object.hasOwn(COPY_OF_20_OCT, slug)) {
    const frozenCopy = COPY_OF_20_OCT[slug];
    const state = stateOf(offering);
    // Copies, like `stateOf`: a caller never changes the written-out values.
    return {
      ...state,
      contents: frozenCopy.contents ? [...frozenCopy.contents] : state.contents,
      extras: frozenCopy.extras ? [...frozenCopy.extras] : state.extras,
      metaDescription: frozenCopy.metaDescription ?? state.metaDescription,
    };
  }
  if (!Object.hasOwn(FITS_OF_20_OCT, slug)) return stateOf(offering);
  const frozen = FITS_OF_20_OCT[slug];
  // Copies, like `stateOf`: a caller never changes the written-out values.
  return {
    ...stateOf(offering),
    duration: frozen.duration,
    contents: [...frozen.contents],
    extras: [...frozen.extras],
    metaDescription: frozen.metaDescription,
    variants: frozen.variants.map((variant) => ({ ...variant })),
  };
}

/** `null` price, one option for everyone (every enquiry offer before 20 Oct). */
const SINGLE_UNPRICED: Pick<OfferingPriceState, 'variantMode' | 'variants'> = {
  variantMode: 'single',
  variants: [{ audience: 'all', priceCents: null }],
};

/** The seven offerings that existed before 20 Oct 2026, with their old values. */
export const OFFERING_PRICE_CHANGES: OfferingPriceChange[] = [
  {
    slug: 'bikefit-nieuwe-fiets',
    from: {
      duration: OFFER_DURATION_FALLBACK,
      contents: [
        'Een gesprek over hoe en waarvoor je fietst, en wat je doelen zijn.',
        'We bekijken je houding en hoe beweeglijk je bent.',
        'Je krijgt advies over een passende maat, geometrie en afstelling voor je nieuwe fiets.',
      ],
      extras: [
        'Afstelling van je nieuwe fiets na de aankoop.',
        'Een aanvullende voet- of zadelanalyse.',
      ],
      metaDescription:
        'Bikefit vóór je een nieuwe fiets koopt: gesprek, blik op je houding en beweeglijkheid, en advies over maat, geometrie en afstelling.',
      ...SINGLE_UNPRICED,
    },
    to: target('bikefit-nieuwe-fiets'),
  },
  {
    slug: 'bikefit-huidige-fiets',
    from: {
      duration: OFFER_DURATION_FALLBACK,
      contents: [
        'Een intakegesprek over je fietsgebruik, je doelen en wat je voelt op de fiets.',
        'We bekijken je positie en beweging met 3D-bewegingsanalyse.',
        'We kijken je zadel, stuur en schoenplaatjes na.',
        'Aanpassingen testen we samen uit, met uitleg bij elke stap.',
      ],
      extras: [
        'Een vervolgafspraak.',
        'Een gerichte voet- of zadelanalyse.',
        'Nieuwe onderdelen, altijd apart en vooraf besproken.',
      ],
      metaDescription:
        'Bikefit op je huidige fiets: intake, 3D-bewegingsanalyse, zadel, stuur en schoenplaatjes, en aanpassingen die we samen uittesten.',
      variantMode: 'audience',
      variants: [
        { audience: 'adult', priceCents: null },
        { audience: 'youth', priceCents: null },
      ],
    },
    to: target('bikefit-huidige-fiets'),
  },
  {
    slug: 'voetanalyse',
    from: {
      duration: OFFER_DURATION_FALLBACK,
      contents: [
        'We bespreken je klachten en wensen.',
        'We bekijken je voetstand en hoe je voeten ondersteund worden.',
        'We kijken naar de pasvorm van je schoenen en mogelijke drukpunten.',
        'Je krijgt persoonlijk advies. Dat is geen medische diagnose.',
      ],
      extras: ['Je schoenplaatjes laten afstellen.', 'Een volledige bikefit.'],
      metaDescription:
        'Voetanalyse voor fietsers: voetstand, ondersteuning, pasvorm van je schoenen en drukpunten, met persoonlijk advies.',
      ...SINGLE_UNPRICED,
    },
    to: target('voetanalyse'),
  },
  {
    slug: 'zadelanalyse',
    from: {
      duration: OFFER_DURATION_FALLBACK,
      contents: [
        'We bespreken je ervaringen op het zadel.',
        'We kijken naar je houding en hoe je op het zadel steunt.',
        'We bekijken de positie en afstelling van je zadel.',
        'Mogelijke aanpassingen testen we samen uit.',
      ],
      extras: [
        'Een ruimer bikefittraject.',
        'Een ander zadel of andere onderdelen, als dat nodig blijkt.',
      ],
      metaDescription:
        'Zadelanalyse: we bekijken je zadel, houding en ondersteuning en testen samen een positie die beter bij jou past.',
      ...SINGLE_UNPRICED,
    },
    to: target('zadelanalyse'),
  },
  {
    slug: 'afstellen-schoenplaatjes',
    from: {
      duration: OFFER_DURATION_FALLBACK,
      contents: [
        'We kijken je schoenen en schoenplaatjes na.',
        'We bekijken de stand en positie van je plaatjes.',
        'We stellen ze af en controleren het resultaat samen.',
      ],
      extras: [
        'Een voetanalyse.',
        'Een volledige bikefit.',
        'Nieuwe schoenplaatjes, als dat nodig is.',
      ],
      metaDescription:
        'Schoenplaatjes laten afstellen: we kijken je schoenen en plaatjes na, stellen ze af en controleren het resultaat samen.',
      ...SINGLE_UNPRICED,
    },
    to: target('afstellen-schoenplaatjes'),
  },
  {
    slug: 'lactaattest',
    from: {
      duration: OFFER_DURATION_FALLBACK,
      contents: [
        'We bespreken je doelen.',
        'Je fietst een stapsgewijs oplopende inspanning, met lactaatmetingen onderweg.',
        'We bespreken de resultaten en duiden je trainingszones.',
        'Het is een sportieve meting, geen medisch onderzoek.',
      ],
      extras: ['Coaching.', 'Een vervolgmeting, in overleg.'],
      metaDescription:
        'Lactaattest voor fietsers: stapsgewijze inspanning met lactaatmetingen, en uitleg over wat de resultaten betekenen voor je training.',
      ...SINGLE_UNPRICED,
    },
    to: target('lactaattest'),
  },
  {
    slug: 'coaching',
    from: {
      duration: 'Traject en opvolging in overleg',
      contents: [
        'Een kennismaking.',
        'We bespreken je doelen en de tijd die je hebt.',
        'Je krijgt persoonlijk trainingsadvies.',
        'Opvolging en bijsturing, zoals we samen afspreken.',
      ],
      extras: ['Een lactaattest.', 'Een bikefit.', 'Aanvullende opvolging, in overleg.'],
      metaDescription:
        'Fietscoaching: kennismaking, je doelen en beschikbare tijd, persoonlijk trainingsadvies en opvolging zoals we samen afspreken.',
      ...SINGLE_UNPRICED,
    },
    to: target('coaching'),
  },
];

/** The two offerings that are new on 20 Oct 2026 (created from the defaults when missing). */
export const NEW_OFFERING_SLUGS = ['bikefit-tweede-bezoek', 'bikefit-tweede-fiets'] as const;

function serviceTarget(slug: string): ServicePriceState {
  const service = DEFAULT_SERVICES.find((entry) => entry.slug === slug);
  if (!service) throw new Error(`aanbod-prices: no default service ${slug}`);
  return {
    durationMinutes: service.durationMinutes,
    priceCents: service.priceCents,
    showPrice: service.showPrice,
  };
}

/** The two booking services, with the values the bootstrap of 24 Sep 2026 gave them. */
export const SERVICE_PRICE_CHANGES: ServicePriceChange[] = [
  {
    slug: 'volwassenenfit',
    from: { durationMinutes: 90, priceCents: null, showPrice: false },
    to: serviceTarget('volwassenenfit'),
  },
  {
    slug: 'jeugdfit',
    from: { durationMinutes: 60, priceCents: null, showPrice: false },
    to: serviceTarget('jeugdfit'),
  },
];
