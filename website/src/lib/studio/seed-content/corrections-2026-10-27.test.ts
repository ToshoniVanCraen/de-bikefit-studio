import { describe, expect, it } from 'vitest';
import { sanitizeRichTextHtml } from '@/lib/cms/actions/sanitize';
import { blockRegistry } from '@/lib/cms/blocks';
import { BRING_ALONG } from '@/lib/email/templates';
import { DEFAULT_OFFERS } from '@/lib/offers/defaults';
import { AANBOD_PAGES, TEAM_INTRO } from './aanbod';
import { AFSPRAAK_PAGE, BRING_PARAGRAPH_HTML } from './appointment';
import { STUDIO_EXTRAS_TEXT, TEAM_SELECTION_SENTENCE } from './copy';
import {
  COACHING_CORRECTION,
  CONTACT_EDITS,
  correctionProblems,
  FAQ_BRING_ITEM,
  FAQ_DURATION_ITEM,
  LACTAATTEST_CORRECTION,
  OFFERING_COPY_CORRECTIONS,
  PHONE_EDITS,
  PHONE_HREF_AFTER,
  PHONE_HREF_BEFORE,
  PHONE_LABEL_AFTER,
  PHONE_LABEL_BEFORE,
  phoneSpec,
  replaceContactText,
  replaceLegacyPhone,
  TERMS_ART_3_SERVICES_HTML,
  TERMS_VERSION_HTML,
} from './corrections-2026-10-27';
import { cleanupBlocks, type CleanupBlock } from './page-cleanup';
import { inverse, seedBlocks, spec } from './corrections-test-kit';
import { FAQ_ITEMS } from './faq';
import { PRIVACY_HTML, TERMS_HTML } from './legal';

/**
 * Toshoni's copy corrections of 27 Oct 2026: the seeds carry them, and the
 * exact edits turn the 20 Oct content of an existing database into them.
 * `page-cleanup.test.ts` adds the independent proof for the texts the 13 Oct
 * snapshot holds (team intro, "Voor je komt", the /aanbod meta and head, the
 * /voor-wie texts); `corrections-2026-10-27-copy.test.ts` the tokens and dashes.
 */

/** The items a new FAQ block starts with in the admin (`blocks.ts`). */
const FAQ_DEFAULTS: typeof FAQ_ITEMS = [...blockRegistry.faq.defaultData.items];

/** What the old text of an edit is, whatever its kind. */
function oldTexts(slug: string): string[] {
  return spec(slug).edits.flatMap((edit) =>
    edit.kind === 'replace' || edit.kind === 'replaceItem' || edit.kind === 'set'
      ? [typeof edit.from === 'string' ? edit.from : JSON.stringify(edit.from)]
      : [],
  );
}

/** The pages whose corrections change blocks and whose blocks the seeds define. */
const SEED_PAGE_SLUGS = ['', 'aanbod', 'voor-wie', 'bikefit', 'ons-team', 'afspraak'];

describe('the seeds carry the corrections', () => {
  it('terms: art. 3 is generic, the version line is new, the rest of the article stays', () => {
    expect(TERMS_HTML).toContain(TERMS_VERSION_HTML);
    expect(TERMS_HTML).toContain(
      `<h2>Artikel 3: Onze diensten</h2>\n${TERMS_ART_3_SERVICES_HTML}\n<p>Wij verbinden ons tot een zorgvuldige uitvoering naar best vermogen (inspanningsverbintenis).`,
    );
    for (const gone of oldTexts('algemene-voorwaarden')) expect(TERMS_HTML).not.toContain(gone);
    expect(TERMS_ART_3_SERVICES_HTML).not.toMatch(
      /volwassenenfit|jeugdfit|gezinspakket|fit aan huis|inspanningstesten/i,
    );
    expect(TERMS_ART_3_SERVICES_HTML).toContain('op onze website');
    expect(TERMS_ART_3_SERVICES_HTML).toContain('op het moment dat je je afspraak maakte');
    // Numbering untouched: Artikel 1 … Artikel 14, in order.
    const numbers = [...TERMS_HTML.matchAll(/<h2>Artikel (\d+): /g)].map((match) =>
      Number(match[1]),
    );
    expect(numbers).toEqual(Array.from({ length: 14 }, (_, index) => index + 1));
    // Art. 8 asks for the pedals and no longer for a fit at home (a retired service).
    expect(TERMS_HTML).not.toMatch(/fit aan huis|fietstrainer/i);
  });

  it('FAQ: the seed script and the block defaults hold the same items, with the two new answers', () => {
    expect(FAQ_ITEMS).toHaveLength(8);
    expect(FAQ_DEFAULTS).toEqual(FAQ_ITEMS);
    expect(FAQ_ITEMS).toContainEqual(FAQ_BRING_ITEM);
    expect(FAQ_ITEMS).toContainEqual(FAQ_DURATION_ITEM);
    for (const edit of spec('veelgestelde-vragen').edits) {
      if (edit.kind === 'replaceItem') expect(FAQ_ITEMS).not.toContainEqual(edit.from);
    }
  });

  it('the duration answer states no hours and names both fit pages; answers stay plain text', () => {
    expect(FAQ_DURATION_ITEM.answer).not.toMatch(/\d|\buur\b|\buren\b|minuten|\{\{/);
    expect(FAQ_DURATION_ITEM.answer).toContain('Bikefit – huidige fiets');
    expect(FAQ_DURATION_ITEM.answer).toContain('Bikefit – aankoop nieuwe fiets');
    expect(FAQ_DURATION_ITEM.answer).not.toContain('<');
    const titles = DEFAULT_OFFERS.map((offer) => offer.content.title);
    expect(titles).toContain('Bikefit – huidige fiets');
    expect(titles).toContain('Bikefit – aankoop nieuwe fiets');
  });

  it('pedals are named in the FAQ, on /afspraak and in the e-mails, with the reason; art. 8 asks for them', () => {
    const lists = [
      FAQ_BRING_ITEM.answer,
      BRING_PARAGRAPH_HTML,
      BRING_ALONG,
      String(AFSPRAAK_PAGE.blocks.find((block) => block.data.title === 'Voor je komt')?.data.html),
    ];
    for (const list of lists) {
      expect(list).toContain('eigen pedalen');
      expect(list).toContain('Time-pedalen');
      expect(list).toContain('Shimano-pedalen');
      expect(list).toContain('niet elk systeem hebben we in de studio');
    }
    // One mention per list: the sentence is there once.
    for (const list of lists) expect(list.match(/eigen pedalen/g)).toHaveLength(1);
    expect(TERMS_HTML).toContain('samen met je fietskledij, schoenen en pedalen');
  });

  it('studio texts: no insoles, the saddles stay; the team is chosen on experience and people skills', () => {
    expect(STUDIO_EXTRAS_TEXT).toBe(
      'In de studio kun je een ruime keuze aan zadels uittesten. Zo krijgt ook je zitvlak zijn juiste plaats.',
    );
    expect(TEAM_SELECTION_SENTENCE).toBe(
      'We kiezen ons team op ervaring en mensenkennis, en op de manier waarop iemand luistert.',
    );
    expect(TEAM_INTRO).toBe(
      'Goede begeleiding begint bij de juiste mensen. We kiezen ons team op ervaring en mensenkennis, en op de manier waarop iemand luistert. Je krijgt een aanpak die bij jou past, met heldere uitleg en aandacht voor jouw doelen.',
    );
    const seeds = JSON.stringify(AANBOD_PAGES);
    expect(seeds).not.toMatch(/schoenzolen|3D-geprint|diploma’s/);
    expect(seeds).toContain(JSON.stringify(TEAM_SELECTION_SENTENCE).slice(1, -1));
  });

  it('one term: "inspanningstest" everywhere a visitor reads it; the slug and URL stay', () => {
    const lactaat = DEFAULT_OFFERS.find((offer) => offer.content.slug === 'lactaattest');
    expect(lactaat?.content.title).toBe('Inspanningstest');
    expect(lactaat?.content.metaDescription).toMatch(/^Inspanningstest voor fietsers: /);
    const coaching = DEFAULT_OFFERS.find((offer) => offer.content.slug === 'coaching');
    expect(coaching?.content.extras[0]).toBe('Een inspanningstest.');

    const visible = JSON.stringify({
      pages: [...AANBOD_PAGES, AFSPRAAK_PAGE],
      offers: DEFAULT_OFFERS.map((offer) => offer.content),
      terms: TERMS_HTML,
      faq: FAQ_ITEMS,
      blocks: FAQ_DEFAULTS,
    })
      .replace('"slug":"lactaattest"', '')
      // A copy token names the offering by its slug: `{{prijs:lactaattest:all}}`.
      .replace(/\{\{[^}]*\}\}/g, '');
    expect(visible).not.toMatch(/lactaattest/i);
    // The contents may still say what the test measures.
    expect(lactaat?.content.contents.join(' ')).toContain('lactaatmetingen');
  });

  it('writes no new dash as a sentence separator (Toshoni, 27 Oct 2026)', () => {
    const titles = ['Bikefit – huidige fiets', 'Bikefit – aankoop nieuwe fiets'];
    const fresh = [
      TERMS_ART_3_SERVICES_HTML,
      TERMS_VERSION_HTML,
      FAQ_BRING_ITEM.answer,
      FAQ_DURATION_ITEM.answer,
      BRING_PARAGRAPH_HTML,
      BRING_ALONG,
      STUDIO_EXTRAS_TEXT,
      TEAM_SELECTION_SENTENCE,
      LACTAATTEST_CORRECTION.to.metaDescription ?? '',
    ].map((text) => titles.reduce((rest, title) => rest.split(title).join(''), text));
    for (const text of fresh) expect(text).not.toMatch(/ [—–] /);
  });
});

describe('the edits turn the 20 Oct content into the seed', () => {
  for (const slug of [
    ...SEED_PAGE_SLUGS,
    'veelgestelde-vragen',
    'algemene-voorwaarden',
    'privacy',
  ]) {
    it(`/${slug}: exact old text → today's seed, once, and nothing else`, () => {
      const forward = spec(slug);
      const today = seedBlocks(slug);
      const old = cleanupBlocks(inverse(forward), today);
      expect(old.conflicts).toEqual([]);
      expect(old.changes.length).toBeGreaterThan(0);
      expect(JSON.stringify(old.next)).not.toBe(JSON.stringify(today));

      const result = cleanupBlocks(forward, old.next);
      expect(result.conflicts).toEqual([]);
      expect(result.changes.length).toBe(forward.edits.length);
      expect(result.next).toEqual(today);

      const again = cleanupBlocks(forward, result.next);
      expect(again.changes).toEqual([]);
      expect(again.updated).toEqual([]);
      expect(again.conflicts).toEqual([]);

      expect(correctionProblems(slug, result.next)).toEqual([]);
    });
  }

  it('the meta descriptions: old text with "lactaattest", new text is the seed’s', () => {
    for (const slug of ['', 'aanbod']) {
      const meta = spec(slug).metaDescription;
      const page = AANBOD_PAGES.find((entry) => entry.slug === slug);
      expect(meta?.to).toBe(page?.metaDescription);
      expect(meta?.from).toMatch(/lactaattest en coaching/);
      expect(meta?.to).toMatch(/inspanningstest en coaching/);
      expect(meta?.to).not.toMatch(/lactaattest/i);
    }
  });

  it('the old content is reported by the checks, the new content is clean', () => {
    for (const slug of [
      '',
      'aanbod',
      'voor-wie',
      'bikefit',
      'ons-team',
      'afspraak',
      'veelgestelde-vragen',
      'algemene-voorwaarden',
      'privacy',
    ]) {
      const old = cleanupBlocks(inverse(spec(slug)), seedBlocks(slug)).next;
      expect(correctionProblems(slug, old), slug).not.toEqual([]);
      expect(correctionProblems(slug, seedBlocks(slug)), slug).toEqual([]);
    }
  });

  it('refuses text an editor changed and leaves it alone', () => {
    const terms = seedBlocks('algemene-voorwaarden');
    const old = cleanupBlocks(inverse(spec('algemene-voorwaarden')), terms).next;
    const edited = old.map((block) =>
      block.type === 'richText'
        ? {
            ...block,
            data: {
              ...block.data,
              html: String(block.data.html).replace('onder meer', 'bijvoorbeeld'),
            },
          }
        : block,
    );
    const refused = cleanupBlocks(spec('algemene-voorwaarden'), edited);
    expect(refused.conflicts).toEqual([expect.stringContaining('expected the text')]);
    // Everything nobody touched (the version line, the headings, art. 8) is still brought up to date.
    expect(refused.changes).toHaveLength(spec('algemene-voorwaarden').edits.length - 1);
    expect(JSON.stringify(refused.next)).toContain('bijvoorbeeld');

    const faq = seedBlocks('veelgestelde-vragen');
    const oldFaq = cleanupBlocks(inverse(spec('veelgestelde-vragen')), faq).next;
    const reworded = oldFaq.map((block) => ({
      ...block,
      data: {
        ...block.data,
        items: (block.data.items as { question: string; answer: string }[]).map((item) =>
          item.question === FAQ_BRING_ITEM.question
            ? { ...item, answer: 'Door de redactie herschreven.' }
            : item,
        ),
      },
    }));
    const faqResult = cleanupBlocks(spec('veelgestelde-vragen'), reworded);
    expect(faqResult.conflicts).toEqual([expect.stringContaining('faq.items: no entry equals')]);
    expect(JSON.stringify(faqResult.next)).toContain('Door de redactie herschreven.');
    // The reworded answer is the one conflict; the other edits of the page are still made.
    expect(faqResult.changes).toHaveLength(spec('veelgestelde-vragen').edits.length - 1);
  });

  it('the changed fragments survive the rich-text sanitiser as they are, so the stored HTML matches', () => {
    for (const html of [TERMS_ART_3_SERVICES_HTML, TERMS_VERSION_HTML, BRING_PARAGRAPH_HTML]) {
      expect(sanitizeRichTextHtml(html)).toBe(html);
    }
    // Only whole elements can be checked one by one (a fragment that starts or ends inside a
    // tag is closed by the sanitiser); the whole pages are compared above, after the sanitiser.
    for (const slug of ['algemene-voorwaarden', 'afspraak', 'privacy']) {
      for (const text of oldTexts(slug).filter(
        (entry) => entry.startsWith('<') && !entry.startsWith('</'),
      )) {
        expect(sanitizeRichTextHtml(text)).toBe(text);
      }
    }
  });
});

describe('the phone number: +32 473 95 26 33 everywhere', () => {
  const page = (): CleanupBlock[] => [
    {
      type: 'hero',
      data: {
        title: 'Kop',
        primaryCta: { label: PHONE_LABEL_BEFORE, href: PHONE_HREF_BEFORE, external: false },
        secondaryCta: { label: PHONE_LABEL_AFTER, href: PHONE_HREF_AFTER, external: false },
      },
    },
    {
      type: 'contact',
      data: { phoneLabel: PHONE_LABEL_BEFORE, phoneHref: PHONE_HREF_BEFORE, email: '' },
    },
    {
      type: 'richText',
      data: {
        title: 'Voor je komt',
        html: `<p>Bel <a href="${PHONE_HREF_AFTER}">${PHONE_LABEL_BEFORE}</a> of ${PHONE_LABEL_BEFORE}.</p>`,
      },
    },
  ];

  it('spells the new form the way Toshoni wrote it, and never inside the old one', () => {
    expect(PHONE_LABEL_BEFORE).toBe('0473 95 26 33');
    expect(PHONE_LABEL_AFTER).toBe('+32 473 95 26 33');
    expect(PHONE_HREF_BEFORE).toBe('tel:0473952633');
    expect(PHONE_HREF_AFTER).toBe('tel:+32473952633');
    expect(PHONE_LABEL_AFTER).not.toContain(PHONE_LABEL_BEFORE);
    expect(PHONE_HREF_AFTER).not.toContain(PHONE_HREF_BEFORE);
    expect(PHONE_EDITS.map((edit) => edit.kind)).toEqual(['replaceAll', 'replaceAll']);
  });

  it('swaps label and link in every string of every block, once: the old number first', () => {
    const legacy = cleanupBlocks({ slug: 'welke-pagina-ook', edits: PHONE_EDITS }, page());
    const legacyText = JSON.stringify(legacy.next);
    expect(legacyText).not.toContain(PHONE_LABEL_BEFORE);
    expect(legacyText).not.toContain(PHONE_HREF_BEFORE);
    // Two call-to-action labels, the contact block, and two mentions in the text.
    expect(legacyText.split(PHONE_LABEL_AFTER)).toHaveLength(6);
    expect(legacy.next[1].data).toEqual({
      phoneLabel: PHONE_LABEL_AFTER,
      phoneHref: PHONE_HREF_AFTER,
      email: '',
    });
    expect(legacy.next[2].data.html).toBe(
      `<p>Bel <a href="${PHONE_HREF_AFTER}">${PHONE_LABEL_AFTER}</a> of ${PHONE_LABEL_AFTER}.</p>`,
    );
  });

  it('and then the number is the token, in the same strings, once (the settings keep the number)', () => {
    const result = cleanupBlocks(phoneSpec('welke-pagina-ook'), page());
    const text = JSON.stringify(result.next);
    for (const gone of [
      PHONE_LABEL_BEFORE,
      PHONE_HREF_BEFORE,
      PHONE_LABEL_AFTER,
      PHONE_HREF_AFTER,
    ]) {
      expect(text).not.toContain(gone);
    }
    expect(text.split('{{telefoon}}')).toHaveLength(6);
    expect(result.next[1].data).toEqual({
      phoneLabel: '{{telefoon}}',
      phoneHref: '{{telefoon-href}}',
      email: '',
    });
    expect(result.next[2].data.html).toBe(
      '<p>Bel <a href="{{telefoon-href}}">{{telefoon}}</a> of {{telefoon}}.</p>',
    );
    expect(correctionProblems('welke-pagina-ook', result.next)).toEqual([]);
    expect(correctionProblems('welke-pagina-ook', page())).toEqual(
      expect.arrayContaining([expect.stringContaining('old phone number')]),
    );

    const again = cleanupBlocks(phoneSpec('welke-pagina-ook'), result.next);
    expect(again.changes).toEqual([]);
    expect(again.updated).toEqual([]);
    expect(CONTACT_EDITS.map((edit) => edit.kind).every((kind) => kind === 'replaceAll')).toBe(
      true,
    );
  });

  it('swaps the same strings in the texts outside the blocks', () => {
    expect(
      replaceLegacyPhone(`Liever bellen? ${PHONE_LABEL_BEFORE}. Of ${PHONE_HREF_BEFORE}.`),
    ).toBe(`Liever bellen? ${PHONE_LABEL_AFTER}. Of ${PHONE_HREF_AFTER}.`);
    const done = `Liever bellen? ${PHONE_LABEL_AFTER}.`;
    expect(replaceLegacyPhone(done)).toBe(done);
    expect(replaceLegacyPhone('Geen nummer.')).toBe('Geen nummer.');
    // The whole swap: the old number, then the token.
    expect(replaceContactText(`Liever bellen? ${PHONE_LABEL_BEFORE}.`)).toBe(
      'Liever bellen? {{telefoon}}.',
    );
    expect(replaceContactText('Liever bellen? {{telefoon}}.')).toBe('Liever bellen? {{telefoon}}.');
  });

  it('the seeds carry no number at all, neither the old nor the international form: the token', () => {
    const seeds = JSON.stringify([
      AANBOD_PAGES,
      AFSPRAAK_PAGE,
      FAQ_ITEMS,
      TERMS_HTML,
      PRIVACY_HTML,
    ]);
    for (const literal of [
      PHONE_LABEL_BEFORE,
      PHONE_HREF_BEFORE,
      PHONE_LABEL_AFTER,
      PHONE_HREF_AFTER,
    ]) {
      expect(seeds).not.toContain(literal);
    }
    expect(seeds).toContain('{{telefoon}}');
    expect(seeds).toContain('{{telefoon-href}}');
  });
});

describe('the offering copy corrections', () => {
  it('cover inspanningstest (slug lactaattest) and coaching, and name only the fields that change', () => {
    expect(OFFERING_COPY_CORRECTIONS).toEqual([LACTAATTEST_CORRECTION, COACHING_CORRECTION]);
    expect(OFFERING_COPY_CORRECTIONS.map((correction) => correction.slug)).toEqual([
      'lactaattest',
      'coaching',
    ]);
    for (const correction of OFFERING_COPY_CORRECTIONS) {
      expect(Object.keys(correction.from)).toEqual(Object.keys(correction.to));
      for (const key of Object.keys(correction.from) as (keyof typeof correction.from)[]) {
        expect(correction.from[key], `${correction.slug}.${key}`).not.toEqual(correction.to[key]);
      }
    }
  });

  it('end on the defaults, so a fresh database and a corrected one read the same', () => {
    for (const correction of OFFERING_COPY_CORRECTIONS) {
      const content = DEFAULT_OFFERS.find(
        (offer) => offer.content.slug === correction.slug,
      )?.content;
      expect(content, correction.slug).toBeDefined();
      expect(content).toMatchObject(correction.to);
    }
    expect(LACTAATTEST_CORRECTION.from).toEqual({
      title: 'Lactaattest',
      metaDescription:
        'Lactaattest voor fietsers: stapsgewijze inspanning met lactaatmetingen, en uitleg over wat de resultaten betekenen voor je training. € 120.',
    });
    expect(LACTAATTEST_CORRECTION.to.title).toBe('Inspanningstest');
    expect(COACHING_CORRECTION.from.extras).toEqual([
      'Een lactaattest.',
      'Een bikefit.',
      'Aanvullende opvolging, in overleg.',
    ]);
  });
});
