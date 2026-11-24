import type { CmsImageRef } from '@/lib/cms/block-primitives';
import { offerPagePath } from '@/lib/offers/catalogue';
import { editorialImage, type EditorialSlot } from '@/lib/studio/editorial-images';
import { PHONE_HREF_TOKEN, PHONE_TOKEN, type SeedBlock } from './shared';

/**
 * The sections the redesign of 24 Nov 2026 adds to the public pages (Toshoni's design export of
 * that day), as seed blocks the page seeds (`aanbod.ts`, `bikefit.ts`, `faq.ts`, `cadeaubon.ts`,
 * `appointment.ts`) place. Plain data, no I/O. `cms:patch-site-redesign` brings an existing
 * database to the same blocks (`site-redesign.ts`).
 *
 * COPY PROVENANCE: the design export (welcome band, keuzehulp, photo captions), word for word,
 * except where the live site says it differently: the keuzehulp names the offerings by their
 * live titles ("Bikefit – aankoop nieuwe fiets", not "Bikefit – nieuwe fiets") and its first
 * card says "Je fietst al een tijdje" (the export's "Je fiets al" is a typo); the phone number
 * is the `{{telefoon}}` token. Alt texts: the design's, where they say more than the manifest's;
 * nobody is named outside `/ons-team`.
 */

/** An editorial photograph with the alt text of the place it is used. */
export function photo(slot: EditorialSlot, alt?: string): CmsImageRef {
  const image = editorialImage(slot);
  return alt && image.url ? { ...image, alt } : image;
}

/** "Nieuw op de fiets?": home (after the hero) and `/voor-wie`, where the keuzehulp is on `/aanbod`. */
export function welcomeBlock(choiceHref: string): SeedBlock {
  return {
    type: 'welcome',
    data: {
      eyebrow: 'Nieuw op de fiets?',
      title: 'Weinig of geen fietservaring?',
      titleEmphasis: 'Je bent 100% welkom.',
      body: 'Je hoeft geen renner te zijn om bij ons langs te komen. Of je net begint, na jaren weer op de fiets stapt of gewoon wat comfortabeler naar de bakker wil: we vertrekken van waar jij nu staat. Zonder druk, en in gewone woorden.',
      primaryCta: { label: 'Wat past bij mij? →', href: choiceHref, external: false },
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
  };
}

/** "Keuzehulp": home (white) and `/aanbod` (cream); the block always carries the anchor `#keuzehulp`. */
export function chooserBlock(variant: 'default' | 'gray'): SeedBlock {
  return {
    type: 'chooser',
    data: {
      variant,
      eyebrow: 'Keuzehulp',
      title: 'Welke dienst past bij mij?',
      lede: 'Kies wat het best bij jou past. Twijfel je? Geen probleem, dan kijken we samen.',
      choices: [
        {
          label: 'Ik begin (opnieuw) met fietsen',
          title: 'Mijn fiets voelt niet goed',
          body: 'Je fietst al een tijdje of stapt net weer op, maar het zit niet lekker. We stellen je eigen fiets op jou af.',
          linkLabel: 'Bikefit – huidige fiets',
          href: offerPagePath('bikefit-huidige-fiets'),
          featured: false,
        },
        {
          label: 'Ik koop een fiets',
          title: 'Ik wil een fiets die past',
          body: 'Voor je koopt, weet je welke maat en welk type bij jou past. Zo vermijd je een miskoop.',
          linkLabel: 'Bikefit – aankoop nieuwe fiets',
          href: offerPagePath('bikefit-nieuwe-fiets'),
          featured: false,
        },
        {
          label: 'Iets kleins',
          title: 'Mijn zadel of voeten storen',
          body: 'Zit je niet prettig of doen je voeten pijn? Dan kan een korte analyse al veel helpen.',
          linkLabel: 'Zadel- of voetanalyse',
          href: offerPagePath('zadelanalyse'),
          featured: false,
        },
        {
          label: 'Ik twijfel nog',
          title: 'Ik weet het niet',
          body: 'Bel ons en vertel kort waarom je wil komen. We zeggen je eerlijk wat je nodig hebt, en wat niet.',
          linkLabel: `Bel ${PHONE_TOKEN}`,
          href: PHONE_HREF_TOKEN,
          featured: true,
        },
      ],
    },
  };
}

/** One audience of `/voor-wie`, a photo tile since the redesign. */
function audience(
  number: string,
  title: string,
  body: string,
  image: CmsImageRef,
  featured = false,
) {
  return { number, title, body, featured, image };
}

/** The six audiences of `/voor-wie`: the live texts, the design's photographs and alt texts. */
export const AUDIENCE_ITEMS = [
  audience(
    '01',
    'Jonge fietsers',
    'Kinderen groeien snel: een fiets die vandaag past, klopt volgend seizoen al niet meer. We volgen de pasvorm op terwijl ze groeien.',
    photo('jonge-fietser', 'Jonge fietser op een speelfiets'),
    true,
  ),
  audience(
    '02',
    'Beginners en ervaren fietsers',
    'Je eerste kilometers of al jaren onderweg: we bekijken wat jij nodig hebt.',
    photo('muur-ronse-duo', 'Twee fietsers op een bank in Ronse'),
  ),
  audience(
    '03',
    'Recreatief en competitief',
    'Voor de weekendrit die fris moet eindigen, niet stijf en pijnlijk de ochtend erna, en voor wie een sportief doel voor ogen heeft.',
    photo('samen-bergop', 'Twee fietsers bergop'),
  ),
  audience(
    '04',
    'Koers, gravel en mountainbike',
    'De principes blijven dezelfde: het lichaam van de fietser moet bij de fiets passen. We fitten koers-, gravel-, mountain-, stads-, toer- en e-bikes.',
    photo('rutger-klim', 'Fietser bergop op een koersfiets'),
  ),
  audience(
    '05',
    'Woon-werk en e-bike',
    'Vijf dagen per week, weer of geen weer. Een pasvorm die het volhoudt naast de koude handen en de natte broek, ook op een e-bike.',
    photo('band-wisselen', 'Fietser sleutelt aan zijn wiel'),
  ),
  audience(
    '06',
    'Wielertoeristen',
    'Lange dagen, zware tassen, verre horizonten: een pasvorm waar je op kilometer 200 nog op kan rekenen, maakt van de tocht wat ze hoort te zijn.',
    photo('zonsondergang-weg', 'Landweg bij zonsondergang'),
  ),
];

/** The strip of three photographs on the home page, after the offer catalogue. */
export const HOME_PHOTO_STRIP: SeedBlock = {
  type: 'photoStrip',
  data: {
    layout: 'strip',
    variant: 'default',
    eyebrow: '',
    title: '',
    images: [
      { image: photo('samen-bergop'), caption: 'Samen bergop', focus: '' },
      { image: photo('muur-ronse-duo'), caption: 'Pauze in Ronse', focus: '50% 55%' },
      { image: photo('band-wisselen'), caption: 'Even sleutelen', focus: '' },
    ],
  },
};

/** One photograph over the full width (`/aanbod`, `/veelgestelde-vragen`). */
export function widePhoto(image: CmsImageRef, focus = ''): SeedBlock {
  return {
    type: 'photoStrip',
    data: {
      layout: 'wide',
      variant: 'default',
      eyebrow: '',
      title: '',
      images: [{ image, caption: '', focus }],
    },
  };
}

/** "Op de fiets": the gallery on `/ons-team` (the design names Rutger in the alt texts here). */
export const TEAM_GALLERY: SeedBlock = {
  type: 'photoStrip',
  data: {
    layout: 'gallery',
    variant: 'gray',
    eyebrow: 'Op de fiets',
    title: 'Zolang ik me kan herinneren',
    images: [
      {
        image: photo('muur-ronse-bank', 'Rutger op een bank voor de koersmuur in Ronse'),
        caption: '',
        focus: '',
      },
      { image: photo('renner-rug', 'Rutger op training'), caption: '', focus: '' },
      { image: photo('band-wisselen', 'Rutger sleutelt aan zijn wiel'), caption: '', focus: '' },
    ],
  },
};
