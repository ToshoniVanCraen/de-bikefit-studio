import { z } from 'zod';
import { FOCUS_HINT, FOCUS_PATTERN } from '@/lib/studio/photo-focus';
import {
  emptyImage,
  eyebrow,
  imageRefSchema,
  lede,
  optionalLinkSchema,
  sectionVariantSchema,
} from './block-primitives';

/**
 * The section blocks of the site redesign (24 Nov 2026), registered in
 * `blockRegistry` (`blocks.ts`) through {@link sectionsBlockRegistry} and the
 * three definitions below. Split out of `blocks.ts`, which is past the size
 * limit: `audience`, `faq` and `cta` moved here with their extensions, and the
 * three new blocks live here from the start. Plain module (zod only, no I/O),
 * like `blocks-aanbod.ts`.
 *
 *  - `welcome`     "Nieuw op de fiets?": the cream band for people who do not ride much
 *  - `chooser`     "Keuzehulp": which service fits me, one linked card per answer
 *  - `photoStrip`  photos: the strip of the home page, a gallery, or one wide band
 *  - `audience`    gains an optional `image` per item (photo tiles)
 *  - `faq`         gains optional groups with headings and anchors
 *  - `cta`         gains an optional photo ground and a compact size
 *
 * Every extension is optional with a default, so a block stored before this
 * change stays valid and renders in the new look without an edit.
 *
 * No fact is typed in a default: the phone number is `{{telefoon}}` and
 * `{{telefoon-href}}` (the copy tokens resolve in every string of a block,
 * labels and `href`s included).
 */

// ---------------------------------------------------------------------------
// welcome
// ---------------------------------------------------------------------------

/**
 * `welcome` — the cream "Nieuw op de fiets?" band: eyebrow, a title whose
 * second line (`titleEmphasis`) is set in italic wine like the hero, a short
 * text, up to two buttons and a list of white check-mark rows.
 */
export const welcomeSchema = z.object({
  eyebrow,
  title: z.string().min(1),
  /** The second line of the title, italic and in the accent colour. */
  titleEmphasis: z.string().default(''),
  body: z.string().default(''),
  primaryCta: optionalLinkSchema,
  secondaryCta: optionalLinkSchema,
  items: z
    .array(
      z.object({
        title: z.string().min(1),
        body: z.string().default(''),
      }),
    )
    .min(2, 'Kies minstens 2 punten')
    .max(6, 'Kies hoogstens 6 punten'),
});

// ---------------------------------------------------------------------------
// chooser
// ---------------------------------------------------------------------------

/**
 * `chooser` — "Keuzehulp": two to four cards, each one link as a whole.
 * `label` is the small line above the title ("Ik koop een fiets"), `linkLabel`
 * the arrow line at the bottom. `href` and `linkLabel` may hold copy tokens
 * (`{{telefoon-href}}`, `{{telefoon}}`): the block renderer resolves every
 * string. `featured` turns a card into the wine one (the "ik weet het niet"
 * card that calls the studio).
 */
export const chooserSchema = z.object({
  variant: z.enum(['default', 'gray']).default('default'),
  eyebrow,
  title: z.string().default(''),
  lede,
  choices: z
    .array(
      z.object({
        label: z.string().default(''),
        title: z.string().min(1),
        body: z.string().default(''),
        linkLabel: z.string().default(''),
        href: z.string().min(1),
        featured: z.boolean().default(false),
      }),
    )
    .min(2, 'Kies minstens 2 kaarten')
    .max(4, 'Kies hoogstens 4 kaarten'),
});

// ---------------------------------------------------------------------------
// photoStrip
// ---------------------------------------------------------------------------

export const PHOTO_STRIP_LAYOUTS = ['strip', 'gallery', 'wide'] as const;

/**
 * `photoStrip` — photos without a text section around them.
 *
 *  - `strip`    the home page strip: figures side by side, the first one wider,
 *               the caption over the bottom left corner, a slow zoom on hover
 *  - `gallery`  an optional eyebrow and title, then equal photos
 *  - `wide`     one full-bleed band (the first image; eyebrow, title and
 *               captions are not shown)
 *
 * `focus` is an optional `object-position` ("50% 55%") for a photo whose
 * subject is not in the middle. An image slot without a picture is skipped.
 */
export const photoStripSchema = z.object({
  layout: z.enum(PHOTO_STRIP_LAYOUTS).default('strip'),
  variant: sectionVariantSchema,
  eyebrow,
  title: z.string().default(''),
  images: z
    .array(
      z.object({
        image: imageRefSchema.default(emptyImage),
        caption: z.string().default(''),
        focus: z.string().regex(FOCUS_PATTERN, FOCUS_HINT).default(''),
      }),
    )
    .min(1, 'Kies minstens 1 foto')
    .max(6, 'Kies hoogstens 6 foto’s'),
});

// ---------------------------------------------------------------------------
// audience, faq, cta (moved from blocks.ts, extended)
// ---------------------------------------------------------------------------

/**
 * `audience` — "Voor wie is dit?". With an `image` on the items it renders as
 * photo tiles; without any it renders as plain tiles (a wine rule, the number,
 * the title and the text).
 */
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
        /** Optional photo: one item with a picture turns the grid into photo tiles. */
        image: imageRefSchema.default(emptyImage),
      }),
    )
    .default([]),
});

/** A FAQ group anchor: lower-case words joined by hyphens, or empty. */
const GROUP_ANCHOR_PATTERN = /^(?:|[a-z0-9]+(?:-[a-z0-9]+)*)$/;

/**
 * `faq` — "Veelgestelde vragen". The copy deck flags these answers as SEO
 * content, so `emitStructuredData` drives FAQPage JSON-LD.
 *
 * Groups: `items` stays one flat list. Consecutive questions with the same
 * `group` text sit under one heading; `groupAnchor` (on any question of the
 * group, normally the first) is the id of that heading, so a page can link to
 * `/veelgestelde-vragen#beginners`; without one the id is the heading's slug.
 * The JSON-LD lists every question once either way.
 */
export const faqSchema = z.object({
  variant: sectionVariantSchema,
  eyebrow,
  title: z.string().default(''),
  lede,
  collapsible: z.boolean().default(false),
  /** With `collapsible`: the first question of the list starts open. */
  openFirst: z.boolean().default(false),
  emitStructuredData: z.boolean().default(true),
  items: z
    .array(
      z.object({
        question: z.string().min(1),
        answer: z.string().min(1),
        group: z.string().default(''),
        groupAnchor: z
          .string()
          .regex(
            GROUP_ANCHOR_PATTERN,
            'Gebruik kleine letters, cijfers en koppeltekens, bv. beginners',
          )
          .default(''),
      }),
    )
    .default([]),
});

/**
 * `cta` — the accent band ("Comfort is een keuze. Maak ze.").
 *
 * `accent` and `dark` are the wine band, `gray` the cream one. An `image`
 * turns a wine band into a photo band with the wine gradient over it (ignored
 * on `gray`). `size` `auto` is compact when there is no `body` (a closing
 * line), regular otherwise.
 */
export const ctaSchema = z.object({
  variant: z.enum(['accent', 'dark', 'gray']).default('accent'),
  size: z.enum(['auto', 'regular', 'compact']).default('auto'),
  title: z.string().min(1),
  body: z.string().default(''),
  primaryCta: optionalLinkSchema,
  secondaryCta: optionalLinkSchema,
  image: imageRefSchema.default(emptyImage),
});

// ---------------------------------------------------------------------------
// Registry entries
// ---------------------------------------------------------------------------

/** Default questions carry no group: `group` and `groupAnchor` default to empty when the block is validated. */
const plainQuestion = (question: string, answer: string) => ({ question, answer });

const plainTile = (number: string, title: string, body: string, featured = false) => ({
  number,
  title,
  body,
  featured,
  image: emptyImage,
});

/** `audience`, `faq` and `cta` keep their place in the registry order (`blocks.ts` lists them). */
export const audienceBlock = {
  label: 'Voor wie',
  description:
    'Doelgroepen, bv. “Voor wie is dit?”. Met een foto per item wordt het een raster van fototegels.',
  schema: audienceSchema,
  defaultData: {
    variant: 'gray',
    eyebrow: 'Voor wie',
    title: 'Voor wie is dit?',
    lede: 'Of je nu zeven of zeventig bent, koerst of pendelt, een weekendrijder of een doordeweekse toerist: iedereen verdient het om te genieten van alles wat een fiets te bieden heeft.',
    items: [
      plainTile(
        '01',
        'Jonge fietsers',
        'Kinderen groeien snel: een fiets die vandaag past, klopt volgend seizoen al niet meer. We volgen de pasvorm op terwijl ze groeien. Betaalbaar, duidelijk, op hun tempo.',
        true,
      ),
      plainTile(
        '02',
        'Wielertoeristen',
        'Lange dagen, zware tassen, verre horizonten: een pasvorm waar je op kilometer 200 nog op kan rekenen, maakt van de tocht wat ze hoort te zijn.',
      ),
      plainTile(
        '03',
        'Recreatieve fietsers',
        'Voor de weekendrit die fris moet eindigen, niet stijf en pijnlijk de ochtend erna.',
      ),
      plainTile(
        '04',
        'Woon-werkfietsers',
        'Vijf dagen per week, weer of geen weer. Een pasvorm die het volhoudt naast de koude handen en de natte broek.',
      ),
      plainTile(
        '05',
        'Beginners en ervaren fietsers',
        'Je eerste kilometers of al jaren onderweg: we bekijken wat jij nodig hebt.',
      ),
    ],
  },
} as const;

export const faqBlock = {
  label: 'Veelgestelde vragen',
  description:
    'Vraag-en-antwoordlijst, eventueel in groepen met een kop en een anker; genereert FAQPage-structured data.',
  editorHint:
    'Groepen: typ dezelfde groepsnaam bij opeenvolgende vragen, dan staan ze onder één kop. Het anker (bv. beginners) zet je op de eerste vraag van de groep; zonder anker wordt het de naam van de groep in kleine letters. Elke vraag komt één keer in de structured data, groepen of niet.',
  schema: faqSchema,
  defaultData: {
    variant: 'default',
    eyebrow: 'Goed om te weten',
    title: 'Veelgestelde vragen',
    lede: '',
    collapsible: false,
    openFirst: false,
    emitStructuredData: true,
    items: [
      plainQuestion(
        'Waarom is een bikefit belangrijk?',
        'Een fiets die niet bij jouw lichaam past, kost je op drie manieren: pijn, verloren kracht, en kortere ritten. Een bikefit lijnt de fiets uit op jou, niet omgekeerd, zodat elke rit beter voelt en je langer gezond blijft op de fiets.',
      ),
      plainQuestion(
        'Hoe vaak moet ik een bikefit laten doen?',
        'Voor de meeste volwassenen om de 18 tot 24 maanden, of telkens als er iets verandert. Een nieuwe fiets, een blessure, een grote verandering in gewicht of soepelheid, of een nieuw doel zijn allemaal goede redenen om terug te komen. Voor kinderen vaker: zij groeien, de pasvorm groeit niet mee.',
      ),
      plainQuestion(
        'Hoe verloopt een bikefit?',
        'We beginnen met een gesprek over jouw lichaam, je doelen en je klachten. Daarna kijken we naar jou op de fiets: houding, trapbeweging, zadelpositie, bewegingspatronen. We passen stap voor stap aan, met feedback na elke aanpassing, tot alles klopt. Je vertrekt met begrip waarom jouw fiets staat zoals ze staat.',
      ),
      plainQuestion(
        'Kan een bikefit ook bij mij thuis?',
        'Ja, voor groepen, clubs en gezinnen komen we op locatie. Voor de meeste individuele fits werken we liever in de studio, omdat we daar meer controle hebben, maar als je niet naar ons kan komen, komen wij naar jou. Neem contact op en we bekijken het samen.',
      ),
      plainQuestion(
        'Wat breng ik mee voor een bikefit?',
        'Je fiets (proper en in werkende staat), de schoenen en fietskleding waarin je écht rijdt, en eventuele notities over wat je dwars zit. Neem ook je eigen pedalen mee, zeker bij Time-pedalen of de nieuwste Shimano-pedalen: niet elk systeem hebben we in de studio. Meer hebben we niet nodig. De rest doen wij.',
      ),
      plainQuestion(
        'Hoe lang duurt een bikefit?',
        'Dat hangt af van de fit die je kiest. De duur staat bij elke fit op haar eigen pagina onder Aanbod: Bikefit – huidige fiets en Bikefit – aankoop nieuwe fiets.',
      ),
      plainQuestion(
        'Moet ik nieuwe onderdelen kopen?',
        'Soms. Vaak niet. We werken altijd eerst met wat je al hebt; als een zadel, stuurpen of paar cleats echt niet bij jouw lichaam past, zeggen we het, met uitleg waarom, zonder druk.',
      ),
      plainQuestion(
        'Doen jullie ook e-bikes?',
        'Ja. De principes blijven dezelfde: het lichaam van de fietser moet bij de fiets passen. We fitten koers-, gravel-, mountain-, stads-, toer- en e-bikes.',
      ),
    ],
  },
} as const;

export const ctaBlock = {
  label: 'Oproep',
  description:
    'Band met één duidelijke actie: bordeaux, of crème bij “gray”. Met een foto krijgt een bordeaux band een fotoachtergrond.',
  editorHint:
    'Zonder tekst onder de titel (een slotregel zoals “Comfort is een keuze. Maak ze.”) is de band compact. De foto werkt enkel op een bordeaux band en krijgt een bordeaux sluier; kies een foto zonder tekst erin. Knoppen: een telefoonnummer typ je als {{telefoon-href}} (link) en {{telefoon}} (tekst).',
  schema: ctaSchema,
  defaultData: {
    variant: 'accent',
    size: 'auto',
    title: 'Comfort is een keuze. Maak ze.',
    body: '',
    primaryCta: { label: 'Boek je bikefit →', href: '/afspraak', external: false },
    secondaryCta: null,
    image: emptyImage,
  },
} as const;

export const sectionsBlockRegistry = {
  welcome: {
    label: 'Welkom (beginners)',
    description:
      'Crèmeband “Nieuw op de fiets?”: titel met een tweede regel in accent, een korte tekst, twee knoppen en een lijst met vinkjes.',
    schema: welcomeSchema,
    defaultData: {
      eyebrow: 'Nieuw op de fiets?',
      title: 'Weinig of geen fietservaring?',
      titleEmphasis: 'Je bent 100% welkom.',
      body: 'Je hoeft geen renner te zijn om bij ons langs te komen. Of je net begint, na jaren weer op de fiets stapt of gewoon wat comfortabeler naar de bakker wil: we vertrekken van waar jij nu staat. Zonder druk, en in gewone woorden.',
      primaryCta: { label: 'Wat past bij mij? →', href: '/aanbod#keuzehulp', external: false },
      secondaryCta: {
        label: 'Vragen van beginners',
        href: '/veelgestelde-vragen#beginners',
        external: false,
      },
      items: [
        {
          title: 'Geen ervaring nodig',
          body: 'Geen conditie, geen doelen, geen kilometers vereist.',
        },
        {
          title: 'Elke fiets is welkom',
          body: 'Stadsfiets, e-bike, toerfiets of mountainbike. Hoe duur hij is, maakt niet uit.',
        },
        {
          title: 'Kom zoals je bent',
          body: 'In de kleren en schoenen waarin je normaal fietst. Een sportoutfit is niet nodig.',
        },
        {
          title: 'We leggen alles uit',
          body: 'Wat we doen en waarom, zonder vakjargon. Vragen stellen mag altijd.',
        },
      ],
    },
  },

  chooser: {
    label: 'Keuzehulp',
    description:
      'Twee tot vier kaarten, elk één link: “Welke dienst past bij mij?”. De laatste kaart kan uitgelicht zijn (bordeaux), bv. om te bellen.',
    editorHint:
      'Het blok krijgt altijd het anker #keuzehulp, zodat andere pagina’s ernaar kunnen linken. Een telefoonlink typ je als {{telefoon-href}} met als linktekst bv. “Bel {{telefoon}}”; een interne link begint met /, bv. /aanbod/zadelanalyse.',
    schema: chooserSchema,
    defaultData: {
      variant: 'default',
      eyebrow: 'Keuzehulp',
      title: 'Welke dienst past bij mij?',
      lede: 'Kies wat het best bij jou past. Twijfel je? Geen probleem, dan kijken we samen.',
      choices: [
        {
          label: 'Ik begin (opnieuw) met fietsen',
          title: 'Mijn fiets voelt niet goed',
          body: 'Je fietst al een tijdje of stapt net weer op, maar het zit niet lekker. We stellen je eigen fiets op jou af.',
          linkLabel: 'Bikefit – huidige fiets',
          href: '/aanbod/bikefit-huidige-fiets',
          featured: false,
        },
        {
          label: 'Ik koop een fiets',
          title: 'Ik wil een fiets die past',
          body: 'Voor je koopt, weet je welke maat en welk type bij jou past. Zo vermijd je een miskoop.',
          linkLabel: 'Bikefit – aankoop nieuwe fiets',
          href: '/aanbod/bikefit-nieuwe-fiets',
          featured: false,
        },
        {
          label: 'Iets kleins',
          title: 'Mijn zadel of voeten storen',
          body: 'Zit je niet prettig of doen je voeten pijn? Dan kan een korte analyse al veel helpen.',
          linkLabel: 'Zadel- of voetanalyse',
          href: '/aanbod/zadelanalyse',
          featured: false,
        },
        {
          label: 'Ik twijfel nog',
          title: 'Ik weet het niet',
          body: 'Bel ons en vertel kort waarom je wil komen. We zeggen je eerlijk wat je nodig hebt, en wat niet.',
          linkLabel: 'Bel {{telefoon}}',
          href: '{{telefoon-href}}',
          featured: true,
        },
      ],
    },
  },

  photoStrip: {
    label: 'Foto’s',
    description:
      'Foto’s zonder tekstsectie errond: een strook met bijschriften (startpagina), een galerij of één brede foto.',
    editorHint:
      'Strook: 2 tot 6 foto’s naast elkaar, de eerste breder, het bijschrift linksonder. Galerij: optioneel een bovenkop en titel, daarna gelijke foto’s. Breed: enkel de eerste foto, over de volle breedte. Een lege fotoplek wordt overgeslagen. Het veld Focus (bv. 50% 55%) verschuift het uitgesneden stuk van een foto.',
    schema: photoStripSchema,
    defaultData: {
      layout: 'strip',
      variant: 'default',
      eyebrow: '',
      title: '',
      images: [
        { image: emptyImage, caption: 'Samen bergop', focus: '' },
        { image: emptyImage, caption: 'Pauze in Ronse', focus: '50% 55%' },
        { image: emptyImage, caption: 'Even sleutelen', focus: '' },
      ],
    },
  },
} as const;
