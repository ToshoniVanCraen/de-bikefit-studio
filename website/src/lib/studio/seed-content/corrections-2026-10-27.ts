import { DEFAULT_OFFERS } from '@/lib/offers/defaults';
import type { OfferingContent } from '@/lib/offers/offering-content';
import { AANBOD_PAGES } from './aanbod';
import { BRING_PARAGRAPH_HTML } from './appointment';
import { STUDIO_EXTRAS_TEXT, TEAM_INTRO, TEAM_SELECTION_SENTENCE } from './copy';
import {
  CONTACT_TOKEN_EDITS,
  COPY_PAGE_SPECS,
  KEPT_AANBOD_INTRO,
  termsText,
  tokeniseContactText,
} from './corrections-2026-10-27-copy';
import {
  FAQ_BRING_ITEM,
  FAQ_BRING_QUESTION,
  FAQ_DURATION_ITEM,
  FAQ_DURATION_QUESTION,
  type FaqItem,
} from './faq';
import { TERMS_ART_3_SERVICES_HTML, TERMS_VERSION_HTML } from './legal';
import {
  pageHead,
  set,
  titled,
  type CleanupBlock,
  type CleanupEdit,
  type PageCleanupSpec,
  type Selector,
} from './page-cleanup';
import { PHONE_HREF, PHONE_LABEL } from './shared';

/**
 * Toshoni's copy corrections of 27 Oct 2026 as exact, guarded edits: the pure
 * half of `npm run cms:patch-aanbod-correcties` (the I/O half lives in
 * `scripts/lib/`). The seeds already hold the target state; this module brings
 * a database that holds the 20 Oct content to it, and nothing else.
 *
 * What changes, and where it is written down:
 *
 *   terms (art. 3)     the services are described generically, "as on the website
 *                      when you book"; the version line says 29 oktober 2026
 *                      (`legal.ts`, `TERMS_HTML`; art. 8 and the privacy statement
 *                      lose the parent or guardian on 29 Oct 2026, copy half)
 *   one term           "inspanningstest" instead of "lactaattest" in the meta
 *                      descriptions of the home page and `/aanbod`, in the copy of
 *                      the offering `lactaattest` (title, meta description) and in
 *                      the extras of `coaching`; the slug and the URL stay
 *   pedals             "wat breng ik mee" in the FAQ, on `/afspraak` (and in
 *                      the e-mails, which are code); art. 8 already asked for them
 *   insoles            the 3D-printed insoles are gone from `/bikefit`
 *   FAQ duration       the answer points to the fit pages instead of stating hours
 *   team               "ervaring en mensenkennis", no diplomas: `/ons-team`, home
 *   phone number       `0473 95 26 33` is `+32 473 95 26 33` on every page, and
 *                      then a token (below)
 *   the master         (copy half, `corrections-2026-10-27-copy.ts`) no literal phone
 *                      number, e-mail address, company identity or voucher period on
 *                      a page: tokens that follow Instellingen; no dash between two
 *                      sentences; "ervaren professionals" on `/aanbod`; the terms
 *                      without "fit aan huis"; the privacy statement naming Google
 *                      Maps; the address on the home contact block
 *
 * How the patch uses it:
 *
 *   pages      `CORRECTION_PAGE_SPECS` (both halves, one spec per page):
 *              `cleanupBlocks(spec, blocks)` from `page-cleanup.ts` on the draft
 *              blocks and the live snapshot, the page's meta description and meta
 *              title guarded by `spec.metaDescription` / `spec.metaTitle` (the
 *              rollout text, or an earlier seed text named in `alsoFrom`).
 *   phone      `phoneSpec(slug)` for EVERY page, after its own spec: the old number
 *              to the international form, then the number, the e-mail address and
 *              the company identity to their tokens; `replaceContactText(text)` for
 *              the page's text fields outside the blocks (title, meta title and
 *              description, share title and description); and the site setting
 *              `contact.phoneLabel` / `phoneHref` when they still read the BEFORE
 *              values (the settings keep the facts, the pages carry the tokens).
 *   offerings  `OFFERING_TEXT_CORRECTIONS` and `SERVICE_TEXT_CORRECTIONS`
 *              (`src/lib/offers/corrections-2026-10-27.ts`); `OFFERING_COPY_CORRECTIONS`
 *              below is the first half's list, covered by the first.
 *   settings   `SETTING_TEXT_CORRECTIONS` (copy half): the default SEO title and
 *              description lose their dashes when they still hold the old text.
 *   verify     `correctionProblems(slug, blocks)` on each published snapshot (the one
 *              "gediplomeerde" it allows: `KEPT_AANBOD_INTRO`, the /aanbod subtitle kept).
 *
 * Every edit names the value it expects. A field that already holds the new
 * value is done (idempotent); any other value is a conflict and the patch
 * refuses, so an editor's change is never overwritten silently. The new texts
 * are the seeds' own (`legal.ts`, `faq.ts`, `copy.ts`, `appointment.ts`, the
 * offering defaults), imported here, so they cannot drift. Plain data and
 * functions, no I/O.
 */

export const CORRECTIONS_DATE = '2026-10-27';

// ----------------------------------------------------------------- terms ----

/**
 * The new texts of the terms (the version line, art. 3) and of the FAQ (the pedals, the duration
 * answer) are the seeds' own (`legal.ts`, `faq.ts`), imported here and re-exported, so a seed and
 * its correction can never drift. Art. 14 says the version of the booking day applies, so a
 * change to the terms bumps the version line. Art. 3, first paragraph (Toshoni, 27 Oct 2026:
 * "make more generic, no need to define the exact diensten"): the heading and the second
 * paragraph (inspanningsverbintenis) stay as they were.
 */
export { TERMS_ART_3_SERVICES_HTML, TERMS_VERSION_HTML };

const OLD_TERMS_VERSION_HTML = '<p><em>Versie van 24 september 2026</em></p>';
const OLD_TERMS_ART_3_SERVICES_HTML =
  '<p>Wij bieden bikefits aan (onder meer volwassenenfit, jeugdfit, gezinspakket en fit aan huis) en inspanningstesten. Een bikefit is een afstelling van je fiets op jouw lichaam en manier van fietsen, uitgevoerd door een bikefitter. Het is <strong>geen medische behandeling en vervangt geen doktersbezoek</strong>. Bij pijn, letsels of medische vragen raadpleeg je een arts of kinesitherapeut. Een inspanningstest voer je uit op eigen verantwoordelijkheid; je bevestigt vooraf dat je gezond genoeg bent om een inspanning te leveren en meldt ons relevante medische aandoeningen.</p>';

// ------------------------------------------------------------------- faq ----

export { FAQ_BRING_ITEM, FAQ_DURATION_ITEM };

const OLD_FAQ_BRING_ITEM: FaqItem = {
  question: FAQ_BRING_QUESTION,
  answer:
    'Je fiets (proper en in werkende staat), de schoenen en fietskleding waarin je écht rijdt, en eventuele notities over wat je dwars zit. Meer hebben we niet nodig. De rest doen wij.',
};

const OLD_FAQ_DURATION_ITEM: FaqItem = {
  question: FAQ_DURATION_QUESTION,
  answer:
    'Reken op {{duur:volwassenenfit}} voor een bikefit voor volwassenen en {{duur:jeugdfit}} voor een jeugdfit. We haasten ons niet — als het klaar is, is het klaar.',
};

const faqList: Selector = { label: 'faq', type: 'faq' };

// ------------------------------------------------------ other page texts ----

const OLD_BRING_PARAGRAPH_HTML =
  '<p>Je fiets (proper en in werkende staat), de schoenen en fietskleding waarin je écht rijdt, en eventuele notities over wat je dwars zit. Meer hebben we niet nodig. De rest doen wij.</p>';

const OLD_STUDIO_EXTRAS_TEXT =
  'In de studio maken we ook 3D-geprinte schoenzolen op maat, en je kunt er een ruime keuze aan zadels uittesten. Zo krijgen ook je voeten en je zitvlak hun juiste plaats.';

const OLD_TEAM_INTRO =
  'Goede begeleiding begint bij de juiste mensen. We kiezen ons team op ervaring, vakkennis en de nodige diploma’s, maar ook op de manier waarop iemand luistert. Je krijgt een aanpak die bij jou past, met heldere uitleg en aandacht voor jouw doelen.';
const OLD_TEAM_BAND_BODY =
  'We kiezen ons team op ervaring, vakkennis en de nodige diploma’s, maar ook op de manier waarop iemand luistert.';

const OLD_HOME_META =
  'Bikefit, voet- en zadelanalyse, schoenplaatjes, lactaattest en coaching in Ninove. Persoonlijke fietsbegeleiding, in de studio of bij jou thuis.';
const OLD_AANBOD_META =
  'Bikefit bij aankoop of op je huidige fiets, voetanalyse, zadelanalyse, schoenplaatjes afstellen, lactaattest en coaching in Ninove.';

function seedMeta(slug: string): string {
  const page = AANBOD_PAGES.find((entry) => entry.slug === slug);
  if (!page) throw new Error(`corrections: no seed page "${slug}"`);
  return page.metaDescription;
}

// ----------------------------------------------------------------- pages ----

/** The edits of the first half, in the order they were decided that day. */
const FIRST_HALF_SPECS: PageCleanupSpec[] = [
  {
    slug: '',
    edits: [
      set(
        titled('cta', 'Goede begeleiding begint bij de juiste mensen.'),
        'body',
        OLD_TEAM_BAND_BODY,
        TEAM_SELECTION_SENTENCE,
      ),
    ],
    metaDescription: { from: OLD_HOME_META, to: seedMeta('') },
  },
  {
    slug: 'aanbod',
    edits: [],
    metaDescription: { from: OLD_AANBOD_META, to: seedMeta('aanbod') },
  },
  {
    slug: 'bikefit',
    edits: [
      {
        kind: 'replaceItem',
        select: titled('imageText', 'Meten om beter te kijken'),
        field: 'paragraphs',
        from: OLD_STUDIO_EXTRAS_TEXT,
        to: STUDIO_EXTRAS_TEXT,
      },
    ],
  },
  {
    slug: 'ons-team',
    edits: [set(pageHead, 'subtitle', OLD_TEAM_INTRO, TEAM_INTRO)],
  },
  {
    slug: 'veelgestelde-vragen',
    edits: [
      {
        kind: 'replaceItem',
        select: faqList,
        field: 'items',
        from: OLD_FAQ_BRING_ITEM,
        to: FAQ_BRING_ITEM,
      },
      {
        kind: 'replaceItem',
        select: faqList,
        field: 'items',
        from: OLD_FAQ_DURATION_ITEM,
        to: FAQ_DURATION_ITEM,
      },
    ],
  },
  {
    slug: 'afspraak',
    edits: [
      {
        kind: 'replace',
        select: titled('richText', 'Voor je komt'),
        field: 'html',
        from: OLD_BRING_PARAGRAPH_HTML,
        to: BRING_PARAGRAPH_HTML,
      },
    ],
  },
  {
    slug: 'algemene-voorwaarden',
    edits: [
      {
        kind: 'replace',
        select: termsText,
        field: 'html',
        from: OLD_TERMS_VERSION_HTML,
        to: TERMS_VERSION_HTML,
      },
      {
        kind: 'replace',
        select: termsText,
        field: 'html',
        from: OLD_TERMS_ART_3_SERVICES_HTML,
        to: TERMS_ART_3_SERVICES_HTML,
      },
    ],
  },
];

/**
 * The page edits of the whole day: the first half above, then the copy half
 * (`corrections-2026-10-27-copy.ts`: tokens and dashes), merged into ONE spec
 * per page, edits in that order. A page only the copy half touches (`voor-wie`,
 * `privacy`) is appended. At most one spec per page holds a meta description or
 * a meta title, so the patch's guards never chain.
 */
function mergeSpecs(...lists: ReadonlyArray<readonly PageCleanupSpec[]>): PageCleanupSpec[] {
  const merged: PageCleanupSpec[] = [];
  for (const spec of lists.flat()) {
    const found = merged.find((entry) => entry.slug === spec.slug);
    if (!found) {
      merged.push({ ...spec, edits: [...spec.edits] });
      continue;
    }
    found.edits.push(...spec.edits);
    for (const key of ['metaDescription', 'metaTitle'] as const) {
      if (spec[key] === undefined) continue;
      if (found[key] !== undefined) {
        throw new Error(`corrections: two ${key} guards for "${spec.slug || '(home)'}"`);
      }
      found[key] = spec[key];
    }
  }
  return merged;
}

export const CORRECTION_PAGE_SPECS: PageCleanupSpec[] = mergeSpecs(
  FIRST_HALF_SPECS,
  COPY_PAGE_SPECS,
);

export {
  ALLOWED_DASH_NAMES,
  CONTACT_TOKEN_EDITS,
  hasSentenceDash,
  SETTING_TEXT_CORRECTIONS,
  tokeniseContactText,
  type SettingTextCorrection,
} from './corrections-2026-10-27-copy';

// ----------------------------------------------------------- phone number ----

/** Toshoni, 27 Oct 2026: always `+32 473 95 26 33`, never `0473 95 26 33`. */
export const PHONE_LABEL_BEFORE = '0473 95 26 33';
export const PHONE_LABEL_AFTER = PHONE_LABEL;
export const PHONE_HREF_BEFORE = 'tel:0473952633';
export const PHONE_HREF_AFTER = PHONE_HREF;

/**
 * Label and link, in every string of every block. Neither BEFORE value occurs
 * inside its AFTER value, so a second run finds nothing.
 */
export const PHONE_EDITS: CleanupEdit[] = [
  { kind: 'replaceAll', from: PHONE_LABEL_BEFORE, to: PHONE_LABEL_AFTER },
  { kind: 'replaceAll', from: PHONE_HREF_BEFORE, to: PHONE_HREF_AFTER },
];

/**
 * What a page may no longer type (Toshoni, 27 Oct 2026, "the copy refers to the
 * master"): the old number goes to the international form, and then the number,
 * the e-mail address and the company identity go to their tokens. The settings
 * keep the facts (Instellingen → Contact, the legal identity); the pages say
 * `{{telefoon}}`, `{{e-mail}}`, `{{bedrijf}}`, ... and follow them.
 */
export const CONTACT_EDITS: CleanupEdit[] = [...PHONE_EDITS, ...CONTACT_TOKEN_EDITS];

/**
 * The contact edits as a page spec, for ANY page of the database (applied after the
 * page's own edits, because their old texts may still carry the old number). The
 * name is the first half's: it carries the tokens too since the copy half.
 */
export function phoneSpec(slug: string): PageCleanupSpec {
  return { slug, edits: CONTACT_EDITS };
}

/** The same swap for a text outside the blocks (page title, meta and share texts): the old number only. */
export function replaceLegacyPhone(text: string): string {
  return text
    .split(PHONE_LABEL_BEFORE)
    .join(PHONE_LABEL_AFTER)
    .split(PHONE_HREF_BEFORE)
    .join(PHONE_HREF_AFTER);
}

/**
 * The whole swap for a text outside the blocks: the old number, then the number,
 * the e-mail address and the company identity as tokens (what {@link phoneSpec} does
 * to the blocks). Use this, not {@link replaceLegacyPhone}, for page titles, meta
 * and share texts.
 */
export function replaceContactText(text: string): string {
  return tokeniseContactText(replaceLegacyPhone(text));
}

// ------------------------------------------------------------- offerings ----

type OfferingCopy = Pick<
  OfferingContent,
  'title' | 'summary' | 'intro' | 'goal' | 'contents' | 'extras' | 'metaDescription'
>;

/**
 * The copy fields of one offering that change. `from` and `to` hold the same
 * keys, only the ones that change: the patch compares and writes exactly those,
 * so an editor's change to any other field never blocks it.
 */
export type OfferingCopyCorrection = {
  slug: string;
  from: Partial<OfferingCopy>;
  to: Partial<OfferingCopy>;
};

function defaultContent(slug: string): OfferingContent {
  const offering = DEFAULT_OFFERS.find((entry) => entry.content.slug === slug);
  if (!offering) throw new Error(`corrections: no default offering "${slug}"`);
  return offering.content;
}

const lactaat = defaultContent('lactaattest');
const coaching = defaultContent('coaching');

/** Toshoni, 27 Oct 2026: the test is called "inspanningstest". The slug (so the URL) stays `lactaattest`. */
export const LACTAATTEST_CORRECTION: OfferingCopyCorrection = {
  slug: 'lactaattest',
  from: {
    title: 'Lactaattest',
    metaDescription:
      'Lactaattest voor fietsers: stapsgewijze inspanning met lactaatmetingen, en uitleg over wat de resultaten betekenen voor je training. € 120.',
  },
  to: { title: lactaat.title, metaDescription: lactaat.metaDescription },
};

/** The coaching page offers "een inspanningstest" as an extra. */
export const COACHING_CORRECTION: OfferingCopyCorrection = {
  slug: 'coaching',
  from: { extras: ['Een lactaattest.', 'Een bikefit.', 'Aanvullende opvolging, in overleg.'] },
  to: { extras: coaching.extras },
};

export const OFFERING_COPY_CORRECTIONS: OfferingCopyCorrection[] = [
  LACTAATTEST_CORRECTION,
  COACHING_CORRECTION,
];

// ---------------------------------------------------------------- verify ----

function htmlOf(blocks: readonly CleanupBlock[], title: string): string {
  const block = blocks.find((entry) => entry.type === 'richText' && entry.data.title === title);
  return typeof block?.data.html === 'string' ? block.data.html : '';
}

/** Every string inside `value`, however deep. */
function stringsIn(value: unknown): string[] {
  if (typeof value === 'string') return [value];
  if (Array.isArray(value)) return value.flatMap(stringsIn);
  if (value && typeof value === 'object') return Object.values(value).flatMap(stringsIn);
  return [];
}

/** A fragment for a message: cut, on one line. */
function brief(fragment: string): string {
  const line = fragment.replace(/\s+/g, ' ').trim();
  return JSON.stringify(line.length > 60 ? `${line.slice(0, 59)}…` : line);
}

/**
 * The blocks of `/aanbod` as the diploma check reads them: the subtitle of its one page head
 * left out when it is exactly `KEPT_AANBOD_INTRO` (Toshoni's own text of 21 Oct 2026, which the
 * corrections keep). The same words in another block or field, a subtitle that only contains
 * them, a second page head, or any other diploma wording still count.
 */
function withoutKeptIntro(blocks: readonly CleanupBlock[]): readonly CleanupBlock[] {
  const heads = blocks.filter(
    (block) => block.type === pageHead.type && pageHead.where?.(block.data),
  );
  if (heads.length !== 1 || heads[0].data.subtitle !== KEPT_AANBOD_INTRO) return blocks;
  return blocks.map((block) =>
    block === heads[0] ? { ...block, data: { ...block.data, subtitle: '' } } : block,
  );
}

/**
 * What must hold on a page after the corrections (checked on the published
 * snapshot after an apply, and in the tests); returns the violations.
 *
 * Besides the named checks, every exact text the corrections replace (the
 * page's own edits and the contact edits) must be gone: that is what "the dashes
 * are removed" and "no literal phone number, e-mail address or company identity"
 * mean on a page, without judging text an editor wrote himself.
 */
export function correctionProblems(slug: string, blocks: readonly CleanupBlock[]): string[] {
  const problems: string[] = [];
  const text = JSON.stringify(blocks);
  const strings = stringsIn(blocks);
  // Only on /aanbod, only that one subtitle: no exception on the home page or /ons-team.
  const claims = slug === 'aanbod' ? JSON.stringify(withoutKeptIntro(blocks)) : text;
  if (text.includes(PHONE_LABEL_BEFORE) || text.includes(PHONE_HREF_BEFORE)) {
    problems.push(`still shows the old phone number ${PHONE_LABEL_BEFORE}`);
  }
  if (slug === 'algemene-voorwaarden') {
    const html = blocks
      .map((block) => (typeof block.data.html === 'string' ? block.data.html : ''))
      .join('');
    if (!html.includes(TERMS_ART_3_SERVICES_HTML)) problems.push('art. 3 is not the generic text');
    if (!html.includes(TERMS_VERSION_HTML))
      problems.push('the version line is not 29 oktober 2026');
    if (/gezinspakket/i.test(html)) problems.push('still lists the exact services (gezinspakket)');
    if (/fit aan huis/i.test(html)) problems.push('art. 8 still mentions the retired fit aan huis');
  }
  // Toshoni, 29 Oct 2026: no booking asks for a parent or guardian, and the youth package is gone.
  if (/ouder of voogd/i.test(text)) problems.push('still asks for a parent or guardian');
  if (/volledig pakket/i.test(text)) problems.push('still names the withdrawn youth package');
  if (slug === 'privacy' && !(text.includes('Google Maps') && text.includes('Kaart tonen'))) {
    problems.push('the privacy statement does not name Google Maps and its "Kaart tonen" click');
  }
  if (slug === 'veelgestelde-vragen') {
    if (!text.includes('pedalen')) problems.push('"Wat breng ik mee" does not mention pedals');
    if (text.includes('{{duur:')) problems.push('an answer still states durations');
  }
  if (slug === 'afspraak' && !htmlOf(blocks, 'Voor je komt').includes('pedalen')) {
    problems.push('"Voor je komt" does not mention pedals');
  }
  if (slug === 'bikefit' && /schoenzolen|3D-geprint/i.test(text)) {
    problems.push('still mentions the 3D-printed insoles');
  }
  if ((slug === '' || slug === 'ons-team' || slug === 'aanbod') && /diplom/i.test(claims)) {
    problems.push('still says the team is chosen on diplomas');
  }
  const replaced = [
    ...CORRECTION_PAGE_SPECS.filter((spec) => spec.slug === slug).flatMap((spec) => spec.edits),
    ...CONTACT_EDITS,
  ].flatMap((edit) =>
    (edit.kind === 'replace' || edit.kind === 'replaceAll') && edit.from !== '' ? [edit] : [],
  );
  for (const edit of replaced) {
    if (edit.to.includes(edit.from)) continue; // text was added: it stays
    if (strings.some((entry) => entry.includes(edit.from))) {
      problems.push(`still holds ${brief(edit.from)}`);
    }
  }
  return problems;
}
