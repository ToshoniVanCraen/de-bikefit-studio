import { OFFER_CATEGORY_LABELS, OFFER_INDEX_PATH } from '@/lib/offers/catalogue';
import { CADEAUBON_CARD } from './cadeaubon';
import { CADEAUBON_HOME_BLOCK } from './cadeaubon-promo';
import {
  HERO_SUBTITLE,
  AANBOD_INTRO,
  HOW_OFTEN_TEXT,
  JUNIOR_TEXT,
  JUST_THE_RIDE_TEXT,
  MOTION_ANALYSIS_TEXT,
  STUDIO_EXTRAS_TEXT,
  TEAM_INTRO,
  TEAM_MEMBERS,
  TEAM_SELECTION_SENTENCE,
  WHY_BIKEFIT_TEXT,
} from './copy';
import {
  AUDIENCE_ITEMS,
  chooserBlock,
  HOME_PHOTO_STRIP,
  photo,
  TEAM_GALLERY,
  welcomeBlock,
  widePhoto,
} from './redesign-sections';
import {
  BOOKING_PATH,
  CLOSING_CTA,
  CONTACT_BLOCK,
  INSPECTION_CARDS,
  PROCESS_STEPS,
  type SeedPage,
} from './shared';

/**
 * The redesign of 24 Nov 2026 (Toshoni's design export): every page opens on a hero with a real
 * photograph, home gains "Nieuw op de fiets?", the keuzehulp and a photo strip, `/voor-wie` the
 * welcome band and photo tiles, `/ons-team` a gallery, and the pages close on the photo band. The
 * new sections are `redesign-sections.ts`; `cms:patch-site-redesign` brings an existing database
 * to exactly these pages (`site-redesign.ts`). The live copy stays where the design repeats an
 * older wording.
 *
 * The redesigned public site of 13 Oct 2026: the offer overview ("Aanbod"),
 * audiences ("Voor wie"), the bikefit page and the team — plus the menus and
 * the redirects. Plain data, no I/O. The offerings themselves are not pages
 * since 17 Oct 2026: they are rows in `cms_offerings` (`src/lib/offers/defaults.ts`,
 * written by `cms:bootstrap`) and the overview blocks read them at render time.
 *
 * Used by `npm run cms:seed` (fresh databases) and by the staging rollout
 * `npm run cms:rollout-aanbod`, which applies exactly these pages, menus and
 * redirects to an existing database (dry run, backup, restore).
 *
 * COPY PROVENANCE
 *   work block 2026-10-13-aanbod-staging-brief.md (Toshoni via Winston): hero,
 *     aanbod intro, the junior text, the 3D text and the team intro — verbatim
 *     (the seven offers: `src/lib/offers/defaults.ts`).
 *   prototype/index.html, prototype/bikefit.html, content/index.html,
 *     content/about.html: everything reused from the earlier site (process,
 *     "Vier dingen, één positie", "Waarom", "Op locatie", persona copy, the
 *     callout) and Rutger's own first-person text.
 *   Short connective lines (group ledes, section titles) are neutral and claim
 *   nothing beyond those sources. No prices, durations, credentials, titles,
 *   years or achievements are added. Since 20 Oct 2026 the page shows Rutger
 *   alone (Toshoni: Robin and Goran removed), with his own portrait
 *   (`src/lib/studio/team-portraits.ts`).
 *   Toshoni's site review of the same day (work block
 *     2026-10-13-page-cleanup): no "Ninove" kicker on /aanbod, /voor-wie and
 *     /ons-team, no second heading above the audiences or the profiles, and
 *     "jeugd" for the young riders. `cms:patch-page-cleanup` applies exactly
 *     that to an existing database (see `page-cleanup.ts`).
 *   Toshoni's gift voucher request of the same day: the "Overige" group on
 *     /aanbod with the voucher card. The voucher page itself is `cadeaubon.ts`;
 *     its year-end promotion of 27 Oct 2026 (menu item, the home section after
 *     the catalogue) is `cadeaubon-promo.ts`.
 */

/** The page heads' button of the redesign (24 Nov 2026), as on the header. */
export const BOOKING_BUTTON = { label: 'Afspraak maken →', href: BOOKING_PATH, external: false };

export const OFFER_GROUPS = [
  {
    category: 'bikefit',
    title: OFFER_CATEGORY_LABELS.bikefit,
    lede: 'Je fiets, je zadel, je voeten en je schoenplaatjes, afgestemd op jou.',
  },
  {
    category: 'begeleiding',
    title: OFFER_CATEGORY_LABELS.begeleiding,
    lede: 'Inzicht en opvolging die met je meegroeit.',
  },
];

/**
 * "Overige" with the gift voucher (Toshoni, 13 Oct 2026), after the existing
 * groups — on /aanbod only; home and /bikefit keep their own selection.
 */
export const OTHER_OFFER_GROUP = {
  category: 'overige',
  title: OFFER_CATEGORY_LABELS.overige,
  lede: '',
};

// --------------------------------------------------------------- pages ----

const HOME: SeedPage = {
  slug: '',
  title: 'Home',
  translationGroup: 'home',
  source: 'work block 2026-10-13 (hero, aanbod) + prototype/index.html + content/about.html',
  metaTitle: 'De Bikefit Studio: meer plezier. Op jouw fiets.',
  metaDescription:
    'Bikefit, voet- en zadelanalyse, schoenplaatjes, inspanningstest en coaching in Ninove. Persoonlijke fietsbegeleiding, in de studio of bij jou thuis.',
  structuredDataType: 'WebPage',
  blocks: [
    {
      type: 'hero',
      data: {
        variant: 'full',
        // "Ninove" left out after the name (Toshoni, 19 Oct 2026); the city stays in the meta description.
        eyebrow: 'De Bikefit Studio',
        title: 'Meer plezier.',
        titleEmphasis: 'Op jouw fiets.',
        subtitle: HERO_SUBTITLE,
        primaryCta: { label: 'Afspraak maken →', href: BOOKING_PATH, external: false },
        secondaryCta: { label: 'Bekijk ons aanbod', href: OFFER_INDEX_PATH, external: false },
        // Redesign of 24 Nov 2026: the sunset road instead of the generated image.
        image: photo('zonsondergang-weg'),
      },
    },
    welcomeBlock('#keuzehulp'),
    chooserBlock('default'),
    {
      type: 'offerCatalogue',
      data: {
        variant: 'default',
        eyebrow: 'Aanbod',
        title: 'Wat we voor je doen',
        lede: 'Eén vertrekpunt: jij en je fiets.',
        groups: OFFER_GROUPS,
        // Prices only on /aanbod and the offer pages (Toshoni, 13 Oct 2026).
        showPrices: false,
        cta: { label: 'Bekijk het volledige aanbod', href: OFFER_INDEX_PATH, external: false },
      },
    },
    HOME_PHOTO_STRIP,
    // The gift voucher for the year-end period (Toshoni, 27 Oct 2026, `cadeaubon-promo.ts`),
    // since the redesign over the photograph of the bench in Ronse.
    {
      type: CADEAUBON_HOME_BLOCK.type,
      data: { ...CADEAUBON_HOME_BLOCK.data, image: photo('muur-ronse-bank') },
    },
    {
      type: 'imageText',
      data: {
        variant: 'gray',
        eyebrow: 'Voor wie',
        title: 'Voor elke fietser',
        paragraphs: [
          'Of je nu zeven of zeventig bent, koerst of pendelt, een weekendrijder of een doordeweekse toerist: iedereen verdient het om te genieten van alles wat een fiets te bieden heeft.',
        ],
        bullets: [
          'Jong en minder jong',
          'Beginners en ervaren fietsers',
          'Recreatief en competitief',
          'Koers, gravel en mountainbike',
          'Woon-werkverkeer en e-bike',
        ],
        cta: { label: 'Voor wie is dit?', href: '/voor-wie', external: false },
        image: photo('jonge-fietser'),
        imagePosition: 'left',
      },
    },
    {
      type: 'imageText',
      data: {
        variant: 'dark',
        eyebrow: 'Bikefit',
        title: 'Jij blijft het vertrekpunt',
        paragraphs: [MOTION_ANALYSIS_TEXT],
        cta: { label: 'Zo verloopt een bikefit', href: '/bikefit', external: false },
        image: photo('renner-rug', 'Renner van achteren, houding op de fiets'),
        imagePosition: 'right',
      },
    },
    // The team band became the team split of the design (24 Nov 2026): the live selection
    // sentence (experience and people skills, 27 Oct 2026), the design's quote and photograph.
    {
      type: 'imageText',
      data: {
        variant: 'gray',
        eyebrow: 'Ons team',
        title: 'Goede begeleiding begint bij de juiste mensen.',
        paragraphs: [TEAM_SELECTION_SENTENCE],
        quote: 'Fietsliefhebber. Vader. Ondernemer.',
        cta: { label: 'Maak kennis met ons team', href: '/ons-team', external: false },
        image: photo('rutger-klim'),
        imagePosition: 'left',
      },
    },
    CONTACT_BLOCK,
    CLOSING_CTA,
  ],
};

const AANBOD: SeedPage = {
  slug: 'aanbod',
  title: 'Aanbod',
  translationGroup: 'offer',
  source: 'work block 2026-10-13 (aanbod intro); the offerings are rows in cms_offerings',
  metaTitle: 'Ons aanbod: bikefit en begeleiding',
  metaDescription:
    'Bikefit bij aankoop of op je huidige fiets, voetanalyse, zadelanalyse, schoenplaatjes afstellen, inspanningstest en coaching in Ninove.',
  structuredDataType: 'WebPage',
  blocks: [
    {
      type: 'hero',
      data: {
        variant: 'pageHead',
        eyebrow: 'Aanbod',
        title: 'Ons aanbod',
        titleEmphasis: '',
        subtitle: AANBOD_INTRO,
        primaryCta: BOOKING_BUTTON,
        secondaryCta: null,
        image: photo('samen-bergop'),
      },
    },
    chooserBlock('gray'),
    {
      type: 'offerCatalogue',
      data: {
        variant: 'default',
        eyebrow: '',
        title: '',
        lede: '',
        groups: [...OFFER_GROUPS, OTHER_OFFER_GROUP],
        // The gift voucher is not an offering: a fixed card under Overige.
        extraCards: [CADEAUBON_CARD],
        showPrices: true,
        cta: null,
      },
    },
    widePhoto(photo('muur-ronse-bank', 'Fietser op een bank voor de koersmuur in Ronse')),
    CLOSING_CTA,
  ],
};

const VOOR_WIE: SeedPage = {
  slug: 'voor-wie',
  title: 'Voor wie',
  translationGroup: 'audience',
  source: 'work block 2026-10-13 (audiences, junior text) + content/index.html persona copy',
  metaTitle: 'Voor wie: elke fietser, op elke leeftijd',
  metaDescription:
    'Voor jong en minder jong, beginners en ervaren fietsers, recreatief en competitief, koers, gravel en mountainbike, woon-werk en e-bike. Extra aandacht voor de jeugd.',
  structuredDataType: 'WebPage',
  blocks: [
    {
      type: 'hero',
      data: {
        variant: 'pageHead',
        eyebrow: 'Voor wie',
        title: 'Voor elke fietser',
        titleEmphasis: '',
        subtitle:
          'Of je nu zeven of zeventig bent, koerst of pendelt, een weekendrijder of een doordeweekse toerist: iedereen verdient het om te genieten van alles wat een fiets te bieden heeft.',
        primaryCta: BOOKING_BUTTON,
        secondaryCta: null,
        image: photo('jonge-fietser'),
      },
    },
    welcomeBlock('/aanbod#keuzehulp'),
    {
      type: 'audience',
      data: {
        // Photo tiles on white since the redesign (24 Nov 2026).
        variant: 'default',
        // No section heading: the audiences follow the page head directly.
        eyebrow: '',
        title: '',
        lede: '',
        items: AUDIENCE_ITEMS,
      },
    },
    {
      type: 'imageText',
      data: {
        // The dark split of the design (24 Nov 2026), with its photograph (Toshoni's photo with a
        // young rider of 20 Oct 2026, `rutger-jeugd`, made way for it).
        variant: 'dark',
        eyebrow: 'Jeugd',
        title: 'Jonge fietsers groeien',
        paragraphs: [JUNIOR_TEXT],
        cta: { label: 'Bekijk het aanbod', href: OFFER_INDEX_PATH, external: false },
        image: photo('renner-rug', 'Renner op training'),
        imagePosition: 'right',
      },
    },
    {
      type: 'cta',
      data: {
        // The cream band of the design (24 Nov 2026).
        variant: 'gray',
        title: 'Benieuwd wat bij jou past?',
        body: '',
        primaryCta: { label: 'Bekijk het aanbod →', href: OFFER_INDEX_PATH, external: false },
        secondaryCta: { label: 'Afspraak maken', href: BOOKING_PATH, external: false },
      },
    },
  ],
};

const BIKEFIT: SeedPage = {
  slug: 'bikefit',
  title: 'De bikefit',
  translationGroup: 'bikefit',
  source:
    'prototype/bikefit.html + work block 2026-10-13 (3D text, offer structure); review 19 Oct 2026 (no page head, what you take home, insoles and saddles); 27 Oct 2026 (insoles removed again)',
  metaTitle: 'De bikefit: hoe het werkt',
  metaDescription:
    'Wat een bikefit is, hoe hij verloopt en hoe we 3D-bewegingsanalyse gebruiken. Bikefit bij aankoop of op je huidige fiets, voet- en zadelanalyse en schoenplaatjes, in Ninove.',
  structuredDataType: 'WebPage',
  // Since the redesign (24 Nov 2026) the page opens on a page hero with "Waarom is een bikefit
  // belangrijk?" (its first paragraph and a photograph), then the rest as prose with the lead line;
  // from 19 Oct to 24 Nov it opened on that text as a split section without a head.
  blocks: [
    {
      type: 'hero',
      data: {
        variant: 'pageHead',
        eyebrow: 'Waarom een bikefit',
        title: 'Waarom is een bikefit belangrijk?',
        titleEmphasis: '',
        subtitle: WHY_BIKEFIT_TEXT,
        primaryCta: BOOKING_BUTTON,
        secondaryCta: null,
        image: photo('renner-rug', 'Renner van achteren, houding op de fiets'),
      },
    },
    {
      type: 'richText',
      data: {
        variant: 'default',
        eyebrow: '',
        title: '',
        // The design's lead line (`.prose .lead`) is the rich text's quote: the sanitiser keeps
        // no class attribute, and `.studio-rich blockquote` is the italic wine line.
        html: `<p>${HOW_OFTEN_TEXT}</p><blockquote>${JUST_THE_RIDE_TEXT}</blockquote>`,
      },
    },
    {
      type: 'imageText',
      data: {
        variant: 'dark',
        eyebrow: '3D-bewegingsanalyse',
        title: 'Meten om beter te kijken',
        paragraphs: [MOTION_ANALYSIS_TEXT, STUDIO_EXTRAS_TEXT],
        image: photo('rutger-klim', 'Fietser bergop'),
        imagePosition: 'left',
      },
    },
    {
      type: 'services',
      data: {
        variant: 'default',
        eyebrow: 'Wat we bekijken',
        title: 'Vier dingen, één positie',
        lede: 'We kijken naar jou op de fiets: houding, trapbeweging, zadelpositie en bewegingspatronen. Daaruit bouwen we stap voor stap jouw positie op.',
        columns: 4,
        cards: INSPECTION_CARDS,
      },
    },
    {
      type: 'process',
      data: {
        variant: 'gray',
        eyebrow: 'Werkwijze',
        title: 'Hoe verloopt een bikefit?',
        lede: 'Een gesprek, een blik op jou en je fiets, en stap voor stap aanpassen tot alles klopt. We haasten ons niet: als het klaar is, is het klaar.',
        steps: PROCESS_STEPS,
      },
    },
    {
      type: 'imageText',
      data: {
        variant: 'default',
        eyebrow: 'Op locatie',
        title: 'Kan een bikefit ook bij mij thuis?',
        paragraphs: [
          'Ja, voor groepen, clubs en gezinnen komen we op locatie. Voor de meeste individuele fits werken we liever in de studio, omdat we daar meer controle hebben.',
          'Maar als je niet naar ons kan komen, komen wij naar jou. Neem contact op en we bekijken het samen.',
        ],
        cta: { label: 'Neem contact op →', href: BOOKING_PATH, external: false },
        image: photo('muur-ronse-duo'),
        imagePosition: 'right',
      },
    },
    {
      type: 'imageText',
      data: {
        variant: 'gray',
        eyebrow: 'Jonge fietsers',
        title: 'Kinderen groeien. De pasvorm groeit niet mee.',
        paragraphs: [
          'Een fiets die vandaag past, klopt volgend seizoen al niet meer, en een lichaam in groei went aan alles wat je het oplegt. Voor jonge wedstrijdrijders die al echt uren op het zadel zitten, kost een slechte pasvorm niet alleen watts op koersdag; ze legt gewoontes vast die nog jaren later meegaan.',
          'We volgen de pasvorm op terwijl ze groeien.',
        ],
        bullets: [
          'Aandacht voor groei en veranderende lichaamsverhoudingen',
          'Vaker terugkomen dan volwassenen, want zij groeien door',
        ],
        cta: { label: 'Meer voor jonge fietsers', href: '/voor-wie', external: false },
        image: photo('jonge-fietser'),
        imagePosition: 'left',
      },
    },
    {
      type: 'offerCatalogue',
      data: {
        variant: 'default',
        eyebrow: 'Aanbod',
        title: 'Onze bikefitdiensten',
        lede: 'Kies de dienst die bij je vraag past. Twijfel je? Bel ons, dan kijken we samen.',
        groups: [OFFER_GROUPS[0]],
        showPrices: false,
        cta: { label: 'Bekijk het volledige aanbod', href: OFFER_INDEX_PATH, external: false },
      },
    },
    CLOSING_CTA,
  ],
};

const ONS_TEAM: SeedPage = {
  slug: 'ons-team',
  title: 'Ons team',
  translationGroup: 'team',
  source: 'work block 2026-10-13 (team intro, names) + content/about.html §1 (Rutger)',
  metaTitle: 'Ons team',
  metaDescription:
    'Goede begeleiding begint bij de juiste mensen. Maak kennis met het team van De Bikefit Studio in Ninove.',
  structuredDataType: 'AboutPage',
  blocks: [
    {
      type: 'hero',
      data: {
        variant: 'pageHead',
        eyebrow: 'Ons team',
        title: 'Ons team',
        titleEmphasis: '',
        subtitle: TEAM_INTRO,
        primaryCta: null,
        secondaryCta: null,
        image: photo('samen-bergop'),
      },
    },
    {
      type: 'team',
      data: {
        variant: 'default',
        // No section heading: the profile follows "Ons team" directly.
        eyebrow: '',
        title: '',
        lede: '',
        // The design's photograph of Rutger climbing (24 Nov 2026) instead of the portrait.
        members: TEAM_MEMBERS.map((member) => ({
          ...member,
          image: photo('rutger-klim', `${member.name} bergop`),
        })),
        cta: BOOKING_BUTTON,
      },
    },
    TEAM_GALLERY,
    CLOSING_CTA,
  ],
};

/** Every page the offer rollout owns, in rollout order. The offerings themselves are rows (`cms:bootstrap`). */
export const AANBOD_PAGES: SeedPage[] = [HOME, AANBOD, VOOR_WIE, BIKEFIT, ONS_TEAM];

// Menus and the `/over-ons` redirect live in `navigation.ts`.
export { AANBOD_REDIRECTS, FOOTER_MENU, MAIN_MENU, RETIRED_PAGE_SLUG } from './navigation';

export {
  HERO_SUBTITLE,
  AANBOD_INTRO,
  JUNIOR_TEXT,
  MOTION_ANALYSIS_TEXT,
  TEAM_INTRO,
  TEAM_MEMBERS,
} from './copy';
