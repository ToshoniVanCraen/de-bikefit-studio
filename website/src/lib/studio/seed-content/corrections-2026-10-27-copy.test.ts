import { describe, expect, it } from 'vitest';
import { DEFAULT_OFFERS } from '@/lib/offers/defaults';
import { AANBOD_PAGES } from './aanbod';
import { AFSPRAAK_PAGE } from './appointment';
import { CADEAUBON_PAGE } from './cadeaubon';
import {
  CONTACT_TOKEN_EDITS,
  COPY_PAGE_SPECS,
  NEW_AFSPRAAK_META,
  PRIVACY_DATE_HTML,
  PRIVACY_MAPS_HTML,
  privacyText,
  SETTING_TEXT_CORRECTIONS,
  TERMS_HOME_FIT_BULLET_FROM_HTML,
  termsText,
  tokeniseContactText,
  ALLOWED_DASH_NAMES,
  hasSentenceDash,
  withoutAllowedDashNames,
} from './corrections-2026-10-27-copy';
import { CORRECTION_PAGE_SPECS, correctionProblems, phoneSpec } from './corrections-2026-10-27';
import { inverse, SEED_SCRIPT, seedBlocks, spec, stored, stringsIn } from './corrections-test-kit';
import { FAQ_ITEMS } from './faq';
import { PRIVACY_HTML, TERMS_HTML } from './legal';
import { cleanupBlocks } from './page-cleanup';
import { AANBOD_INTRO } from './copy';
import { CONTACT_EMAIL, PHONE_HREF, PHONE_LABEL } from './shared';

/**
 * The second half of the corrections of 27 Oct 2026 (Toshoni): the copy refers
 * to the master (a token, never the number) and sentences are not joined by a
 * dash. The seeds carry it; the exact edits turn the content of an existing
 * database into it. (`corrections-2026-10-27.test.ts` replays the page edits
 * page by page; this file adds the contact tokens, the page titles, the
 * settings texts and the checks on the texts themselves.)
 */

const PAGES = [
  '',
  'aanbod',
  'voor-wie',
  'bikefit',
  'ons-team',
  'afspraak',
  'veelgestelde-vragen',
  'algemene-voorwaarden',
  'privacy',
];

describe('the contact tokens: the facts of the master are never typed on a page', () => {
  it('replace the number, the e-mail address and the company identity, none of them inside its token', () => {
    expect(CONTACT_TOKEN_EDITS.map((edit) => (edit.kind === 'replaceAll' ? edit.to : ''))).toEqual([
      '{{telefoon}}',
      '{{telefoon-href}}',
      '{{e-mail}}',
      '{{bedrijf}}',
      '{{zetel}}',
      '{{kbo}}',
    ]);
    const froms = CONTACT_TOKEN_EDITS.map((edit) => (edit.kind === 'replaceAll' ? edit.from : ''));
    expect(froms).toEqual([
      '+32 473 95 26 33',
      'tel:+32473952633',
      'info@debikefitstudio.be',
      'Qarakter BV',
      'Weversstraat 7, 1730 Asse',
      'BE 1036.912.281',
    ]);
    for (const edit of CONTACT_TOKEN_EDITS) {
      if (edit.kind !== 'replaceAll') continue;
      expect(edit.to.includes(edit.from), edit.to).toBe(false);
      // A second run finds nothing: no replaced text sits inside another token.
      for (const other of CONTACT_TOKEN_EDITS) {
        if (other.kind === 'replaceAll') expect(edit.to.includes(other.from), edit.to).toBe(false);
      }
    }
    expect(PHONE_LABEL).toBe('+32 473 95 26 33');
    expect(PHONE_HREF).toBe('tel:+32473952633');
    expect(CONTACT_EMAIL).toBe('info@debikefitstudio.be');
  });

  for (const slug of PAGES) {
    it(`/${slug}: the literal facts of the live page become the tokens of today's seed, once`, () => {
      const today = seedBlocks(slug);
      // The live page: today's seed with the facts typed again.
      const live = cleanupBlocks(
        {
          slug,
          edits: CONTACT_TOKEN_EDITS.map((edit) =>
            edit.kind === 'replaceAll' ? { ...edit, from: edit.to, to: edit.from } : edit,
          ),
        },
        today,
      ).next;
      const result = cleanupBlocks(phoneSpec(slug), live);
      expect(result.conflicts).toEqual([]);
      expect(result.next).toEqual(today);
      const again = cleanupBlocks(phoneSpec(slug), result.next);
      expect(again.changes).toEqual([]);
      expect(correctionProblems(slug, result.next)).toEqual([]);
    });
  }

  it('hit the pages that type a fact: the home page, /afspraak, the terms and the privacy statement', () => {
    const typesAFact = (slug: string) =>
      stringsIn(
        cleanupBlocks(
          {
            slug,
            edits: CONTACT_TOKEN_EDITS.map((edit) =>
              edit.kind === 'replaceAll' ? { ...edit, from: edit.to, to: edit.from } : edit,
            ),
          },
          seedBlocks(slug),
        ).next,
      ).some((text) => /\+32 473|info@debikefitstudio|Qarakter BV|BE 1036/.test(text));
    for (const slug of [
      '',
      'aanbod',
      'bikefit',
      'ons-team',
      'afspraak',
      'algemene-voorwaarden',
      'privacy',
    ]) {
      expect(typesAFact(slug), slug).toBe(true);
    }
  });

  it('swap the same facts in a text outside the blocks, without touching a text that has none', () => {
    expect(tokeniseContactText('Bel +32 473 95 26 33 of mail info@debikefitstudio.be.')).toBe(
      'Bel {{telefoon}} of mail {{e-mail}}.',
    );
    expect(tokeniseContactText('Qarakter BV, Weversstraat 7, 1730 Asse, BE 1036.912.281')).toBe(
      '{{bedrijf}}, {{zetel}}, {{kbo}}',
    );
    expect(tokeniseContactText('Geen feiten.')).toBe('Geen feiten.');
  });

  it('the legal texts of the seed script say the identity only as tokens', () => {
    for (const html of [PRIVACY_HTML, TERMS_HTML]) {
      expect(html).toContain('<strong>{{bedrijf}}</strong>');
      expect(html).toContain('{{zetel}}');
      expect(html).toContain('{{kbo}}');
      expect(html).toContain('<a href="mailto:{{e-mail}}">{{e-mail}}</a>');
      expect(html).toContain('<a href="{{telefoon-href}}">{{telefoon}}</a>');
      expect(html).not.toMatch(/Qarakter|Weversstraat|1036\.912|debikefitstudio|\+32/);
    }
  });
});

describe('the page titles', () => {
  const guards = COPY_PAGE_SPECS.filter((entry) => entry.metaTitle);

  it('lose their dash: home, /aanbod, /voor-wie and /bikefit, ending on the seeds', () => {
    expect(guards.map((entry) => entry.slug)).toEqual(['', 'aanbod', 'voor-wie', 'bikefit']);
    for (const { slug, metaTitle } of guards) {
      const page = AANBOD_PAGES.find((entry) => entry.slug === slug);
      expect(metaTitle?.to, slug).toBe(page?.metaTitle);
      expect(metaTitle?.from, slug).toMatch(/ — /);
      expect(metaTitle?.to, slug).not.toMatch(/ [—–] /);
    }
    expect(guards.map((entry) => entry.metaTitle?.to)).toEqual([
      'De Bikefit Studio: meer plezier. Op jouw fiets.',
      'Ons aanbod: bikefit en begeleiding',
      'Voor wie: elke fietser, op elke leeftijd',
      'De bikefit: hoe het werkt',
    ]);
  });

  it('are merged with the first half of the day: one title guard and one description guard per page', () => {
    for (const slug of PAGES) {
      expect(
        CORRECTION_PAGE_SPECS.filter((entry) => entry.slug === slug),
        slug,
      ).toHaveLength(1);
    }
    expect(spec('').metaTitle).toBeDefined();
    expect(spec('').metaDescription).toBeDefined();
    expect(spec('afspraak').metaDescription?.to).toBe(NEW_AFSPRAAK_META);
    expect(AFSPRAAK_PAGE.metaDescription).toBe(NEW_AFSPRAAK_META);
  });

  it('the /afspraak description names the pedals, and the number as a token; its old text has the old number', () => {
    expect(NEW_AFSPRAAK_META).toContain('schoenen, pedalen en fietskleding');
    expect(NEW_AFSPRAAK_META).toContain('{{telefoon}}');
    expect(spec('afspraak').metaDescription?.from).toContain('0473 95 26 33');
  });
});

describe('the settings texts', () => {
  it('are the default SEO title and description, which the seed script writes without dashes', () => {
    expect(SETTING_TEXT_CORRECTIONS.map((entry) => `${entry.key}.${entry.field}`)).toEqual([
      'seo.defaultMetaTitle',
      'seo.defaultMetaDescription',
    ]);
    for (const { from, to } of SETTING_TEXT_CORRECTIONS) {
      expect(from).toMatch(/ — /);
      expect(to).not.toMatch(/ [—–] /);
      expect(SEED_SCRIPT).toContain(to);
      expect(SEED_SCRIPT).not.toContain(from);
    }
  });
});

describe('the texts of the seed script and the seeds', () => {
  it('the /aanbod intro says "ervaren professionals" (no diplomas) and no dash', () => {
    expect(AANBOD_INTRO).toContain('uitsluitend met ervaren professionals.');
    expect(AANBOD_INTRO).not.toMatch(/gediplomeerd|diploma/i);
    expect(hasSentenceDash(AANBOD_INTRO)).toBe(false);
    const subtitle = spec('aanbod').edits.find((edit) => edit.kind === 'set');
    expect(subtitle?.kind === 'set' && subtitle.to).toBe(AANBOD_INTRO);
  });

  it('the terms: "Artikel N:" in the fourteen headings, art. 8 without "fit aan huis"', () => {
    expect(TERMS_HTML).not.toMatch(/Artikel \d+ – /);
    expect(TERMS_HTML).not.toMatch(/fit aan huis/i);
    expect(TERMS_HTML).toContain(
      '<li>Minderjarigen worden vergezeld door een ouder of voogd, die de afspraak maakt en aanwezig is.</li>\n</ul>',
    );
    expect(TERMS_HOME_FIT_BULLET_FROM_HTML).toMatch(
      /^die de afspraak maakt en aanwezig is\.<\/li>\n<li>Bij een fit aan huis/,
    );
    // The 48 hours of art. 6 are the policy, written once, in the terms.
    expect(TERMS_HTML).toContain('<strong>48 uur</strong>');
  });

  it('the privacy statement names Google Maps, the click on "Kaart tonen", the IP address and the cookies', () => {
    expect(PRIVACY_HTML).toContain(PRIVACY_MAPS_HTML);
    expect(PRIVACY_HTML).toContain(PRIVACY_DATE_HTML);
    for (const part of [
      'Google Maps',
      '“Kaart tonen”',
      'IP-adres',
      'cookies plaatsen',
      'Klik je niet',
    ]) {
      expect(PRIVACY_MAPS_HTML).toContain(part);
    }
    expect(PRIVACY_HTML).toContain('Google Analytics en de kaart van Google Maps');
    expect(PRIVACY_HTML.indexOf(PRIVACY_MAPS_HTML)).toBeGreaterThan(PRIVACY_HTML.indexOf('<h2>2.'));
    expect(PRIVACY_HTML.indexOf(PRIVACY_MAPS_HTML)).toBeLessThan(PRIVACY_HTML.indexOf('<h2>3.'));
    // The same button label the location block prints.
    expect(stringsIn(seedBlocks('afspraak'))).toContain('Kaart tonen');
  });

  it('each page spec of this half finds exactly one rich-text block where it edits HTML', () => {
    for (const [slug, selector] of [
      ['algemene-voorwaarden', termsText],
      ['privacy', privacyText],
    ] as const) {
      const hits = seedBlocks(slug).filter(
        (block) => block.type === selector.type && selector.where?.(block.data),
      );
      expect(hits, slug).toHaveLength(1);
    }
  });

  it('the pages of the seeds and the texts of the script join no sentences with a dash', () => {
    const texts = [
      ...AANBOD_PAGES.flatMap((page) => [
        page.metaTitle,
        page.metaDescription,
        ...stringsIn(page.blocks),
      ]),
      ...stringsIn(AFSPRAAK_PAGE),
      ...stringsIn(CADEAUBON_PAGE),
      ...FAQ_ITEMS.flatMap((item) => [item.question, item.answer]),
      TERMS_HTML,
      PRIVACY_HTML,
    ];
    for (const text of texts) expect(hasSentenceDash(text), text.slice(0, 80)).toBe(false);
  });

  it('every text the corrections write is free of a sentence dash', () => {
    const written = CORRECTION_PAGE_SPECS.flatMap((page) => [
      ...page.edits.flatMap((edit) =>
        edit.kind === 'remove' || edit.kind === 'append' ? [] : stringsIn(edit.to),
      ),
      ...stringsIn(page.metaDescription?.to),
      ...stringsIn(page.metaTitle?.to),
    ]);
    expect(written.length).toBeGreaterThan(40);
    for (const text of written) expect(hasSentenceDash(text), text.slice(0, 80)).toBe(false);
  });

  it('the names that keep their en dash are the offerings and the youth services, nothing else', () => {
    expect(ALLOWED_DASH_NAMES).toEqual(
      expect.arrayContaining([
        'Bikefit – aankoop nieuwe fiets',
        'Bikefit – huidige fiets',
        'Bikefit – tweede bezoek',
        'Bikefit – tweede fiets',
        'Jeugdfit – eenmalig',
        'Jeugdfit – volledig pakket',
        'Jeugd – eenmalig',
        'Jeugd – volledig pakket',
      ]),
    );
    expect(ALLOWED_DASH_NAMES.every((name) => !/—/.test(name))).toBe(true);
    expect(withoutAllowedDashNames('Zie Bikefit – huidige fiets en Jeugd – eenmalig.')).toBe(
      'Zie  en .',
    );
    expect(hasSentenceDash('Zie Bikefit – huidige fiets.')).toBe(false);
    expect(hasSentenceDash('Een fiets – niet omgekeerd – zodat het past.')).toBe(true);
    expect(hasSentenceDash('Een fiets — niet omgekeerd.')).toBe(true);
    expect(
      DEFAULT_OFFERS.map((offer) => offer.content.title).filter((title) => / – /.test(title)),
    ).toHaveLength(4);
  });
});

describe('the replacements hold for text the way the database stores it', () => {
  it('every page edit of this half leaves the stored (sanitised) seeds as they are', () => {
    for (const slug of PAGES) {
      const today = seedBlocks(slug);
      const old = cleanupBlocks(inverse(spec(slug)), today);
      expect(old.conflicts, slug).toEqual([]);
      // Whatever the inverse wrote back, the forward edits and the contact edits restore.
      const restored = cleanupBlocks(phoneSpec(slug), cleanupBlocks(spec(slug), old.next).next);
      expect(restored.next, slug).toEqual(today);
      expect(stored(restored.next), slug).toEqual(restored.next);
    }
  });
});
