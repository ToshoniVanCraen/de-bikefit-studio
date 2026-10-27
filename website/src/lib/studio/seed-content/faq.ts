import { CALLOUT_BLOCK, type SeedPage } from './shared';

/**
 * The FAQ (`/veelgestelde-vragen`): the eight questions of content/about.html §2 (identical
 * to prototype/bikefit.html#vragen) and the page around them. Plain data, no I/O. It lived in
 * `scripts/cms-seed.mts` until 27 Oct 2026; as a module the corrections can import the two new
 * answers instead of copying them, and the tests can read the page without parsing the script.
 * The block defaults of the admin (`src/lib/cms/blocks.ts`) hold the same eight items.
 */

export type FaqItem = { question: string; answer: string };

export const FAQ_BRING_QUESTION = 'Wat breng ik mee voor een bikefit?';
export const FAQ_DURATION_QUESTION = 'Hoe lang duurt een bikefit?';

/** Toshoni, 27 Oct 2026: the pedals are part of what to bring (the e-mails and `/afspraak` say it too). */
export const FAQ_BRING_ITEM: FaqItem = {
  question: FAQ_BRING_QUESTION,
  answer:
    'Je fiets (proper en in werkende staat), de schoenen en fietskleding waarin je écht rijdt, en eventuele notities over wat je dwars zit. Neem ook je eigen pedalen mee, zeker bij Time-pedalen of de nieuwste Shimano-pedalen: niet elk systeem hebben we in de studio. Meer hebben we niet nodig. De rest doen wij.',
};

/**
 * Toshoni, 27 Oct 2026: the answer must never contradict the offer pages again, so it names
 * them instead of stating hours. FAQ answers are plain text (no links), hence the names; they
 * are the titles of the two fits.
 */
export const FAQ_DURATION_ITEM: FaqItem = {
  question: FAQ_DURATION_QUESTION,
  answer:
    'Dat hangt af van de fit die je kiest. De duur staat bij elke fit op haar eigen pagina onder Aanbod: Bikefit – huidige fiets en Bikefit – aankoop nieuwe fiets.',
};

/** The eight Q&A from content/about.html §2; 27 Oct 2026 (Toshoni): pedals under "Wat breng ik mee", the duration answer names the fit pages instead of stating hours. Answers are plain text (no links). */
export const FAQ_ITEMS: FaqItem[] = [
  {
    question: 'Waarom is een bikefit belangrijk?',
    answer:
      'Een fiets die niet bij jouw lichaam past, kost je op drie manieren: pijn, verloren kracht, en kortere ritten. Een bikefit lijnt de fiets uit op jou, niet omgekeerd, zodat elke rit beter voelt en je langer gezond blijft op de fiets.',
  },
  {
    question: 'Hoe vaak moet ik een bikefit laten doen?',
    answer:
      'Voor de meeste volwassenen om de 18 tot 24 maanden, of telkens als er iets verandert. Een nieuwe fiets, een blessure, een grote verandering in gewicht of soepelheid, of een nieuw doel zijn allemaal goede redenen om terug te komen. Voor kinderen vaker: zij groeien, de pasvorm groeit niet mee.',
  },
  {
    question: 'Hoe verloopt een bikefit?',
    answer:
      'We beginnen met een gesprek over jouw lichaam, je doelen en je klachten. Daarna kijken we naar jou op de fiets: houding, trapbeweging, zadelpositie, bewegingspatronen. We passen stap voor stap aan, met feedback na elke aanpassing, tot alles klopt. Je vertrekt met begrip waarom jouw fiets staat zoals ze staat.',
  },
  {
    question: 'Kan een bikefit ook bij mij thuis?',
    answer:
      'Ja, voor groepen, clubs en gezinnen komen we op locatie. Voor de meeste individuele fits werken we liever in de studio, omdat we daar meer controle hebben, maar als je niet naar ons kan komen, komen wij naar jou. Neem contact op en we bekijken het samen.',
  },
  FAQ_BRING_ITEM,
  FAQ_DURATION_ITEM,
  {
    question: 'Moet ik nieuwe onderdelen kopen?',
    answer:
      'Soms. Vaak niet. We werken altijd eerst met wat je al hebt; als een zadel, stuurpen of paar cleats echt niet bij jouw lichaam past, zeggen we het, met uitleg waarom, zonder druk.',
  },
  {
    question: 'Doen jullie ook e-bikes?',
    answer:
      'Ja. De principes blijven dezelfde: het lichaam van de fietser moet bij de fiets passen. We fitten koers-, gravel-, mountain-, stads-, toer- en e-bikes.',
  },
];

export const FAQ_PAGE: SeedPage = {
  slug: 'veelgestelde-vragen',
  title: 'Veelgestelde vragen',
  translationGroup: 'faq',
  source: 'content/about.html §2 (identical to prototype/bikefit.html#vragen)',
  metaTitle: 'Veelgestelde vragen over een bikefit',
  metaDescription:
    'Waarom een bikefit, hoe vaak, hoe lang hij duurt, wat je meebrengt, of het ook aan huis kan en of we e-bikes doen: kort en eerlijk beantwoord.',
  structuredDataType: 'FAQPage',
  blocks: [
    {
      type: 'hero',
      data: {
        variant: 'pageHead',
        eyebrow: 'Goed om te weten · Ninove',
        title: 'Veelgestelde vragen',
        titleEmphasis: '',
        subtitle: '',
        primaryCta: null,
        secondaryCta: null,
      },
    },
    {
      type: 'faq',
      data: {
        variant: 'default',
        eyebrow: '',
        title: '',
        lede: '',
        collapsible: false,
        emitStructuredData: true,
        items: FAQ_ITEMS,
      },
    },
    CALLOUT_BLOCK,
  ],
};
