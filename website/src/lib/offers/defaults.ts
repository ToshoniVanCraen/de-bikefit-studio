import { editorialImage, type EditorialSlot } from '@/lib/studio/editorial-images';
import { OFFER_DURATION_FALLBACK, OFFER_EXTRAS_NOTE, type OfferCategory } from './catalogue';
import type { OfferingAudience, OfferingBookingMode, OfferingVariantMode } from './offering';
import type { OfferingContent } from './offering-content';

/**
 * The offer as first published on 13 Oct 2026, as offerings since 17 Oct and
 * with Toshoni's prices and durations of 20 Oct 2026: what
 * `npm run cms:bootstrap` writes to `cms_offerings` when a row with the slug
 * is missing. Plain data, no I/O.
 *
 * COPY PROVENANCE: work block `2026-10-13-aanbod-staging-brief.md` ("Suggested
 * service content", supplied by Toshoni via Winston) and Toshoni's message of
 * 20 Oct 2026 (prices, durations, the second visit and the second bike, what a
 * bikefit includes, why one analysis alone is often not enough). Nothing
 * beyond those: no device brands, medical claims, guarantees or included
 * products. Where Toshoni gave no duration (lactaattest, coaching) the page
 * still says "Duur in overleg".
 *
 * Prices (20 Oct 2026): bikefit € 275, under 16 € 150 without the six-month
 * problem follow-up (€ 275 with it); second visit € 75 (1 u; free within six
 * months of the fit); second bike € 75 (same type, 30 min extra) or € 150
 * (other type, 1 u extra); zadelanalyse € 60 (1 u), voetanalyse € 85 (30 min),
 * schoenplaatjes € 15 (15 min), all three included in every bikefit;
 * lactaattest € 120; coaching € 65. Shown through the variants' `priceCents`
 * (offer pages and cards) and, for the fit that is booked online, through
 * the services' price in `src/lib/booking/defaults.ts` (the widget).
 *
 * Booking: *Bikefit – huidige fiets* is booked directly as Volwassenenfit
 * (Volwassene) and Jeugdfit (Jeugd); the eight others are asked for through
 * the enquiry form until Toshoni confirms a provider for them. An existing
 * database gets these values with `npm run cms:patch-aanbod-prijzen`
 * (`src/lib/offers/aanbod-prices.ts` lists what changes).
 *
 * Every field stays editable in Beheer → Aanbod. Every placeholder is listed in
 * `docs/content-placeholders.md` (P-, D-, E-rows).
 */

export type DefaultOfferingVariant = {
  audience: OfferingAudience;
  /** An existing `cms_services.slug` (from `DEFAULT_SERVICES`), or `null` for an enquiry. */
  serviceSlug: string | null;
  /** The price shown on the offer page and card; `null` = "Prijs op aanvraag". */
  priceCents: number | null;
};

export type DefaultOffering = {
  content: OfferingContent;
  isListed: boolean;
  bookingMode: OfferingBookingMode;
  variantMode: OfferingVariantMode;
  variants: DefaultOfferingVariant[];
};

/** The three temporary AI images (`docs/editorial-images.md`): one per category, the lactate test apart. */
function offerImage(slug: string, category: Exclude<OfferCategory, 'overige'>) {
  const slot: EditorialSlot =
    slug === 'lactaattest'
      ? 'flemish-cyclists'
      : category === 'bikefit'
        ? 'bikefit-studio'
        : 'junior-coaching';
  return editorialImage(slot);
}

function offer(
  content: Omit<OfferingContent, 'extrasNote' | 'ctaLabel' | 'image' | 'category'> & {
    category: Exclude<OfferCategory, 'overige'>;
  },
  booking: Pick<DefaultOffering, 'bookingMode' | 'variantMode' | 'variants'>,
): DefaultOffering {
  return {
    content: {
      ...content,
      extrasNote: OFFER_EXTRAS_NOTE,
      ctaLabel: '',
      image: offerImage(content.slug, content.category),
    },
    isListed: true,
    ...booking,
  };
}

/** Asked for, one option, at this price (`null` = "Prijs op aanvraag"). */
function enquiry(
  priceCents: number | null,
): Pick<DefaultOffering, 'bookingMode' | 'variantMode' | 'variants'> {
  return {
    bookingMode: 'enquiry',
    variantMode: 'single',
    variants: [{ audience: 'all', serviceSlug: null, priceCents }],
  };
}

/** Prices in cents (20 Oct 2026). */
export const PRICES = {
  bikefit: 27500,
  bikefitUnder16: 15000,
  secondVisit: 7500,
  secondBikeSameType: 7500,
  secondBikeOtherType: 15000,
  saddle: 6000,
  foot: 8500,
  cleats: 1500,
  lactate: 12000,
  coaching: 6500,
} as const;

const INCLUDED_ANALYSES =
  'Zadelanalyse, voetanalyse en het afstellen van je schoenplaatjes zitten erin.';
const FOLLOW_UP_INCLUDED =
  'Probleemopvolging tot zes maanden na je fit is inbegrepen. Onder 16: € 150 zonder opvolging, € 275 met.';
const SECOND_VISIT_EXTRA = 'Een tweede bezoek na meer dan zes maanden: € 75.';
const SECOND_BIKE_EXTRA = 'Een tweede fiets erbij: vanaf € 75.';
/** Why a single analysis is often not enough (Toshoni, 20 Oct 2026), per analysis. */
function oneAnalysisNote(what: string): string {
  return `Een losse analyse is vaak niet genoeg: wie één element aanpast, verandert de hele fietspositie. Daarom zit ${what} in elke bikefit.`;
}

/** The nine offers, in overview order. */
export const DEFAULT_OFFERS: DefaultOffering[] = [
  offer(
    {
      slug: 'bikefit-nieuwe-fiets',
      category: 'bikefit',
      sortOrder: 10,
      title: 'Bikefit – aankoop nieuwe fiets',
      summary: 'Kies een fiets die bij jou past, nog vóór je koopt.',
      intro: 'Een nieuwe fiets begint bij jou: je lichaam, je ritten en je plannen.',
      goal: 'Kies een fiets die bij jou past, nog vóór je koopt.',
      contents: [
        'Een gesprek over hoe en waarvoor je fietst, en wat je doelen zijn.',
        'We bekijken je houding en hoe beweeglijk je bent.',
        'Je krijgt advies over een passende maat, geometrie en afstelling voor je nieuwe fiets.',
        INCLUDED_ANALYSES,
        FOLLOW_UP_INCLUDED,
      ],
      duration: '2 uur',
      extras: [
        'Afstelling van je nieuwe fiets na de aankoop.',
        SECOND_VISIT_EXTRA,
        SECOND_BIKE_EXTRA,
      ],
      metaDescription:
        'Bikefit vóór je een nieuwe fiets koopt: gesprek, blik op je houding en beweeglijkheid, en advies over maat, geometrie en afstelling. € 275, onder 16 € 150.',
    },
    {
      bookingMode: 'enquiry',
      variantMode: 'audience',
      variants: [
        { audience: 'adult', serviceSlug: null, priceCents: PRICES.bikefit },
        { audience: 'youth', serviceSlug: null, priceCents: PRICES.bikefitUnder16 },
      ],
    },
  ),
  offer(
    {
      slug: 'bikefit-huidige-fiets',
      category: 'bikefit',
      sortOrder: 20,
      title: 'Bikefit – huidige fiets',
      summary: 'Comfortabeler fietsen op de fiets die je al hebt.',
      intro: 'We bekijken hoe jij beweegt en stemmen je fiets stap voor stap op je af.',
      goal: 'Comfortabeler fietsen op de fiets die je al hebt.',
      contents: [
        'Een intakegesprek over je fietsgebruik, je doelen en wat je voelt op de fiets.',
        'We bekijken je positie en beweging met 3D-bewegingsanalyse.',
        'We kijken je zadel, stuur en schoenplaatjes na.',
        'Aanpassingen testen we samen uit, met uitleg bij elke stap.',
        INCLUDED_ANALYSES,
        FOLLOW_UP_INCLUDED,
      ],
      duration: OFFER_DURATION_FALLBACK,
      extras: [
        SECOND_VISIT_EXTRA,
        SECOND_BIKE_EXTRA,
        'Nieuwe onderdelen, altijd apart en vooraf besproken.',
      ],
      metaDescription:
        'Bikefit op je huidige fiets: intake, 3D-bewegingsanalyse, zadel, stuur en schoenplaatjes, en aanpassingen die we samen uittesten. € 275, onder 16 € 150.',
    },
    {
      bookingMode: 'direct',
      variantMode: 'audience',
      variants: [
        { audience: 'adult', serviceSlug: 'volwassenenfit', priceCents: PRICES.bikefit },
        { audience: 'youth', serviceSlug: 'jeugdfit', priceCents: PRICES.bikefitUnder16 },
      ],
    },
  ),
  offer(
    {
      slug: 'bikefit-tweede-bezoek',
      category: 'bikefit',
      sortOrder: 25,
      title: 'Bikefit – tweede bezoek',
      summary: 'Een opvolgmoment na je bikefit: gratis tot zes maanden na je fit, daarna € 75.',
      intro: 'Loop je na je fit toch nog ergens tegenaan? Dan kijken we er samen nog eens naar.',
      goal: 'Een opvolgmoment na je bikefit: gratis tot zes maanden na je fit, daarna € 75.',
      contents: [
        'We bespreken wat je sinds je fit voelde op de fiets.',
        'We bekijken je positie opnieuw en sturen bij waar nodig.',
        'Tot zes maanden na je bikefit is deze probleemopvolging gratis.',
        'Na meer dan zes maanden kost een tweede bezoek € 75.',
      ],
      duration: '1 uur',
      extras: ['Een volledige nieuwe bikefit, als je fiets of je lichaam sterk veranderd is.'],
      metaDescription:
        'Tweede bezoek na je bikefit: gratis probleemopvolging tot zes maanden na je fit, daarna € 75 voor een uur bijsturen.',
    },
    enquiry(PRICES.secondVisit),
  ),
  offer(
    {
      slug: 'bikefit-tweede-fiets',
      category: 'bikefit',
      sortOrder: 28,
      title: 'Bikefit – tweede fiets',
      summary: 'Je tweede fiets afgestemd op dezelfde positie, aansluitend op je bikefit.',
      intro:
        'Fiets je op meer dan één fiets? Dan stemmen we je tweede fiets af tijdens dezelfde afspraak.',
      goal: 'Je tweede fiets afgestemd op dezelfde positie, aansluitend op je bikefit.',
      contents: [
        'Zelfde type fiets: € 75 en 30 minuten extra; je afspraak duurt dan 2,5 uur.',
        'Ander type fiets: € 150 en 1 uur extra; je afspraak duurt dan 3 uur.',
        'We nemen de maten van je eerste fiets over en stemmen de tweede erop af.',
      ],
      duration: '30 minuten tot 1 uur extra, aansluitend op je bikefit',
      extras: ['Een derde fiets, in overleg.'],
      metaDescription:
        'Tweede fiets afstemmen tijdens je bikefit: € 75 voor hetzelfde type fiets (30 minuten extra), € 150 voor een ander type (1 uur extra).',
    },
    enquiry(PRICES.secondBikeSameType),
  ),
  offer(
    {
      slug: 'voetanalyse',
      category: 'bikefit',
      sortOrder: 30,
      title: 'Voetanalyse',
      summary: 'Meer inzicht in de steun en het comfort van je voeten.',
      intro:
        'Je voeten brengen elke trapbeweging over. We bekijken hoe ze samenwerken met je schoenen en pedalen.',
      goal: 'Meer inzicht in de steun en het comfort van je voeten.',
      contents: [
        'We bespreken je klachten en wensen.',
        'We bekijken je voetstand en hoe je voeten ondersteund worden.',
        'We kijken naar de pasvorm van je schoenen en mogelijke drukpunten.',
        'Je krijgt persoonlijk advies. Dat is geen medische diagnose.',
        oneAnalysisNote('de voetanalyse'),
      ],
      duration: '30 minuten',
      extras: ['Je schoenplaatjes laten afstellen.', 'Een volledige bikefit.'],
      metaDescription:
        'Voetanalyse voor fietsers: voetstand, ondersteuning, pasvorm van je schoenen en drukpunten, met persoonlijk advies. € 85, 30 minuten.',
    },
    enquiry(PRICES.foot),
  ),
  offer(
    {
      slug: 'zadelanalyse',
      category: 'bikefit',
      sortOrder: 40,
      title: 'Zadelanalyse',
      summary: 'Een zadelpositie die beter bij jou past.',
      intro: 'Zit je niet prettig? We bekijken je zadel, houding en ondersteuning samen.',
      goal: 'Een zadelpositie die beter bij jou past.',
      contents: [
        'We bespreken je ervaringen op het zadel.',
        'We kijken naar je houding en hoe je op het zadel steunt.',
        'We bekijken de positie en afstelling van je zadel.',
        'Mogelijke aanpassingen testen we samen uit.',
        oneAnalysisNote('de zadelanalyse'),
      ],
      duration: '1 uur',
      extras: [
        'Een ruimer bikefittraject.',
        'Een ander zadel of andere onderdelen, als dat nodig blijkt.',
      ],
      metaDescription:
        'Zadelanalyse: we bekijken je zadel, houding en ondersteuning en testen samen een positie die beter bij jou past. € 60, 1 uur.',
    },
    enquiry(PRICES.saddle),
  ),
  offer(
    {
      slug: 'afstellen-schoenplaatjes',
      category: 'bikefit',
      sortOrder: 50,
      title: 'Afstellen schoenplaatjes',
      summary: 'Een goede basis voor je trapbeweging.',
      intro:
        'Kleine aanpassingen aan je schoenplaatjes kunnen veel betekenen voor hoe je op de fiets zit.',
      goal: 'Een goede basis voor je trapbeweging.',
      contents: [
        'We kijken je schoenen en schoenplaatjes na.',
        'We bekijken de stand en positie van je plaatjes.',
        'We stellen ze af en controleren het resultaat samen.',
        oneAnalysisNote('het afstellen van je schoenplaatjes'),
      ],
      duration: '15 minuten',
      extras: [
        'Een voetanalyse.',
        'Een volledige bikefit.',
        'Nieuwe schoenplaatjes, als dat nodig is.',
      ],
      metaDescription:
        'Schoenplaatjes laten afstellen: we kijken je schoenen en plaatjes na, stellen ze af en controleren het resultaat samen. € 15, 15 minuten.',
    },
    enquiry(PRICES.cleats),
  ),
  offer(
    {
      slug: 'lactaattest',
      category: 'begeleiding',
      sortOrder: 10,
      title: 'Lactaattest',
      summary: 'Gerichter trainen met inzicht in je inspanningsniveau.',
      intro:
        'Ontdek hoe je lichaam reageert op oplopende inspanning en wat dat betekent voor je training.',
      goal: 'Gerichter trainen met inzicht in je inspanningsniveau.',
      contents: [
        'We bespreken je doelen.',
        'Je fietst een stapsgewijs oplopende inspanning, met lactaatmetingen onderweg.',
        'We bespreken de resultaten en duiden je trainingszones.',
        'Het is een sportieve meting, geen medisch onderzoek.',
      ],
      duration: OFFER_DURATION_FALLBACK,
      extras: ['Coaching.', 'Een vervolgmeting, in overleg.'],
      metaDescription:
        'Lactaattest voor fietsers: stapsgewijze inspanning met lactaatmetingen, en uitleg over wat de resultaten betekenen voor je training. € 120.',
    },
    enquiry(PRICES.lactate),
  ),
  offer(
    {
      slug: 'coaching',
      category: 'begeleiding',
      sortOrder: 20,
      title: 'Coaching',
      summary: 'Werk aan jouw fietsdoelen, op een manier die in je leven past.',
      intro:
        'Een eerste uitdaging of een gericht wedstrijdplan: we bouwen samen aan haalbare vooruitgang.',
      goal: 'Werk aan jouw fietsdoelen, op een manier die in je leven past.',
      contents: [
        'Een kennismaking.',
        'We bespreken je doelen en de tijd die je hebt.',
        'Je krijgt persoonlijk trainingsadvies.',
        'Opvolging en bijsturing, zoals we samen afspreken.',
      ],
      duration: 'Traject en opvolging in overleg',
      extras: ['Een lactaattest.', 'Een bikefit.', 'Aanvullende opvolging, in overleg.'],
      metaDescription:
        'Fietscoaching: kennismaking, je doelen en beschikbare tijd, persoonlijk trainingsadvies en opvolging zoals we samen afspreken. € 65.',
    },
    enquiry(PRICES.coaching),
  ),
];

/**
 * Everything the bootstrap writes: the nine offers. The older services
 * (`RETIRED_SERVICE_SLUGS` in `@/lib/booking/defaults`) are no longer written,
 * not even hidden (17 Oct 2026).
 */
export const DEFAULT_OFFERINGS: DefaultOffering[] = DEFAULT_OFFERS;
