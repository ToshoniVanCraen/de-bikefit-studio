import { z } from 'zod';
import {
  emptyImage,
  eyebrow,
  imageRefSchema,
  lede,
  optionalLinkSchema,
  sectionVariantSchema,
} from './block-primitives';
import { aanbodBlockRegistry } from './blocks-aanbod';
import { locationBlockRegistry } from './blocks-location';

/**
 * Content-block registry.
 *
 * Every block type the CMS understands is declared once, here, with:
 *  - `label` / `description` — Dutch, shown in the admin block picker (Worker B)
 *  - `schema`      — zod validation, the single source of truth for the shape
 *  - `defaultData` — what "add this block" inserts
 *
 * The block types and their fields are derived from the real prototype and
 * copy decks: `prototype/index.html`, `prototype/bikefit.html`,
 * `content/index.html`, `content/about.html`, `content/booking.html`.
 *
 * Worker B validates with `validateBlock()` before writing `cms_blocks.data`.
 * Worker C renders from `publishedSnapshot.blocks`, which has already passed
 * `validateBlocks()` at publish time.
 *
 * IMPORTANT for Worker C: these schemas describe *data*, not markup. Rendering,
 * classNames and the design-system mapping live in `src/components/studio/**`.
 */

// ---------------------------------------------------------------------------
// Shared primitives live in `block-primitives.ts` and are re-exported here
// ---------------------------------------------------------------------------

export {
  imageRefSchema,
  linkSchema,
  sectionVariantSchema,
  type CmsImageRef,
  type CmsLink,
  type SectionVariant,
} from './block-primitives';

// ---------------------------------------------------------------------------
// Block schemas
// ---------------------------------------------------------------------------

/**
 * `hero` — the landing hero (`prototype/index.html .hero`) and the compact
 * page header on subpages (`prototype/bikefit.html .page-head`).
 * `titleEmphasis` reproduces the `<em>` in "Fiets met <em>comfort.</em>".
 */
export const heroSchema = z.object({
  variant: z.enum(['full', 'pageHead']).default('full'),
  eyebrow,
  title: z.string().min(1),
  titleEmphasis: z.string().default(''),
  subtitle: z.string().default(''),
  primaryCta: optionalLinkSchema,
  secondaryCta: optionalLinkSchema,
  image: imageRefSchema.default(emptyImage),
});

/** `richText` — a free prose section. `html` is sanitised on write (`repo.updateBlock()` → `actions/sanitize.ts`). */
export const richTextSchema = z.object({
  variant: sectionVariantSchema,
  eyebrow,
  title: z.string().default(''),
  html: z.string().default(''),
});

/**
 * `services` — the card grids. Covers both shapes seen in the prototype:
 * "Vier dingen, één positie" (numbered labels `01 / Houding`) and
 * "Vier manieren om te boeken" (the bookable fits, with durations).
 */
export const servicesSchema = z.object({
  variant: sectionVariantSchema,
  eyebrow,
  title: z.string().default(''),
  lede,
  columns: z.union([z.literal(2), z.literal(3), z.literal(4)]).default(4),
  cards: z
    .array(
      z.object({
        label: z.string().default(''),
        title: z.string().min(1),
        body: z.string().default(''),
        /** e.g. "90 minuten" — shown on the bookable-fit cards. */
        duration: z.string().default(''),
        image: imageRefSchema.default(emptyImage),
        cta: optionalLinkSchema,
      }),
    )
    .default([]),
});

/** `process` — "Hoe verloopt een bikefit?", numbered steps. */
export const processSchema = z.object({
  variant: sectionVariantSchema,
  eyebrow,
  title: z.string().default(''),
  lede,
  steps: z
    .array(
      z.object({
        number: z.string().default(''),
        title: z.string().min(1),
        body: z.string().default(''),
      }),
    )
    .default([]),
});

/** `audience` — "Voor wie is dit?", the five rider personas. */
export const audienceSchema = z.object({
  variant: sectionVariantSchema,
  eyebrow,
  title: z.string().default(''),
  lede,
  items: z
    .array(
      z.object({
        number: z.string().default(''),
        title: z.string().min(1),
        body: z.string().default(''),
        /** The copy deck gives the "Jonge fietsers" entry extra room. */
        featured: z.boolean().default(false),
      }),
    )
    .default([]),
});

/**
 * `faq` — "Veelgestelde vragen". The copy deck flags these answers as SEO
 * content, so `emitStructuredData` drives FAQPage JSON-LD in Worker C.
 */
export const faqSchema = z.object({
  variant: sectionVariantSchema,
  eyebrow,
  title: z.string().default(''),
  lede,
  collapsible: z.boolean().default(false),
  emitStructuredData: z.boolean().default(true),
  items: z
    .array(
      z.object({
        question: z.string().min(1),
        answer: z.string().min(1),
      }),
    )
    .default([]),
});

/** `cta` — the accent callout band ("Comfort is een keuze. Maak ze."). */
export const ctaSchema = z.object({
  variant: z.enum(['accent', 'dark', 'gray']).default('accent'),
  title: z.string().min(1),
  body: z.string().default(''),
  primaryCta: optionalLinkSchema,
  secondaryCta: optionalLinkSchema,
});

/**
 * `imageText` — the two-column split sections (`#verhaal`, `#waarom`,
 * `#aan-huis`, `#jeugd`). Supports paragraphs, a pull quote, a bullet list and
 * an optional facts panel (suggested by `content/about.html`).
 */
export const imageTextSchema = z.object({
  variant: sectionVariantSchema,
  eyebrow,
  title: z.string().default(''),
  paragraphs: z.array(z.string()).default([]),
  bullets: z.array(z.string()).default([]),
  quote: z.string().default(''),
  quoteAttribution: z.string().default(''),
  facts: z.array(z.object({ label: z.string(), value: z.string() })).default([]),
  cta: optionalLinkSchema,
  image: imageRefSchema.default(emptyImage),
  imagePosition: z.enum(['left', 'right']).default('right'),
});

/**
 * `pricing` — the prototype and copy decks contain **no amounts**; the copy
 * deck records "prijzen tonen?" as an open question. Since 27 Oct 2026 the
 * amounts and durations of the bookable fits are typed once, in their masters
 * (the offering's variants, the booking services): `defaultData` ships those
 * plans with `{{prijs:…}}` and `{{duur:…}}` tokens and `isPlaceholder: true`,
 * so the block stays hidden until someone clears the flag.
 */
export const pricingSchema = z.object({
  variant: sectionVariantSchema,
  eyebrow,
  title: z.string().default(''),
  lede,
  currency: z.string().default('EUR'),
  /** Hide the block on the public site until real prices are entered. */
  isPlaceholder: z.boolean().default(true),
  footnote: z.string().default(''),
  plans: z
    .array(
      z.object({
        title: z.string().min(1),
        /** Amount in euro cents; null while unknown. */
        priceCents: z.number().int().nonnegative().nullable().default(null),
        /** Free-text override, e.g. "Op aanvraag" / "vanaf". */
        priceLabel: z.string().default(''),
        duration: z.string().default(''),
        description: z.string().default(''),
        features: z.array(z.string()).default([]),
        highlighted: z.boolean().default(false),
        cta: optionalLinkSchema,
      }),
    )
    .default([]),
});

/**
 * `contact` — the studio's contact details. The defaults hold known facts only
 * (phone, city, "Op afspraak"). The street address is a setting (Instellingen →
 * Contact), shown by the `location` block, so it is not a default of this one.
 */
export const contactSchema = z.object({
  variant: sectionVariantSchema,
  eyebrow,
  title: z.string().default(''),
  lede,
  phoneLabel: z.string().default(''),
  phoneHref: z.string().default(''),
  email: z.string().default(''),
  addressLines: z.array(z.string()).default([]),
  city: z.string().default(''),
  /** e.g. "Op afspraak". */
  hours: z.string().default(''),
  mapEmbedUrl: z.string().default(''),
  cta: optionalLinkSchema,
});

/**
 * `testimonial` — "Succesverhalen · reviews" from `content/index.html`.
 * Marked placeholder in the copy deck ("drie tot vijf reviews, roterend");
 * every review names the kind of rider.
 */
export const testimonialSchema = z.object({
  variant: sectionVariantSchema,
  eyebrow,
  title: z.string().default(''),
  rotating: z.boolean().default(true),
  isPlaceholder: z.boolean().default(true),
  items: z
    .array(
      z.object({
        quote: z.string().min(1),
        author: z.string().default(''),
        /** e.g. "42 · recreatieve fietser". */
        meta: z.string().default(''),
        image: imageRefSchema.default(emptyImage),
      }),
    )
    .default([]),
});

/**
 * `booking` — the online booking widget on `/afspraak` (provider or
 * "Iedereen" → service → day → slot → details → confirmation). The block
 * carries copy and a service filter only; services, providers, rules and live
 * availability are read at render time through `@/lib/booking/content`, so
 * nothing here goes stale.
 *
 * `showProviderChoice` is AND-ed with the `booking.showProviderChoice` site
 * setting and only matters when more than one provider is bookable. A booking
 * made as "Iedereen" waits for the beheerder's assignment (17 Oct 2026).
 * An empty `successText` falls back to `booking.confirmationText`.
 */
export const bookingSchema = z.object({
  variant: sectionVariantSchema,
  eyebrow,
  title: z.string().default(''),
  lede,
  /** `cms_services.id`s to offer, in this order. Empty = every active service. */
  serviceIds: z.array(z.string()).default([]),
  showProviderChoice: z.boolean().default(true),
  successTitle: z.string().default('Je afspraak staat vast'),
  successText: z.string().default(''),
});

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

export type BlockDefinition<S extends z.ZodType = z.ZodType> = {
  label: string;
  description: string;
  /** One line shown above the fields in the admin editor (e.g. where open placeholders are tracked). */
  editorHint?: string;
  schema: S;
  defaultData: z.infer<S>;
};

export const blockRegistry = {
  hero: {
    label: 'Hero',
    description: 'Openingsblok met titel, ondertitel en knoppen.',
    schema: heroSchema,
    defaultData: {
      variant: 'full',
      eyebrow: 'De Bikefit Studio',
      title: 'Fiets met',
      titleEmphasis: 'comfort.',
      subtitle:
        'Het leven is te kort voor pijn op de fiets. We lijnen de fiets uit op jou, niet omgekeerd, zodat elke rit beter voelt en je langer gezond blijft op de fiets.',
      primaryCta: { label: 'Boek je bikefit →', href: '/afspraak', external: false },
      secondaryCta: { label: 'Hoe verloopt een bikefit?', href: '/bikefit', external: false },
      image: emptyImage,
    },
  },

  richText: {
    label: 'Tekst',
    description: 'Vrije tekst met koppen, alinea’s en opsommingen.',
    schema: richTextSchema,
    defaultData: {
      variant: 'default',
      eyebrow: '',
      title: '',
      html: '<p></p>',
    },
  },

  services: {
    label: 'Diensten',
    description: 'Kaartenraster, bv. “Vier manieren om te boeken”.',
    schema: servicesSchema,
    defaultData: {
      variant: 'gray',
      eyebrow: 'Onze fits',
      title: 'Vier manieren om te boeken',
      lede: 'We fitten koers-, gravel-, mountain-, stads-, toer- en e-bikes. De principes blijven dezelfde: het lichaam van de fietser moet bij de fiets passen.',
      columns: 4,
      cards: [
        {
          label: '',
          title: 'Volwassenenfit',
          body: 'De standaard bikefit. Reken op {{duur:volwassenenfit}}; we haasten ons niet.',
          duration: '{{duur:volwassenenfit}}',
          image: emptyImage,
          cta: null,
        },
        {
          label: '',
          title: 'Jeugdfit – eenmalig',
          body: 'Voor fietsers onder 16: één fit, afgestemd op een lichaam in groei, zonder opvolging.',
          duration: '{{duur:jeugdfit}}',
          image: emptyImage,
          cta: null,
        },
        {
          label: '',
          title: 'Jeugdfit – volledig pakket',
          body: 'Voor fietsers onder 16: dezelfde fit met {{opvolging:jeugd-pakket}} gratis opvolging. Aangeraden, want jonge renners groeien snel.',
          duration: '{{duur:jeugdfit-pakket}}',
          image: emptyImage,
          cta: null,
        },
        {
          label: '',
          title: 'Fit aan huis',
          body: 'Voor groepen, clubs en gezinnen komen we op locatie. Neem contact op en we bekijken het samen.',
          duration: '',
          image: emptyImage,
          cta: null,
        },
      ],
    },
  },

  process: {
    label: 'Werkwijze',
    description: 'Genummerde stappen, bv. “Hoe verloopt een bikefit?”.',
    schema: processSchema,
    defaultData: {
      variant: 'default',
      eyebrow: 'Werkwijze',
      title: 'Hoe verloopt een bikefit?',
      lede: 'Een gesprek, een blik op jou en je fiets, en stap voor stap aanpassen tot alles klopt. Je vertrekt met begrip waarom jouw fiets staat zoals ze staat.',
      steps: [
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
      ],
    },
  },

  audience: {
    label: 'Voor wie',
    description: 'Doelgroepen, bv. “Voor wie is dit?”.',
    schema: audienceSchema,
    defaultData: {
      variant: 'gray',
      eyebrow: 'Voor wie',
      title: 'Voor wie is dit?',
      lede: 'Of je nu zeven of zeventig bent, koerst of pendelt, een weekendrijder of een doordeweekse toerist: iedereen verdient het om te genieten van alles wat een fiets te bieden heeft.',
      items: [
        {
          number: '01',
          title: 'Jonge fietsers',
          body: 'Kinderen groeien snel: een fiets die vandaag past, klopt volgend seizoen al niet meer. We volgen de pasvorm op terwijl ze groeien. Betaalbaar, duidelijk, op hun tempo.',
          featured: true,
        },
        {
          number: '02',
          title: 'Wielertoeristen',
          body: 'Lange dagen, zware tassen, verre horizonten: een pasvorm waar je op kilometer 200 nog op kan rekenen, maakt van de tocht wat ze hoort te zijn.',
          featured: false,
        },
        {
          number: '03',
          title: 'Recreatieve fietsers',
          body: 'Voor de weekendrit die fris moet eindigen, niet stijf en pijnlijk de ochtend erna.',
          featured: false,
        },
        {
          number: '04',
          title: 'Woon-werkfietsers',
          body: 'Vijf dagen per week, weer of geen weer. Een pasvorm die het volhoudt naast de koude handen en de natte broek.',
          featured: false,
        },
        {
          number: '05',
          title: 'Beginners en ervaren fietsers',
          body: 'Je eerste kilometers of al jaren onderweg: we bekijken wat jij nodig hebt.',
          featured: false,
        },
      ],
    },
  },

  faq: {
    label: 'Veelgestelde vragen',
    description: 'Vraag-en-antwoordlijst; genereert FAQPage-structured data.',
    schema: faqSchema,
    defaultData: {
      variant: 'default',
      eyebrow: 'Goed om te weten',
      title: 'Veelgestelde vragen',
      lede: '',
      collapsible: false,
      emitStructuredData: true,
      items: [
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
        {
          question: 'Wat breng ik mee voor een bikefit?',
          answer:
            'Je fiets (proper en in werkende staat), de schoenen en fietskleding waarin je écht rijdt, en eventuele notities over wat je dwars zit. Neem ook je eigen pedalen mee, zeker bij Time-pedalen of de nieuwste Shimano-pedalen: niet elk systeem hebben we in de studio. Meer hebben we niet nodig. De rest doen wij.',
        },
        {
          question: 'Hoe lang duurt een bikefit?',
          answer:
            'Dat hangt af van de fit die je kiest. De duur staat bij elke fit op haar eigen pagina onder Aanbod: Bikefit – huidige fiets en Bikefit – aankoop nieuwe fiets.',
        },
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
      ],
    },
  },

  cta: {
    label: 'Oproep',
    description: 'Accentband met één duidelijke actie.',
    schema: ctaSchema,
    defaultData: {
      variant: 'accent',
      title: 'Comfort is een keuze. Maak ze.',
      body: '',
      primaryCta: { label: 'Boek je bikefit →', href: '/afspraak', external: false },
      secondaryCta: null,
    },
  },

  imageText: {
    label: 'Beeld + tekst',
    description: 'Tweekolomsblok met beeld links of rechts.',
    schema: imageTextSchema,
    defaultData: {
      variant: 'dark',
      eyebrow: 'Het verhaal',
      title: 'Ik ben Rutger.',
      paragraphs: [
        'Ik zit op een fiets zolang ik me kan herinneren. Negentien jaar competitie, en een heel leven daarbuiten gewoon fietsen: naar school, naar het werk, het heuvelland in op zondag, over de grens tijdens de zomer.',
        'Mijn eerste wedstrijd ging niet over uitslagen of tussentijden of watts. Ze ging over wat een fiets voor mij kón doen. Die ervaring is de reden dat ik er, dertig jaar later, nog steeds sta.',
        'En dat is wat ik elke fietser gun. Geen pijn. Geen lichaam dat eerder opgeeft dan de weg. Geen fiets die tegen je vecht. Gewoon de rit, die ene waardoor je in de eerste plaats verliefd werd op de fiets.',
      ],
      bullets: [],
      quote: '',
      quoteAttribution: '',
      facts: [],
      cta: { label: 'Lees meer over de bikefit →', href: '/bikefit', external: false },
      image: emptyImage,
      imagePosition: 'right',
    },
  },

  pricing: {
    label: 'Prijzen',
    description:
      'Prijskaarten. De bedragen komen uit Beheer → Aanbod, via de prijs-tokens in de standaardinhoud. Het blok blijft verborgen zolang “placeholder” aanstaat en verschijnt enkel op /aanbod en de dienstpagina’s.',
    schema: pricingSchema,
    defaultData: {
      variant: 'gray',
      eyebrow: 'Tarieven',
      title: 'Wat kost een bikefit?',
      lede: '',
      currency: 'EUR',
      isPlaceholder: true,
      footnote: '',
      plans: [
        {
          title: 'Volwassenenfit',
          priceCents: null,
          priceLabel: '{{prijs:bikefit-huidige-fiets:adult}}',
          duration: '{{duur:volwassenenfit}}',
          description:
            'De volledige bikefit op je eigen fiets. Probleemopvolging tot {{opvolging:volwassene}} na je fit is inbegrepen.',
          features: [],
          highlighted: true,
          cta: null,
        },
        {
          title: 'Jeugdfit – eenmalig',
          priceCents: null,
          priceLabel: '{{prijs:bikefit-huidige-fiets:youth}}',
          duration: '{{duur:jeugdfit}}',
          description:
            'Voor fietsers onder 16: één fit, afgestemd op een lichaam in groei, zonder opvolging.',
          features: [],
          highlighted: false,
          cta: null,
        },
        {
          title: 'Jeugdfit – volledig pakket',
          priceCents: null,
          priceLabel: '{{prijs:bikefit-huidige-fiets:youth-package}}',
          duration: '{{duur:jeugdfit-pakket}}',
          description:
            'Voor fietsers onder 16: dezelfde fit met {{opvolging:jeugd-pakket}} gratis opvolging. Aangeraden, want jonge renners groeien snel.',
          features: [],
          highlighted: false,
          cta: null,
        },
        {
          title: 'Fit aan huis',
          priceCents: null,
          priceLabel: 'Op aanvraag',
          duration: '',
          description: 'Voor groepen, clubs en gezinnen komen we op locatie.',
          features: [],
          highlighted: false,
          cta: null,
        },
      ],
    },
  },

  contact: {
    label: 'Contact',
    description: 'Contactgegevens en openingsuren.',
    schema: contactSchema,
    defaultData: {
      variant: 'default',
      eyebrow: 'Contact',
      title: 'Boek je bikefit',
      lede: '',
      phoneLabel: '{{telefoon}}',
      phoneHref: '{{telefoon-href}}',
      email: '',
      addressLines: [],
      city: 'Ninove',
      hours: 'Op afspraak',
      mapEmbedUrl: '',
      cta: { label: 'Boek je bikefit →', href: '/afspraak', external: false },
    },
  },

  testimonial: {
    label: 'Ervaringen',
    description:
      'Reviews van fietsers. De teksten in de standaardinhoud zijn voorbeelden uit het tekstconcept en moeten vervangen worden.',
    schema: testimonialSchema,
    defaultData: {
      variant: 'gray',
      eyebrow: 'Succesverhalen',
      title: 'Wat fietsers ervan vinden',
      rotating: true,
      isPlaceholder: true,
      items: [
        {
          quote:
            'Drie jaar zeurende rugpijn na elke zondagse rit. Eén sessie in de studio en ik doe 80 km zonder aan mijn rug te denken. Had dit vijf jaar geleden moeten doen.',
          author: 'Anna',
          meta: '42 · recreatieve fietser',
          image: emptyImage,
        },
        {
          quote:
            'Rutger heeft mijn zadel en stuur bijgesteld tussen twee koersen door. Voelde het verschil bij de eerste sprint. Mijn coach merkte het ook.',
          author: 'Tom',
          meta: '14 · jeugdrenner',
          image: emptyImage,
        },
        {
          quote:
            'Veertig kilometer per dag, elke dag. Mijn handen werden altijd gevoelloos tegen dat ik op het werk aankwam. Nu niet meer.',
          author: 'Pieter',
          meta: '38 · pendelaar',
          image: emptyImage,
        },
        {
          quote:
            'We brachten alle vier de fietsen mee. De kinderen erbij. We vertrokken met fietsen die eindelijk de onze voelen, en zonder rollende ogen van de tiener.',
          author: 'Mieke & Jan',
          meta: 'gezin',
          image: emptyImage,
        },
      ],
    },
  },

  booking: {
    label: 'Afspraak boeken',
    description:
      'Online boeken: dienst, aanbieder, dag en uur kiezen en je gegevens invullen. Diensten en beschikbaarheid komen uit Afspraken.',
    schema: bookingSchema,
    defaultData: {
      variant: 'default',
      eyebrow: 'Online boeken',
      title: 'Kies je moment',
      lede: 'Kies je fit, een dag en een uur dat past. Je krijgt meteen een bevestiging per e-mail.',
      serviceIds: [],
      showProviderChoice: true,
      successTitle: 'Je afspraak staat vast',
      successText: '',
    },
  },

  // `offerCatalogue`, `giftVoucher`, `team`: see `blocks-aanbod.ts`; `location`: see `blocks-location.ts`.
  ...aanbodBlockRegistry,
  ...locationBlockRegistry,
} as const satisfies Record<string, BlockDefinition>;

export type BlockType = keyof typeof blockRegistry;

export const BLOCK_TYPES = Object.keys(blockRegistry) as BlockType[];

export function isBlockType(value: string): value is BlockType {
  return Object.prototype.hasOwnProperty.call(blockRegistry, value);
}

export function getBlockDefinition(type: BlockType): BlockDefinition {
  return blockRegistry[type] as BlockDefinition;
}

/** Deep clone so callers can never mutate the registry's `defaultData`. */
export function defaultDataFor(type: BlockType): Record<string, unknown> {
  return structuredClone(blockRegistry[type].defaultData) as Record<string, unknown>;
}

export type BlockTypeData = {
  [K in BlockType]: z.infer<(typeof blockRegistry)[K]['schema']>;
};

/** A block as stored in `cms_blocks` / a published snapshot. */
export type BlockInstance = {
  [K in BlockType]: { id: string; type: K; data: BlockTypeData[K] };
}[BlockType];

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

export type BlockValidationIssue = {
  index: number;
  id: string | null;
  type: string;
  message: string;
};

export type BlockValidationResult =
  { ok: true; blocks: BlockInstance[] } | { ok: false; issues: BlockValidationIssue[] };

/** Validates and normalises one block's `data` against its registry schema. */
export function validateBlock(
  type: string,
  data: unknown,
): { ok: true; data: unknown } | { ok: false; message: string } {
  if (!isBlockType(type)) return { ok: false, message: `Onbekend bloktype: ${type}` };
  const parsed = blockRegistry[type].schema.safeParse(data);
  if (!parsed.success) {
    return { ok: false, message: formatZodError(parsed.error) };
  }
  return { ok: true, data: parsed.data };
}

/**
 * Validates an ordered block list. Returns normalised blocks (zod defaults
 * applied) on success, or every issue at once so the admin can show them all.
 *
 * Called by `repo.publishPage()` — content can never be frozen into a
 * `published_snapshot` without passing this.
 */
export function validateBlocks(
  input: ReadonlyArray<{ id?: string | null; type: string; data: unknown }>,
): BlockValidationResult {
  const issues: BlockValidationIssue[] = [];
  const blocks: BlockInstance[] = [];

  input.forEach((block, index) => {
    const result = validateBlock(block.type, block.data);
    if (!result.ok) {
      issues.push({ index, id: block.id ?? null, type: block.type, message: result.message });
      return;
    }
    blocks.push({
      id: block.id ?? `${block.type}-${index}`,
      type: block.type as BlockType,
      data: result.data,
    } as BlockInstance);
  });

  return issues.length > 0 ? { ok: false, issues } : { ok: true, blocks };
}

function formatZodError(error: z.ZodError): string {
  return error.issues
    .map((issue) => {
      const path = issue.path.join('.');
      return path ? `${path}: ${issue.message}` : issue.message;
    })
    .join('; ');
}

// ---------------------------------------------------------------------------
// Navigation
// ---------------------------------------------------------------------------

export const NAVIGATION_KEYS = ['main', 'footer'] as const;
export type NavigationKey = (typeof NAVIGATION_KEYS)[number];

const navigationChildSchema = z.object({
  label: z.string().min(1),
  href: z.string().min(1),
  external: z.boolean().default(false),
});

export const navigationItemSchema = navigationChildSchema.extend({
  /** Footer menus use this to render labelled column groups. */
  group: z.string().default(''),
  children: z.array(navigationChildSchema).default([]),
});

export const navigationItemsSchema = z.array(navigationItemSchema);
export type NavigationItem = z.infer<typeof navigationItemSchema>;

export function validateNavigationItems(
  items: unknown,
): { ok: true; items: NavigationItem[] } | { ok: false; message: string } {
  const parsed = navigationItemsSchema.safeParse(items);
  return parsed.success
    ? { ok: true, items: parsed.data }
    : { ok: false, message: formatZodError(parsed.error) };
}

// ---------------------------------------------------------------------------
// Site settings: `./site-settings.ts` (split out on 27 Oct 2026, re-exported
// here so this stays the import path; named, not `export *`, for the CLIs)
// ---------------------------------------------------------------------------

export {
  defaultSiteSettings,
  isSiteSettingKey,
  parseSiteSetting,
  SITE_SETTING_KEYS,
  siteSettingSchemas,
  type SiteSettingKey,
  type SiteSettings,
} from './site-settings';

// ---------------------------------------------------------------------------
// Page SEO + published snapshot
// ---------------------------------------------------------------------------

export const STRUCTURED_DATA_TYPES = [
  'none',
  'WebPage',
  'LocalBusiness',
  'Service',
  'FAQPage',
  'AboutPage',
  'ContactPage',
] as const;
export type StructuredDataType = (typeof STRUCTURED_DATA_TYPES)[number];

export const pageSeoSchema = z.object({
  metaTitle: z.string().nullable().default(null),
  metaDescription: z.string().nullable().default(null),
  canonicalOverride: z.string().nullable().default(null),
  ogTitle: z.string().nullable().default(null),
  ogDescription: z.string().nullable().default(null),
  ogImageMediaId: z.string().nullable().default(null),
  noIndex: z.boolean().default(false),
  structuredDataType: z.string().nullable().default(null),
  structuredDataOverrides: z.record(z.string(), z.unknown()).nullable().default(null),
});
export type PageSeo = z.infer<typeof pageSeoSchema>;

/**
 * The exact shape frozen into `cms_pages.published_snapshot` at publish time,
 * and the only thing the public site reads.
 */
export const publishedSnapshotSchema = z.object({
  version: z.literal(1).default(1),
  locale: z.string(),
  slug: z.string(),
  translationGroup: z.string(),
  title: z.string(),
  kind: z.string().default('default'),
  publishedAt: z.string(),
  seo: pageSeoSchema,
  blocks: z.array(
    z.object({
      id: z.string(),
      type: z.string(),
      data: z.unknown(),
    }),
  ),
});
export type PublishedSnapshot = Omit<z.infer<typeof publishedSnapshotSchema>, 'blocks'> & {
  blocks: BlockInstance[];
};

export function parsePublishedSnapshot(value: unknown): PublishedSnapshot | null {
  const parsed = publishedSnapshotSchema.safeParse(value);
  if (!parsed.success) return null;
  const blocks = validateBlocks(parsed.data.blocks);
  if (!blocks.ok) return null;
  return { ...parsed.data, blocks: blocks.blocks };
}
