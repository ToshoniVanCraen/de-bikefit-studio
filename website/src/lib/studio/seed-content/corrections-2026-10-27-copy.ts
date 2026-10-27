import { DEFAULT_SERVICES } from '@/lib/booking/defaults';
import { formatPostalAddress } from '@/lib/booking/format';
import { DEFAULT_OFFERS } from '@/lib/offers/defaults';
import { LEGAL_IDENTITY } from '@/lib/studio/legal';
import { AANBOD_PAGES } from './aanbod';
import { AANBOD_INTRO } from './copy';
import {
  pageHead,
  set,
  titled,
  type CleanupEdit,
  type PageCleanupSpec,
  type Selector,
} from './page-cleanup';
import {
  ADDRESS_TOKEN,
  CONTACT_EMAIL,
  EMAIL_TOKEN,
  PHONE_HREF,
  PHONE_HREF_TOKEN,
  PHONE_LABEL,
  PHONE_TOKEN,
} from './shared';

/**
 * The second half of the copy corrections of 27 Oct 2026 (the first is
 * `corrections-2026-10-27.ts`, which merges both into `CORRECTION_PAGE_SPECS`):
 * Toshoni, "the copy refers to the master" and "fewer dashes". Exact edits that
 * bring the pages of an existing database (which hold the 20 Oct texts) to the
 * seeds, which now say
 *
 *   - no price, duration, follow-up window, phone number, e-mail address, street
 *     address, company identity or voucher period as a literal: a copy token
 *     (`{{telefoon}}`, `{{e-mail}}`, `{{adres}}`, `{{bedrijf}}`, `{{zetel}}`,
 *     `{{kbo}}`, `{{cadeaubon-geldigheid}}`, ...) that the public site resolves
 *     from the master at render time;
 *   - no dash between two sentences ("op jou — niet omgekeerd — zodat"): a comma,
 *     a colon or a full stop; the en dash stays inside names and labels
 *     ("Bikefit – huidige fiets", "Jeugd – eenmalig");
 *   - the /aanbod intro without "gediplomeerde", the terms without "fit aan
 *     huis", the privacy statement naming Google Maps, the home contact block with
 *     the address.
 *
 * What a text on a page is worth in an edit:
 *
 *   `set` / `replace`  a whole field or a fragment of one, guarded: the old text, or
 *                      the new one already there, or a conflict (an editor changed it)
 *   `replaceAll`       an exact fragment in every string of the page's blocks: used for
 *                      the dashes, mostly inside lists (audience items, steps, cards,
 *                      team bio), where nothing else can address one entry. It cannot
 *                      overwrite an editor's text: a changed sentence no longer holds the
 *                      fragment, so it is left alone
 *
 * Seeds that are new today (the voucher home section, the card and the page of
 * `/cadeaubon`, the `location` block) need no edit here: the patch inserts or
 * rewrites them from the seeds themselves (`cadeaubon-promo.ts`). The phone number,
 * the e-mail address and the company identity are swapped for their tokens on EVERY
 * page by `CONTACT_TOKEN_EDITS` (applied through `phoneSpec`). Plain data, no I/O.
 */

// ----------------------------------------------------------- the details ----

/** The registered office as the legal pages type it today, "Weversstraat 7, 1730 Asse" (what `{{zetel}}` prints). */
const LEGAL_SEAT = formatPostalAddress({
  addressLines: [LEGAL_IDENTITY.street],
  postalCode: LEGAL_IDENTITY.postalCode,
  city: LEGAL_IDENTITY.city,
});

/**
 * The master's facts, as text on a page, become tokens, on every page (after the
 * old phone number has been swapped for the international form, see
 * `PHONE_EDITS`). No token contains the text it replaces and none of the replaced
 * texts sits inside another, so the order does not matter and a second run finds
 * nothing.
 */
export const CONTACT_TOKEN_EDITS: CleanupEdit[] = [
  { kind: 'replaceAll', from: PHONE_LABEL, to: PHONE_TOKEN },
  { kind: 'replaceAll', from: PHONE_HREF, to: PHONE_HREF_TOKEN },
  { kind: 'replaceAll', from: CONTACT_EMAIL, to: EMAIL_TOKEN },
  { kind: 'replaceAll', from: LEGAL_IDENTITY.name, to: '{{bedrijf}}' },
  { kind: 'replaceAll', from: LEGAL_SEAT, to: '{{zetel}}' },
  { kind: 'replaceAll', from: LEGAL_IDENTITY.kbo, to: '{{kbo}}' },
];

/** The same swaps for a text outside the blocks (page title, meta and share texts). */
export function tokeniseContactText(text: string): string {
  return CONTACT_TOKEN_EDITS.reduce(
    (rest, edit) => (edit.kind === 'replaceAll' ? rest.split(edit.from).join(edit.to) : rest),
    text,
  );
}

// ------------------------------------------------------------- selectors ----

/** The rich text of the terms (the one that holds the articles). */
export const termsText: Selector = {
  label: 'richText "Algemene voorwaarden"',
  type: 'richText',
  where: (data) => typeof data.html === 'string' && data.html.includes('Artikel 3'),
};

/** The rich text of the privacy statement. */
export const privacyText: Selector = {
  label: 'richText "Privacyverklaring"',
  type: 'richText',
  where: (data) => typeof data.html === 'string' && data.html.includes('Wie zijn wij?'),
};

const homeContact = titled('contact', 'Boek je bikefit');

// ---------------------------------------------------------------- helpers ----

/** `from` → `to` in every string of every block of the page. */
function swap(from: string, to: string): CleanupEdit {
  return { kind: 'replaceAll', from, to };
}

/** The swaps of one page, from a list of `[from, to]` fragments. */
function swaps(fragments: ReadonlyArray<readonly [from: string, to: string]>): CleanupEdit[] {
  return fragments.map(([from, to]) => swap(from, to));
}

function replace(select: Selector, from: string, to: string): CleanupEdit {
  return { kind: 'replace', select, field: 'html', from, to };
}

function seedPage(slug: string) {
  const page = AANBOD_PAGES.find((entry) => entry.slug === slug);
  if (!page) throw new Error(`corrections: no seed page "${slug}"`);
  return page;
}

// -------------------------------------------------------- previous texts ----

const OLD_AANBOD_INTRO =
  'Elke fietser is anders. Daarom werkt De Bikefit Studio uitsluitend met ervaren, gediplomeerde professionals. Samen zoeken we wat bij jou past: van je eerste kilometers tot een nieuw sportief doel. Persoonlijke fietsbegeleiding, dichtbij — in de studio, op locatie of, waar mogelijk, bij jou thuis.';

/** The page titles of the 13 Oct redesign, with their dash. */
const OLD_META_TITLES = {
  '': 'De Bikefit Studio — Meer plezier. Op jouw fiets.',
  aanbod: 'Ons aanbod — bikefit en begeleiding',
  'voor-wie': 'Voor wie — elke fietser, op elke leeftijd',
  bikefit: 'De bikefit — hoe het werkt',
} as const;

/** The sentence of the home hero band and of the /voor-wie head. */
const FOR_EVERYONE_SWAP = [
  'toerist — iedereen verdient het',
  'toerist: iedereen verdient het',
] as const;

const OLD_FAQ_META =
  'Waarom een bikefit, hoe vaak, hoe lang hij duurt, wat je meebrengt, of het ook aan huis kan en of we e-bikes doen — kort en eerlijk beantwoord.';
const NEW_FAQ_META =
  'Waarom een bikefit, hoe vaak, hoe lang hij duurt, wat je meebrengt, of het ook aan huis kan en of we e-bikes doen: kort en eerlijk beantwoord.';

/**
 * The /afspraak meta description as the seed wrote it from the booking release (24 Sep
 * 2026, b4217b4) to the review of 19 Oct; the text the page was rolled out with.
 */
const OLD_AFSPRAAK_META =
  'Boek je bikefit in Ninove online: kies je fit, een dag en een uur. Liever bellen? 0473 95 26 33. Breng je fiets, schoenen en fietskleding mee.';
/**
 * The /afspraak meta description of the FIRST seed (`scripts/cms-seed.mts`, b00f812, 24 Sep
 * 2026, replaced the same day). `cms:seed -- --refresh-slug afspraak` re-seeds the blocks of an
 * existing page and never its title or SEO fields (the rule since the flag exists, b4217b4), so a
 * database whose /afspraak was created by that seed still holds this text after every refresh:
 * staging did on 27 Oct 2026. A seed's text, not an editor's: it moves to the target as well.
 */
const FIRST_SEED_AFSPRAAK_META =
  'Bikefits in Ninove gaan door op afspraak. Bel 0473 95 26 33, kies je fit en breng je fiets, schoenen en fietskleding mee.';
export const NEW_AFSPRAAK_META = `Boek je bikefit in Ninove online: kies je fit, een dag en een uur. Liever bellen? ${PHONE_TOKEN}. Breng je fiets, schoenen, pedalen en fietskleding mee.`;

const OLD_PRIVACY_META =
  'Hoe De Bikefit Studio (Qarakter BV) je gegevens verwerkt als je een afspraak maakt, welke cookies we gebruiken en welke rechten je hebt.';
const NEW_PRIVACY_META =
  'Hoe De Bikefit Studio ({{bedrijf}}) je gegevens verwerkt als je een afspraak maakt, welke cookies we gebruiken en welke rechten je hebt.';
const OLD_TERMS_META =
  'Algemene voorwaarden van De Bikefit Studio (Qarakter BV): afspraken, betaling, kosteloos annuleren tot 48 uur vooraf, aansprakelijkheid en klachten.';
const NEW_TERMS_META =
  'Algemene voorwaarden van De Bikefit Studio ({{bedrijf}}): afspraken, betaling, kosteloos annuleren, aansprakelijkheid en klachten.';

// ----------------------------------------------------------- legal pages ----

export const PRIVACY_DATE_HTML = '<p><em>Laatst bijgewerkt: 27 oktober 2026</em></p>';
const OLD_PRIVACY_DATE_HTML = '<p><em>Laatst bijgewerkt: 20 oktober 2026</em></p>';

/** The paragraph on the map of `/afspraak` (Google Maps loads after a click), before "3. Hoe lang ...". */
export const PRIVACY_MAPS_HTML =
  '<h3>Kaart op de afspraakpagina</h3>\n<p>Op de afspraakpagina kun je een kaart van Google Maps tonen die laat zien waar de studio ligt. De kaart laadt pas nadat je op “Kaart tonen” klikt. Dan ontvangt Google (Google Ireland Ltd) je IP-adres en kan Google cookies plaatsen. Klik je niet, dan wordt er niets van Google geladen. Rechtsgrond: je toestemming (art. 6.1.a AVG), die je geeft door op de knop te klikken.</p>';
const NEXT_PRIVACY_SECTION_HTML = '<h2>3. Hoe lang bewaren wij je gegevens?</h2>';

/**
 * The privacy lists: the dash after a name becomes a colon; Google's line also
 * names the map, and Resend's no longer has two colons ("e-mails: bevestigingen").
 */
const PRIVACY_LIST_SWAPS: ReadonlyArray<readonly [from: string, to: string]> = [
  ['<strong>Vercel Inc.</strong> – hosting', '<strong>Vercel Inc.</strong>: hosting'],
  ['<strong>Neon Inc.</strong> – databank', '<strong>Neon Inc.</strong>: databank'],
  [
    '<strong>Google Ireland Ltd.</strong> – Google Agenda van de bikefitter en, na toestemming, Google Analytics.',
    '<strong>Google Ireland Ltd.</strong>: Google Agenda van de bikefitter en, na toestemming, Google Analytics en de kaart van Google Maps.',
  ],
  [
    '<strong>Resend, Inc.</strong> – verzenden van onze e-mails: bevestigingen',
    '<strong>Resend, Inc.</strong>: verzenden van onze e-mails, zoals bevestigingen',
  ],
  ['<strong>cms_consent</strong> – onthoudt', '<strong>cms_consent</strong>: onthoudt'],
  ['<strong>cms_session</strong> – enkel', '<strong>cms_session</strong>: enkel'],
  ['<strong>_ga, _ga_*</strong> – Google', '<strong>_ga, _ga_*</strong>: Google'],
];

/**
 * Art. 8 loses its last bullet, "Bij een fit aan huis ..." (Toshoni, 27 Oct 2026: the
 * service is retired). Guarded with the end of the bullet before it, so the edit only
 * applies to the bullet that closes the list.
 */
export const TERMS_HOME_FIT_BULLET_FROM_HTML =
  'die de afspraak maakt en aanwezig is.</li>\n<li>Bij een fit aan huis zorg je voor een geschikte, veilige ruimte en eventueel een fietstrainer, in overleg met ons.</li>';
export const TERMS_HOME_FIT_BULLET_TO_HTML = 'die de afspraak maakt en aanwezig is.</li>';

/** The titles of the fourteen articles: "Artikel 3 – Onze diensten" becomes "Artikel 3: Onze diensten". */
const ARTICLE_TITLES = [
  'Wie wij zijn',
  'Toepassing',
  'Onze diensten',
  'Afspraken en bevestiging',
  'Prijzen en betaling',
  'Annuleren en verplaatsen',
  'Herroepingsrecht',
  'Wat wij van jou verwachten',
  'Aansprakelijkheid',
  'Intellectuele eigendom',
  'Privacy',
  'Klachten',
  'Toepasselijk recht en bevoegde rechtbank',
  'Wijzigingen',
] as const;
const ARTICLE_HEADINGS: CleanupEdit[] = ARTICLE_TITLES.map((title, index) =>
  replace(
    termsText,
    `<h2>Artikel ${index + 1} – ${title}</h2>`,
    `<h2>Artikel ${index + 1}: ${title}</h2>`,
  ),
);

// ----------------------------------------------------------------- specs ----

/**
 * One spec per page, exactly the edits of this half. `corrections-2026-10-27.ts`
 * appends them to the edits of the first half, page by page.
 */
export const COPY_PAGE_SPECS: PageCleanupSpec[] = [
  {
    slug: '',
    edits: [
      swap(...FOR_EVERYONE_SWAP),
      // The home contact block showed only "Ninove": the studio's street address on one line.
      set(homeContact, 'addressLines', [], [ADDRESS_TOKEN]),
      set(homeContact, 'city', 'Ninove', ''),
    ],
    metaTitle: { from: OLD_META_TITLES[''], to: seedPage('').metaTitle },
  },
  {
    slug: 'aanbod',
    edits: [
      // Toshoni, 27 Oct 2026: experience and people skills, not diplomas.
      set(pageHead, 'subtitle', OLD_AANBOD_INTRO, AANBOD_INTRO),
    ],
    metaTitle: { from: OLD_META_TITLES.aanbod, to: seedPage('aanbod').metaTitle },
  },
  {
    slug: 'voor-wie',
    edits: swaps([
      FOR_EVERYONE_SWAP,
      ['Kinderen groeien snel — een fiets', 'Kinderen groeien snel: een fiets'],
      ['verre horizonten — een pasvorm', 'verre horizonten: een pasvorm'],
    ]),
    metaTitle: { from: OLD_META_TITLES['voor-wie'], to: seedPage('voor-wie').metaTitle },
  },
  {
    slug: 'bikefit',
    edits: swaps([
      ['op jou — niet omgekeerd — zodat', 'op jou, niet omgekeerd, zodat'],
      ['Voor kinderen vaker — zij groeien', 'Voor kinderen vaker: zij groeien'],
      ['voeten — en waar er iets vastloopt', 'voeten, en waar er iets vastloopt'],
      ['We haasten ons niet — als het klaar is', 'We haasten ons niet: als het klaar is'],
      ['op de fiets — houding, trapbeweging', 'op de fiets: houding, trapbeweging'],
      ['past — en begrijp je waarom', 'past, en begrijp je waarom'],
      ['Ja — voor groepen', 'Ja, voor groepen'],
    ]),
    metaTitle: { from: OLD_META_TITLES.bikefit, to: seedPage('bikefit').metaTitle },
  },
  {
    slug: 'ons-team',
    edits: swaps([['gewoon fietsen — naar school', 'gewoon fietsen: naar school']]),
  },
  {
    slug: 'veelgestelde-vragen',
    edits: swaps([
      ['op jou — niet omgekeerd — zodat', 'op jou, niet omgekeerd, zodat'],
      ['18 tot 24 maanden — of telkens', '18 tot 24 maanden, of telkens'],
      ['op de fiets — houding, trapbeweging', 'op de fiets: houding, trapbeweging'],
      ['Ja — voor groepen', 'Ja, voor groepen'],
      ['zeggen we het — met uitleg', 'zeggen we het, met uitleg'],
      ['blijven dezelfde — het lichaam', 'blijven dezelfde: het lichaam'],
    ]),
    metaDescription: { from: OLD_FAQ_META, to: NEW_FAQ_META },
  },
  {
    slug: 'afspraak',
    edits: swaps([
      ['We haasten ons niet — als het klaar is', 'We haasten ons niet: als het klaar is'],
    ]),
    // The old number is still in the live text; `phoneSpec` swaps the rest of the page.
    metaDescription: {
      from: OLD_AFSPRAAK_META,
      alsoFrom: [FIRST_SEED_AFSPRAAK_META],
      to: NEW_AFSPRAAK_META,
    },
  },
  {
    slug: 'privacy',
    edits: [
      replace(privacyText, OLD_PRIVACY_DATE_HTML, PRIVACY_DATE_HTML),
      ...PRIVACY_LIST_SWAPS.map(([from, to]) => replace(privacyText, from, to)),
      // Google Maps, named: a paragraph of its own at the end of section 2.
      replace(
        privacyText,
        `</p>\n\n${NEXT_PRIVACY_SECTION_HTML}`,
        `</p>\n${PRIVACY_MAPS_HTML}\n\n${NEXT_PRIVACY_SECTION_HTML}`,
      ),
    ],
    metaDescription: { from: OLD_PRIVACY_META, to: NEW_PRIVACY_META },
  },
  {
    slug: 'algemene-voorwaarden',
    edits: [
      ...ARTICLE_HEADINGS,
      // Art. 8: "fit aan huis" is a retired service.
      replace(termsText, TERMS_HOME_FIT_BULLET_FROM_HTML, TERMS_HOME_FIT_BULLET_TO_HTML),
    ],
    metaDescription: { from: OLD_TERMS_META, to: NEW_TERMS_META },
  },
];

// ---------------------------------------------------------- site settings ----

/** A text in Instellingen that the clean-up changes: guarded like a field of a page. */
export type SettingTextCorrection = {
  key: 'seo';
  field: 'defaultMetaTitle' | 'defaultMetaDescription';
  from: string;
  to: string;
};

/**
 * The default title and description of Instellingen → SEO (`cms-seed.mts` and
 * `cms-bootstrap.mts` write them when a database has none) lose their dashes. An
 * editor's own text is not touched: the patch writes a field only when it holds
 * `from`.
 */
export const SETTING_TEXT_CORRECTIONS: ReadonlyArray<SettingTextCorrection> = [
  {
    key: 'seo',
    field: 'defaultMetaTitle',
    from: 'De Bikefit Studio — professionele bikefit in Ninove',
    to: 'De Bikefit Studio: professionele bikefit in Ninove',
  },
  {
    key: 'seo',
    field: 'defaultMetaDescription',
    from: 'Fiets met comfort. Een bikefit lijnt de fiets uit op jou — niet omgekeerd — zodat elke rit beter voelt en je langer gezond blijft op de fiets.',
    to: 'Fiets met comfort. Een bikefit lijnt de fiets uit op jou, niet omgekeerd, zodat elke rit beter voelt en je langer gezond blijft op de fiets.',
  },
];

// ------------------------------------------------------ allowed dash names ----

/**
 * Names and labels that keep their en dash: the offering titles and the booking
 * services' names and choice labels ("Bikefit – huidige fiets", "Jeugd – eenmalig").
 * Everything else that reads like a sentence separator is a mistake
 * (`withoutAllowedDashNames`).
 */
export const ALLOWED_DASH_NAMES: readonly string[] = [
  ...DEFAULT_OFFERS.map((offer) => offer.content.title),
  ...DEFAULT_SERVICES.flatMap((service) => [service.name, service.choiceLabel]),
].filter((name) => / [–—] /.test(name));

/** `text` with the names that keep their dash taken out, longest first. */
export function withoutAllowedDashNames(text: string): string {
  return [...ALLOWED_DASH_NAMES]
    .sort((a, b) => b.length - a.length)
    .reduce((rest, name) => rest.split(name).join(''), text);
}

/** True when `text` still joins two parts with a dash (outside the allowed names). */
export function hasSentenceDash(text: string): boolean {
  return / [–—] /.test(withoutAllowedDashNames(text));
}
