import { LOCATION_BLOCK } from './location-section';
import { photo } from './redesign-sections';
import {
  BOOKING_PATH,
  CLOSING_CTA,
  EMAIL_TOKEN,
  PHONE_HREF_TOKEN,
  PHONE_TOKEN,
  type SeedPage,
} from './shared';

/**
 * `/afspraak` — the single place to book or ask (Toshoni's site review,
 * 13 Oct 2026). Plain data; used by `cms:seed`.
 *
 * Since the redesign of 24 Nov 2026 the booking block draws the page hero
 * (photograph, phone button), "Voor je komt" is a split with a photograph
 * (below), and the page closes on the photo band; `cms:patch-site-redesign`
 * brings an existing database there (`site-redesign.ts`).
 *
 * The page opens on "Kies je moment" (the booking widget owns the `<h1>`),
 * then "Voor je komt" with the "Andere vraag?" line. The page head, "Vier
 * manieren om te boeken", the "Boek je bikefit" contact section and the
 * closing "Boek je bikefit" band are gone; `/contact` redirects here.
 *
 * Since 27 Oct 2026 it ends with "Waar vind je ons?": the `location` block
 * (`location-section.ts`), the studio's address from Instellingen → Contact
 * with a two-click Google map. `cms:patch-page-cleanup` is the 13 Oct state and
 * does not add it; `cms:patch-aanbod-correcties` does, on an existing database.
 *
 * Provenance: content/booking.html (step order, tone), the `booking` block,
 * and the "wat breng je mee" / "hoe lang duurt het" answers from
 * content/about.html. "Andere vraag?" is Toshoni's wording. Since 20 Oct 2026
 * "Reken op de tijd" carries `{{duur:…}}` tokens (`src/lib/studio/copy-tokens.ts`),
 * so the durations follow the offer instead of a number in the copy; since
 * 27 Oct 2026 the phone number and the e-mail address are tokens too
 * (`{{telefoon}}`, `{{e-mail}}`), so they follow Instellingen → Contact.
 */

/** "Andere vraag?" under "Voor je komt"; the patch appends exactly this. */
export const OTHER_QUESTION_HTML = [
  '<h3>Andere vraag?</h3>',
  `<p>Contacteer ons op <a href="mailto:${EMAIL_TOKEN}">${EMAIL_TOKEN}</a> of <a href="${PHONE_HREF_TOKEN}">${PHONE_TOKEN}</a>.</p>`,
].join('');

/**
 * What to bring, under "Breng het juiste mee". Own pedals since 27 Oct 2026
 * (Toshoni, as in art. 8 of the terms and in the FAQ): certainly with Time or
 * the newest Shimano pedals, the studio cannot offer every system. The
 * corrections of that day swap exactly this paragraph (`corrections-2026-10-27.ts`).
 */
export const BRING_PARAGRAPH =
  'Je fiets (proper en in werkende staat), de schoenen en fietskleding waarin je écht rijdt, en eventuele notities over wat je dwars zit. Neem ook je eigen pedalen mee, zeker bij Time-pedalen of de nieuwste Shimano-pedalen: niet elk systeem hebben we in de studio. Meer hebben we niet nodig. De rest doen wij.';
export const BRING_PARAGRAPH_HTML = `<p>${BRING_PARAGRAPH}</p>`;

/**
 * "Voor je komt" since the redesign of 24 Nov 2026: the design's split with a photograph
 * (`imageText`, cream). That block has plain paragraphs, no sub-headings and no links, so the
 * live texts below are its paragraphs: "Breng het juiste mee" and "Reken op de tijd" are no
 * longer headings, and the phone number and the e-mail address are their tokens as text (the
 * booking hero and the closing band of the page carry the phone link). The durations stay
 * `{{duur:…}}` tokens.
 */
export const BEFORE_YOU_COME_PARAGRAPHS = [
  BRING_PARAGRAPH,
  'Reken op {{duur:volwassenenfit}} voor een bikefit voor volwassenen en {{duur:jeugdfit}} voor een jeugdfit. We haasten ons niet: als het klaar is, is het klaar.',
  `Liever bellen, of vind je geen moment dat past? Bel ${PHONE_TOKEN} en we zoeken samen een moment.`,
  `Andere vraag? Contacteer ons op ${EMAIL_TOKEN} of ${PHONE_TOKEN}.`,
];

export const AFSPRAAK_PAGE: SeedPage = {
  slug: BOOKING_PATH.slice(1),
  title: 'Een afspraak maken',
  translationGroup: 'appointment',
  source:
    'content/booking.html + booking block + content/about.html answers; review 13 Oct 2026 ("Kies je moment" first, "Andere vraag?")',
  metaTitle: 'Een afspraak maken',
  // The number is a token here too: page meta texts are resolved like every other copy.
  metaDescription: `Boek je bikefit in Ninove online: kies je fit, een dag en een uur. Liever bellen? ${PHONE_TOKEN}. Breng je fiets, schoenen, pedalen en fietskleding mee.`,
  structuredDataType: 'WebPage',
  blocks: [
    {
      type: 'booking',
      data: {
        variant: 'default',
        eyebrow: '',
        title: 'Kies je moment',
        lede: 'Kies je fit, bij wie en wanneer. Je krijgt meteen een bevestiging per e-mail.',
        serviceIds: [],
        showProviderChoice: true,
        successTitle: 'Je afspraak staat vast',
        successText: '',
      },
    },
    {
      type: 'imageText',
      data: {
        variant: 'default',
        eyebrow: 'Goed om te weten',
        title: 'Voor je komt',
        paragraphs: BEFORE_YOU_COME_PARAGRAPHS,
        image: photo('renner-rug', 'Renner op training'),
        imagePosition: 'left',
      },
    },
    LOCATION_BLOCK,
    CLOSING_CTA,
  ],
};

/** The old contact page is unpublished (row and snapshot kept) and sends visitors here. */
export const RETIRED_CONTACT_SLUG = 'contact';

export const CONTACT_REDIRECT = {
  fromPath: `/${RETIRED_CONTACT_SLUG}`,
  toPath: BOOKING_PATH,
  statusCode: 301 as const,
  notes: 'Contact verwijst naar Een afspraak maken (review 13 okt 2026).',
};
