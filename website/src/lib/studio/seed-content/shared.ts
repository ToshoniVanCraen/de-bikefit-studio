/**
 * Building blocks shared by the page seeds (`scripts/cms-seed.mts`) and the
 * offer rollout (`scripts/cms-rollout-aanbod.mts`). Plain data, no I/O.
 *
 * Provenance of the reused copy: `prototype/index.html`,
 * `prototype/bikefit.html` (see the header of `scripts/cms-seed.mts`).
 */

export type SeedBlock = { type: string; data: Record<string, unknown> };

export type SeedPage = {
  slug: string;
  title: string;
  translationGroup: string;
  /** Where every string on this page comes from. */
  source: string;
  metaTitle: string;
  metaDescription: string;
  structuredDataType: string;
  blocks: SeedBlock[];
};

export type SeedNavigationItem = {
  label: string;
  href: string;
  external: boolean;
  group: string;
  children: { label: string; href: string; external: boolean }[];
};

/**
 * The contact details as the bootstrap and the settings seed write them
 * (Instellingen → Contact is the master): international form on every surface
 * (Toshoni, 19 Oct 2026), the link was always +32; the public e-mail address
 * was confirmed by Toshoni on 13 Oct 2026 (register G-01). Page copy never types
 * them: it carries the tokens below.
 */
export const PHONE_LABEL = '+32 473 95 26 33';
export const PHONE_HREF = 'tel:+32473952633';
export const CONTACT_EMAIL = 'info@debikefitstudio.be';

/**
 * Copy tokens for those details (27 Oct 2026, `src/lib/studio/copy-tokens*.ts`):
 * the public site resolves them from the settings at render time, so a seed, an
 * e-mail or a page text says "{{telefoon}}" instead of the number. `{{adres}}` is
 * the street address on one line (Instellingen → Contact).
 */
export const PHONE_TOKEN = '{{telefoon}}';
export const PHONE_HREF_TOKEN = '{{telefoon-href}}';
export const EMAIL_TOKEN = '{{e-mail}}';
export const ADDRESS_TOKEN = '{{adres}}';
export const BOOKING_PATH = '/afspraak';

/** "Vier dingen, één positie" — prototype/index.html + bikefit.html. */
export const INSPECTION_CARDS = [
  {
    label: '01 / Houding',
    title: 'Je houding',
    body: 'Hoe je op de fiets zit bepaalt veel: comfort, kracht, en hoe lang je het volhoudt zonder klachten.',
  },
  {
    label: '02 / Trapbeweging',
    title: 'Je trapbeweging',
    body: 'Hoe je rondtrapt: heupen, knieën, voeten, en waar er iets vastloopt in die beweging.',
  },
  {
    label: '03 / Zadel',
    title: 'Zadelpositie',
    body: 'Hoogte, hoek en horizontale plaats van je zadel, met feedback na elke aanpassing.',
  },
  {
    label: '04 / Patronen',
    title: 'Bewegingspatronen',
    body: 'Gewoontes die je lichaam heeft aangeleerd. We brengen ze in kaart en leggen uit wat ze je kosten.',
  },
];

/**
 * "Hoe verloopt een bikefit?" — prototype/index.html #werkwijze; steps 03 and
 * 04 rewritten on Toshoni's review of 19 Oct 2026: what you take home (the
 * analysis and advice on paper, the measurements for a new bike) and that an
 * existing bike is adjusted on the spot.
 */
export const PROCESS_STEPS = [
  {
    number: '01',
    title: 'Gesprek',
    body: 'We beginnen met een gesprek over jouw lichaam, je doelen en je klachten.',
  },
  {
    number: '02',
    title: 'Kijken',
    body: 'Daarna kijken we naar jou op de fiets: houding, trapbeweging, zadelpositie, bewegingspatronen.',
  },
  {
    number: '03',
    title: 'Aanpassen',
    body: 'Heb je je fiets al, dan passen we ze ter plaatse aan: stap voor stap, met feedback na elke aanpassing, tot alles klopt.',
  },
  {
    number: '04',
    title: 'Naar huis',
    body: 'Je vertrekt met je analyse en advies op papier. Koop je een nieuwe fiets, dan weet je precies welke maten en afstelling bij jou passen. Heb je de fiets al, dan rij je naar huis op een fiets die bij jouw lichaam past, en begrijp je waarom ze staat zoals ze staat.',
  },
];

export const CONTACT_BLOCK: SeedBlock = {
  type: 'contact',
  data: {
    variant: 'default',
    eyebrow: 'Contact',
    title: 'Boek je bikefit',
    lede: '',
    phoneLabel: PHONE_TOKEN,
    phoneHref: PHONE_HREF_TOKEN,
    email: '',
    // The street address of Instellingen → Contact, on one line (27 Oct 2026): the home page
    // showed only "Ninove". `city` stays empty so the line is not followed by a second one.
    addressLines: [ADDRESS_TOKEN],
    city: '',
    hours: 'Op afspraak',
    mapEmbedUrl: '',
    cta: null,
  },
};

/** Closing band on the FAQ; books like the header's "Afspraak maken". */
export const CALLOUT_BLOCK: SeedBlock = {
  type: 'cta',
  data: {
    variant: 'accent',
    title: 'Comfort is een keuze. Maak ze.',
    body: '',
    primaryCta: { label: 'Boek je bikefit →', href: BOOKING_PATH, external: false },
    secondaryCta: null,
  },
};
