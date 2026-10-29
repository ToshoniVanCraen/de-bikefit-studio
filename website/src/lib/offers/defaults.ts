import { editorialImage, type EditorialSlot } from '@/lib/studio/editorial-images';
import { OFFER_DURATION_FALLBACK, OFFER_EXTRAS_NOTE, type OfferCategory } from './catalogue';
import type {
  AddonChoice,
  OfferingAudience,
  OfferingBookingMode,
  OfferingVariantMode,
} from './offering';
import type { OfferingContent } from './offering-content';

/**
 * The offer as first published on 13 Oct 2026, as offerings since 17 Oct and
 * with Toshoni's prices and durations of 20 Oct 2026 and his youth price of
 * 27 Oct 2026: what `npm run cms:bootstrap` writes to `cms_offerings` when a
 * row with the slug is missing. Plain data, no I/O.
 *
 * COPY PROVENANCE: work block `2026-10-13-aanbod-staging-brief.md` ("Suggested
 * service content", supplied by Toshoni via Winston) and Toshoni's message of
 * 20 Oct 2026 (prices, durations, the second visit and the second bike, what a
 * bikefit includes, why one analysis alone is often not enough). Nothing
 * beyond those: no device brands, medical claims, guarantees or included
 * products. Where Toshoni gave no duration (inspanningstest, coaching) the page
 * still says "Duur in overleg".
 *
 * Prices (20 Oct 2026): bikefit € 275 with six months of problem follow-up
 * included; second visit € 75 (1 u; free within six months of the fit, said in
 * the offering's `priceText`); second bike € 75 (same type, 30 min extra) or
 * € 150 (other type, 1 u extra); zadelanalyse € 60 (1 u), voetanalyse € 85
 * (30 min), schoenplaatjes € 15 (15 min), all three included in every bikefit;
 * inspanningstest € 120; coaching € 65. Shown through the variants' `priceCents`
 * (offer pages and cards) and, for the fit that is booked online, through
 * the services' price in `src/lib/booking/defaults.ts` (the widget).
 *
 * Jeugd (under 16, Toshoni 27 and 29 Oct 2026) is one variant of both bikefits,
 * so the offer page, the widget, the booking, the mails and Beheer all say the
 * same: *Jeugd – eenmalig* (`youth`) € 150, one fit without follow-up. The one
 * booked online has its service (`jeugdfit`).
 *
 * Extra's (Toshoni, 20 Oct 2026, corrected 27 Oct 2026): *Bikefit – tweede
 * fiets* is the only extra of a bikefit. It is an extra only, never booked
 * alone, with two choices the visitor picks from: zelfde type (30 min, € 75)
 * or ander type (1 u, € 150). Both bikefits list it, and nothing else.
 * Voetanalyse, zadelanalyse and het afstellen van schoenplaatjes are sold on
 * their own (asked for) and are included in every bikefit, so they are never
 * an extra of one. An existing database gets this with
 * `npm run cms:patch-aanbod-extras`.
 *
 * Booking: *Bikefit – huidige fiets* is booked directly as Volwassenenfit
 * (Volwassene) and Jeugdfit – eenmalig; the eight others are asked for through
 * the enquiry form until Toshoni confirms a provider for them. An existing
 * database got the values of 20 Oct 2026 with `npm run cms:patch-aanbod-prijzen`
 * (`src/lib/offers/aanbod-prices.ts` freezes what it wrote); the texts of
 * 27 Oct 2026 come with their own patch.
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

/** The extra side of a default offering (20 Oct 2026); see `OfferingSettings`. */
export type DefaultOfferingExtras = {
  isAddon: boolean;
  soldAlone: boolean;
  addonMinutes: number | null;
  /** Slugs of the extras a visitor may add when booking this offering, in order. */
  addonSlugs: string[];
  /** Choices within this extra (each its own time and price); empty = one price and time. */
  addonOptions: AddonChoice[];
};

export type DefaultOffering = DefaultOfferingExtras & {
  content: OfferingContent;
  isListed: boolean;
  bookingMode: OfferingBookingMode;
  variantMode: OfferingVariantMode;
  variants: DefaultOfferingVariant[];
};

const NOT_AN_EXTRA: DefaultOfferingExtras = {
  isAddon: false,
  soldAlone: true,
  addonMinutes: null,
  addonSlugs: [],
  addonOptions: [],
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
  content: Omit<OfferingContent, 'extrasNote' | 'ctaLabel' | 'image' | 'category' | 'priceText'> & {
    category: Exclude<OfferCategory, 'overige'>;
    /** The free-text Kostprijs of an offering that is asked for; absent = the variants' prices. */
    priceText?: string;
  },
  booking: Pick<DefaultOffering, 'bookingMode' | 'variantMode' | 'variants'>,
  extras: Partial<DefaultOfferingExtras> = {},
): DefaultOffering {
  return {
    content: {
      ...content,
      priceText: content.priceText ?? '',
      extrasNote: OFFER_EXTRAS_NOTE,
      ctaLabel: '',
      image: offerImage(content.slug, content.category),
    },
    isListed: true,
    ...NOT_AN_EXTRA,
    ...extras,
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
  /** Jeugd – eenmalig: one fit, no follow-up. */
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
/**
 * The follow-up lines of a bikefit, as two bullets. Nothing here is a number:
 * the adult window and the youth price are copy tokens that the public site
 * resolves from the master (`{{opvolging:…}}`, the variants' prices), so a
 * changed price or window never leaves this text behind. Toshoni, 27 and 29 Oct
 * 2026: under 16, a one-off fit without follow-up.
 */
function followUpIncluded(slug: string): string[] {
  return [
    'Probleemopvolging tot {{opvolging:volwassene}} na je fit is inbegrepen.',
    `Jeugd (onder 16): {{prijs:${slug}:youth}} voor een eenmalige fit zonder opvolging.`,
  ];
}
/** The adjustment of the new bike after the purchase belongs to the follow-up, so it is in the adult price (Toshoni, 27 Oct 2026). */
const NEW_BIKE_ADJUSTMENT_INCLUDED =
  'De afstelling van je nieuwe fiets na de aankoop is inbegrepen in de {{prijs:bikefit-nieuwe-fiets:adult}}: ze hoort bij de opvolging tot {{opvolging:volwassene}} na je fit.';
const SECOND_VISIT_EXTRA =
  'Een tweede bezoek na meer dan {{tweede-bezoek-gratis}}: {{prijs:bikefit-tweede-bezoek:all}}.';
const SECOND_BIKE_EXTRA = 'Een tweede fiets erbij: vanaf {{prijs:bikefit-tweede-fiets:all}}.';
/**
 * The extras a visitor may tick when booking a bikefit, in this order. Only the
 * second bike: Toshoni, 27 Oct 2026: voetanalyse, zadelanalyse and
 * afstellen-schoenplaatjes are included in every bikefit, so they are never a
 * paid extra of one (the first version of 20 Oct 2026 charged for them twice).
 */
export const BIKEFIT_ADDON_SLUGS = ['bikefit-tweede-fiets'] as const;
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
        NEW_BIKE_ADJUSTMENT_INCLUDED,
        ...followUpIncluded('bikefit-nieuwe-fiets'),
      ],
      // Asked for, but the fit is the one the Volwassenenfit service books: its length is the master.
      duration: '{{duur:volwassenenfit}}',
      extras: [SECOND_VISIT_EXTRA, SECOND_BIKE_EXTRA],
      metaDescription:
        'Bikefit vóór je een nieuwe fiets koopt: gesprek, blik op je houding en beweeglijkheid, en advies over maat, geometrie en afstelling. {{prijs:bikefit-nieuwe-fiets:adult}}; onder 16 {{prijs:bikefit-nieuwe-fiets:youth}} eenmalig.',
    },
    {
      bookingMode: 'enquiry',
      variantMode: 'audience',
      variants: [
        { audience: 'adult', serviceSlug: null, priceCents: PRICES.bikefit },
        { audience: 'youth', serviceSlug: null, priceCents: PRICES.bikefitUnder16 },
      ],
    },
    { addonSlugs: [...BIKEFIT_ADDON_SLUGS] },
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
        ...followUpIncluded('bikefit-huidige-fiets'),
      ],
      duration: OFFER_DURATION_FALLBACK,
      extras: [
        SECOND_VISIT_EXTRA,
        SECOND_BIKE_EXTRA,
        'Nieuwe onderdelen, altijd apart en vooraf besproken.',
      ],
      metaDescription:
        'Bikefit op je huidige fiets: intake, 3D-bewegingsanalyse, zadel, stuur en schoenplaatjes, en aanpassingen die we samen uittesten. {{prijs:bikefit-huidige-fiets:adult}}; onder 16 {{prijs:bikefit-huidige-fiets:youth}} eenmalig.',
    },
    {
      bookingMode: 'direct',
      variantMode: 'audience',
      variants: [
        { audience: 'adult', serviceSlug: 'volwassenenfit', priceCents: PRICES.bikefit },
        { audience: 'youth', serviceSlug: 'jeugdfit', priceCents: PRICES.bikefitUnder16 },
      ],
    },
    { addonSlugs: [...BIKEFIT_ADDON_SLUGS] },
  ),
  offer(
    {
      slug: 'bikefit-tweede-bezoek',
      category: 'bikefit',
      sortOrder: 25,
      title: 'Bikefit – tweede bezoek',
      summary:
        'Een opvolgmoment na je bikefit: gratis tot {{tweede-bezoek-gratis}} na je fit, daarna {{prijs:bikefit-tweede-bezoek:all}}.',
      intro: 'Loop je na je fit toch nog ergens tegenaan? Dan kijken we er samen nog eens naar.',
      goal: 'Een opvolgmoment na je bikefit: gratis tot {{tweede-bezoek-gratis}} na je fit, daarna {{prijs:bikefit-tweede-bezoek:all}}.',
      contents: [
        'We bespreken wat je sinds je fit voelde op de fiets.',
        'We bekijken je positie opnieuw en sturen bij waar nodig.',
        'Tot {{tweede-bezoek-gratis}} na je bikefit is deze probleemopvolging gratis.',
        'Na meer dan {{tweede-bezoek-gratis}} kost een tweede bezoek {{prijs:bikefit-tweede-bezoek:all}}.',
      ],
      duration: '1 uur',
      // The page reads this instead of the price line. It names the variant's price (`:all`):
      // the price line of this offering IS this text, so a token for the line would loop.
      priceText:
        'Gratis binnen {{tweede-bezoek-gratis}} na je fit, daarna {{prijs:bikefit-tweede-bezoek:all}}',
      extras: ['Een volledige nieuwe bikefit, als je fiets of je lichaam sterk veranderd is.'],
      metaDescription:
        'Tweede bezoek na je bikefit: gratis probleemopvolging tot {{tweede-bezoek-gratis}} na je fit, daarna {{prijs:bikefit-tweede-bezoek:all}} voor het bijsturen.',
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
        'Zelfde type fiets: {{extra:bikefit-tweede-fiets:zelfde-type}}.',
        'Ander type fiets: {{extra:bikefit-tweede-fiets:ander-type}}.',
        'We nemen de maten van je eerste fiets over en stemmen de tweede erop af.',
      ],
      // The time of each choice is `addonOptions` below (the page prints that), so no minutes here.
      duration: 'Extra tijd bovenop je bikefit, aansluitend op je afspraak',
      extras: ['Een derde fiets, in overleg.'],
      metaDescription:
        'Tweede fiets afstemmen tijdens je bikefit: voor hetzelfde type fiets {{extra:bikefit-tweede-fiets:zelfde-type}}, voor een ander type {{extra:bikefit-tweede-fiets:ander-type}}.',
    },
    enquiry(PRICES.secondBikeSameType),
    // An extra only: ticked when booking a bikefit, 30 min and € 75 for the same type.
    {
      isAddon: true,
      soldAlone: false,
      addonMinutes: 30,
      addonOptions: [
        {
          key: 'zelfde-type',
          label: 'Zelfde type fiets',
          minutes: 30,
          priceCents: PRICES.secondBikeSameType,
        },
        {
          key: 'ander-type',
          label: 'Ander type fiets',
          minutes: 60,
          priceCents: PRICES.secondBikeOtherType,
        },
      ],
    },
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
        'Voetanalyse voor fietsers: voetstand, ondersteuning, pasvorm van je schoenen en drukpunten, met persoonlijk advies. {{prijs:voetanalyse:all}}.',
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
        'Zadelanalyse: we bekijken je zadel, houding en ondersteuning en testen samen een positie die beter bij jou past. {{prijs:zadelanalyse:all}}.',
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
        'Schoenplaatjes laten afstellen: we kijken je schoenen en plaatjes na, stellen ze af en controleren het resultaat samen. {{prijs:afstellen-schoenplaatjes:all}}.',
    },
    enquiry(PRICES.cleats),
  ),
  offer(
    {
      slug: 'lactaattest',
      category: 'begeleiding',
      sortOrder: 10,
      // "Inspanningstest" since 27 Oct 2026 (Toshoni, one term everywhere); the slug,
      // so the URL /aanbod/lactaattest, stays.
      title: 'Inspanningstest',
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
        'Inspanningstest voor fietsers: stapsgewijze inspanning met lactaatmetingen, en uitleg over wat de resultaten betekenen voor je training. {{prijs:lactaattest:all}}.',
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
      extras: ['Een inspanningstest.', 'Een bikefit.', 'Aanvullende opvolging, in overleg.'],
      metaDescription:
        'Fietscoaching: kennismaking, je doelen en beschikbare tijd, persoonlijk trainingsadvies en opvolging zoals we samen afspreken. {{prijs:coaching:all}}.',
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
