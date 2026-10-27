import { describe, expect, it } from 'vitest';
import {
  CORRECTION_PAGE_SPECS,
  correctionProblems,
  PHONE_HREF_BEFORE,
  PHONE_LABEL_BEFORE,
} from '@/lib/studio/seed-content/corrections-2026-10-27';
import { EMAIL_TOKEN, PHONE_HREF_TOKEN, PHONE_TOKEN } from '@/lib/studio/seed-content/shared';
import { AFSPRAAK_PAGE } from '@/lib/studio/seed-content/appointment';
import { LOCATION_BLOCK } from '@/lib/studio/seed-content/location-section';
import type { CleanupBlock, PageCleanupSpec } from '@/lib/studio/seed-content/page-cleanup';
import { pageFixture } from './aanbod-correcties-before.mjs';
import {
  diffBlocks,
  hasOps,
  opsProblems,
  PAGE_SOURCES,
  requiredPageSlugs,
  transformBlocks,
  transformPageTexts,
  type PageTexts,
  type WorkBlock,
} from './aanbod-correcties-pages.mjs';

/**
 * The page rules of `cms:patch-aanbod-correcties`, on plain block lists: the
 * content of an existing database (the seeds, turned back into what the 20 Oct
 * database holds, `aanbod-correcties-before.mts`) becomes the seeds again, once,
 * and an editor's own text is refused. The edits themselves are pinned by
 * `corrections-2026-10-27.test.ts` and `cadeaubon-promo.test.ts`; this is the
 * composition.
 */

const { promo } = PAGE_SOURCES;
const HOME_TITLE = String(promo.home.block.data.title);
const VOUCHER_SLUG = promo.voucherPage.slug;
const FAQ_SLUG = 'veelgestelde-vragen';
const pageOf = pageFixture;

const plain = (blocks: readonly WorkBlock[]): CleanupBlock[] =>
  blocks.map(({ type, data }) => ({ type, data }));

/** Every page the patch needs, whatever the specs name today. */
const PAGES_WITH_WORK = requiredPageSlugs();

function cardOf(blocks: readonly CleanupBlock[]): Record<string, unknown> {
  const catalogue = blocks.find((block) => block.type === promo.aanbodCard.blockType);
  const cards = (catalogue?.data.extraCards ?? []) as Record<string, unknown>[];
  return cards.find((card) => card.href === promo.aanbodCard.cardHref) ?? {};
}

describe('which pages the patch needs', () => {
  it('are the pages of the corrections, the promotion and the location section', () => {
    expect(PAGES_WITH_WORK).toEqual(
      expect.arrayContaining([
        '',
        'aanbod',
        'bikefit',
        'ons-team',
        FAQ_SLUG,
        AFSPRAAK_PAGE.slug,
        'algemene-voorwaarden',
        VOUCHER_SLUG,
      ]),
    );
    expect(new Set(PAGES_WITH_WORK).size).toBe(PAGES_WITH_WORK.length);
  });
});

describe('the pages of an existing database become the seeds, once', () => {
  for (const slug of PAGES_WITH_WORK) {
    it(`/${slug}: old texts → the target, without conflicts; a second pass finds nothing`, () => {
      const { old, target } = pageOf(slug);
      const result = transformBlocks(slug, old);
      expect(result.conflicts).toEqual([]);
      expect(result.changes.length).toBeGreaterThan(0);
      expect(plain(result.next)).toEqual(target);

      // The second run reads what the database now holds: the added blocks have ids.
      const saved = result.next.map((block, index) => ({
        ...block,
        id: block.id ?? `new-${index}`,
      }));
      const again = transformBlocks(slug, saved);
      expect(again.changes).toEqual([]);
      expect(again.conflicts).toEqual([]);
      expect(hasOps(diffBlocks(saved, again.next))).toBe(false);
      expect(correctionProblems(slug, plain(result.next))).toEqual([]);
    });
  }

  it('/voor-wie, which no spec names, loses the old phone number for its token', () => {
    const old: WorkBlock[] = [
      { id: 'a', type: 'cta', data: { title: 'Bel ons', body: `Bel ${PHONE_LABEL_BEFORE}.` } },
      { id: 'b', type: 'hero', data: { title: 'Kop' } },
    ];
    const result = transformBlocks('voor-wie', old);
    expect(result.next[0].data.body).toBe(`Bel ${PHONE_TOKEN}.`);
    expect(result.next[1].data).toEqual(old[1].data);
    expect(diffBlocks(old, result.next).updates.map((update) => update.block.id)).toEqual(['a']);
  });
});

describe('what the apply is told to write', () => {
  it('/afspraak: the "Voor je komt" text changes, the location block is added at the end', () => {
    const { old } = pageOf(AFSPRAAK_PAGE.slug);
    const { next } = transformBlocks(AFSPRAAK_PAGE.slug, old);
    const ops = diffBlocks(old, next);
    expect(ops.deletes).toEqual([]);
    expect(ops.updates.map((update) => update.block.type)).toEqual(['richText']);
    expect(ops.inserts).toEqual([
      { index: old.length, type: 'location', data: LOCATION_BLOCK.data },
    ]);
    expect(ops.inserts[0].data).not.toBe(LOCATION_BLOCK.data);
    expect(opsProblems(ops, next, true)).toEqual([]);
  });

  it('/: the gift voucher section goes right after the first offer catalogue', () => {
    const { old } = pageOf('');
    const { next } = transformBlocks('', old);
    const ops = diffBlocks(old, next);
    const index = old.findIndex((block) => block.type === 'offerCatalogue') + 1;
    expect(ops.inserts).toEqual([
      { index, type: promo.home.block.type, data: promo.home.block.data },
    ]);
    expect(next[index].data.title).toBe(HOME_TITLE);
    expect(opsProblems(ops, next, true)).toEqual([]);
  });

  it('does not add a block that is there: a location block, a voucher section of the same title', () => {
    const afspraak: WorkBlock[] = [
      ...pageOf(AFSPRAAK_PAGE.slug).old,
      { id: 'own', type: 'location', data: { title: 'Hier' } },
    ];
    expect(
      diffBlocks(afspraak, transformBlocks(AFSPRAAK_PAGE.slug, afspraak).next).inserts,
    ).toEqual([]);
    const home: WorkBlock[] = [
      ...pageOf('').old,
      { id: 'own', type: 'cta', data: { title: HOME_TITLE, body: 'Mijn eigen tekst' } },
    ];
    const result = transformBlocks('', home);
    expect(diffBlocks(home, result.next).inserts).toEqual([]);
    expect(result.next.find((block) => block.id === 'own')?.data.body).toBe('Mijn eigen tekst');
    // No catalogue on the page: the section goes at the end.
    const bare: WorkBlock[] = [{ id: 'h', type: 'hero', data: { title: 'Kop' } }];
    expect(transformBlocks('', bare).next.map((block) => block.type)).toEqual(['hero', 'cta']);
  });

  it('writes the voucher block’s missing fields without touching one an editor emptied', () => {
    const { old } = pageOf(VOUCHER_SLUG);
    expect(old[0].data).not.toHaveProperty('amounts');
    const { next, changes } = transformBlocks(VOUCHER_SLUG, old);
    expect(next[0].data.amounts).toEqual(promo.voucherPage.blockAdditions.amounts);
    expect(changes.some((change) => change.includes('validityNote'))).toBe(true);
    const emptied = old.map((block) => ({
      ...block,
      data: { ...block.data, amounts: [], validityNote: '' },
    }));
    const kept = transformBlocks(VOUCHER_SLUG, emptied).next;
    expect(kept[0].data.amounts).toEqual([]);
    expect(kept[0].data.validityNote).toBe('');
  });
});

describe('what an editor wrote is refused, and left alone', () => {
  it('the FAQ answer', () => {
    const faq = pageOf(FAQ_SLUG).old.map((block) => ({
      ...block,
      data: {
        ...block.data,
        items: (block.data.items as { question: string; answer: string }[]).map((item) =>
          item.question.startsWith('Wat breng ik mee')
            ? { ...item, answer: 'Zelf geschreven.' }
            : item,
        ),
      },
    }));
    const result = transformBlocks(FAQ_SLUG, faq);
    expect(result.conflicts).toEqual([expect.stringContaining('faq.items: no entry equals')]);
    expect(JSON.stringify(result.next)).toContain('Zelf geschreven.');
  });

  it('the voucher summary (its missing fields are still added) and a second voucher block', () => {
    const voucher = pageOf(VOUCHER_SLUG).old.map((block) => ({
      ...block,
      data: { ...block.data, summary: 'Eigen samenvatting.' },
    }));
    const result = transformBlocks(VOUCHER_SLUG, voucher);
    expect(result.conflicts).toEqual([expect.stringContaining('giftVoucher.summary: expected')]);
    expect(result.next[0].data.summary).toBe('Eigen samenvatting.');
    expect(result.next[0].data).toHaveProperty('amounts');

    const twice = [...pageOf(VOUCHER_SLUG).old, ...pageOf(VOUCHER_SLUG).old];
    expect(transformBlocks(VOUCHER_SLUG, twice).conflicts).toEqual([
      'giftVoucher: expected one such block, found 2',
    ]);
  });

  it('the home band', () => {
    const home = pageOf('').old.map((block) =>
      block.type === 'cta' && block.data.title === 'Goede begeleiding begint bij de juiste mensen.'
        ? { ...block, data: { ...block.data, body: 'Onze eigen woorden.' } }
        : block,
    );
    const result = transformBlocks('', home);
    expect(result.conflicts).toEqual([expect.stringContaining('.body: expected')]);
    expect(JSON.stringify(result.next)).toContain('Onze eigen woorden.');
  });

  it('the card on /aanbod: its summary is guarded, a card taken away is not missed', () => {
    const { old } = pageOf('aanbod');
    expect(cardOf(plain(old)).summary).toBe(promo.aanbodCard.edits[0].from);
    const edited = old.map((block) =>
      block.type === 'offerCatalogue'
        ? {
            ...block,
            data: {
              ...block.data,
              extraCards: (block.data.extraCards as Record<string, unknown>[]).map((entry) => ({
                ...entry,
                summary: 'Anders.',
              })),
            },
          }
        : block,
    );
    expect(transformBlocks('aanbod', edited).conflicts).toEqual([
      expect.stringContaining('offerCatalogue card /cadeaubon.summary: expected'),
    ]);
    const taken = old.map((block) =>
      block.type === 'offerCatalogue'
        ? { ...block, data: { ...block.data, extraCards: [] } }
        : block,
    );
    expect(transformBlocks('aanbod', taken).conflicts).toEqual([]);
  });
});

describe('the texts of the page itself', () => {
  const texts = (over: Partial<PageTexts> = {}): PageTexts => ({
    title: 'Een pagina',
    metaTitle: null,
    metaDescription: null,
    ogTitle: null,
    ogDescription: null,
    ...over,
  });
  /** The texts of a page whose guards are all satisfied. */
  const settled = (spec: PageCleanupSpec, over: Partial<PageTexts> = {}) =>
    texts({
      metaTitle: spec.metaTitle?.to ?? null,
      metaDescription: spec.metaDescription?.to ?? null,
      ...over,
    });
  const unguarded = CORRECTION_PAGE_SPECS.find((spec) => !spec.metaTitle && !spec.metaDescription);

  it('swaps the contact details of the title, meta and share texts for their tokens, null stays null', () => {
    const slug = unguarded?.slug ?? 'ons-team';
    const result = transformPageTexts(
      slug,
      texts({
        title: `Bel ${PHONE_LABEL_BEFORE}`,
        metaDescription: `Liever bellen? ${PHONE_LABEL_BEFORE}. Of ${PHONE_HREF_BEFORE}.`,
        ogDescription: `Bel ${PHONE_LABEL_BEFORE} of mail info@debikefitstudio.be`,
      }),
    );
    expect(result.fields).toEqual({
      title: `Bel ${PHONE_TOKEN}`,
      metaDescription: `Liever bellen? ${PHONE_TOKEN}. Of ${PHONE_HREF_TOKEN}.`,
      ogDescription: `Bel ${PHONE_TOKEN} of mail ${EMAIL_TOKEN}`,
    });
    expect(result.conflicts).toEqual([]);
    expect(transformPageTexts(slug, texts()).fields).toEqual({});
  });

  it('moves a meta description from the rollout text to the new one, and refuses another', () => {
    const guarded = CORRECTION_PAGE_SPECS.filter((entry) => entry.metaDescription);
    expect(guarded.length).toBeGreaterThan(0);
    for (const spec of guarded) {
      const guard = spec.metaDescription as { from: string; to: string };
      const done = transformPageTexts(spec.slug, settled(spec, { metaDescription: guard.from }));
      expect(done.fields.metaDescription, spec.slug).toBe(guard.to);
      expect(transformPageTexts(spec.slug, settled(spec)).fields, spec.slug).toEqual({});
      const own = transformPageTexts(spec.slug, settled(spec, { metaDescription: 'Eigen tekst.' }));
      expect(own.conflicts, spec.slug).toEqual([
        expect.stringContaining('meta description is "Eigen tekst."'),
      ]);
      expect(own.fields, spec.slug).toEqual({});
    }
    const voucher = transformPageTexts(
      VOUCHER_SLUG,
      texts({ metaDescription: promo.voucherPage.metaDescription.from }),
    );
    expect(voucher.fields.metaDescription).toBe(promo.voucherPage.metaDescription.to);
  });

  it('does the same for the meta title (the dashes of four page titles)', () => {
    const guarded = CORRECTION_PAGE_SPECS.filter((entry) => entry.metaTitle);
    expect(guarded.length).toBeGreaterThan(0);
    for (const spec of guarded) {
      const guard = spec.metaTitle as { from: string; to: string };
      const done = transformPageTexts(spec.slug, settled(spec, { metaTitle: guard.from }));
      expect(done.fields.metaTitle, spec.slug).toBe(guard.to);
      expect(done.changes, spec.slug).toEqual([expect.stringContaining('metaTitle: "')]);
      expect(transformPageTexts(spec.slug, settled(spec)).fields, spec.slug).toEqual({});
      const own = transformPageTexts(spec.slug, settled(spec, { metaTitle: 'Eigen titel' }));
      expect(own.conflicts, spec.slug).toEqual([
        expect.stringContaining('meta title is "Eigen titel"'),
      ]);
    }
  });
});

describe('whether the repo will take it', () => {
  it('names a block the sanitiser or the schema refuses, and an unknown block type', () => {
    const old: WorkBlock[] = [{ id: 'a', type: 'cta', data: { title: 'Kop', body: 'Tekst' } }];
    const unsafe: WorkBlock[] = [
      {
        id: 'a',
        type: 'cta',
        data: { title: 'Kop', primaryCta: { label: 'Klik', href: 'javascript:alert(1)' } },
      },
    ];
    expect(opsProblems(diffBlocks(old, unsafe), unsafe, false)).toEqual([
      expect.stringContaining('block cta would be refused'),
    ]);
    const unknown: WorkBlock[] = [...old, { id: null, type: 'bestaat-niet', data: {} }];
    expect(opsProblems(diffBlocks(old, unknown), unknown, false)).toEqual([
      expect.stringContaining('Onbekend bloktype'),
    ]);
  });

  it('checks a page that is published as a whole', () => {
    const next: WorkBlock[] = [
      { id: 'a', type: 'bestaat-niet', data: {} },
      { id: 'b', type: 'cta', data: { title: 'Kop' } },
    ];
    const none = { deletes: [], updates: [], inserts: [] };
    expect(opsProblems(none, next, false)).toEqual([]);
    expect(opsProblems(none, next, true)).toEqual([
      expect.stringContaining('publishing would be refused: block 1 (bestaat-niet)'),
    ]);
  });

  it('finds nothing wrong with what the patch writes on the seeds', () => {
    for (const slug of PAGES_WITH_WORK) {
      const { old } = pageOf(slug);
      const { next } = transformBlocks(slug, old);
      expect(opsProblems(diffBlocks(old, next), next, true), slug).toEqual([]);
    }
  });

  it('tells blocks apart by id: kept ones update, gone ones delete, added ones get none', () => {
    const old: WorkBlock[] = [
      { id: 'a', type: 'hero', data: { v: 1 } },
      { id: 'b', type: 'cta', data: { v: 2 } },
    ];
    const next: WorkBlock[] = [
      { id: 'a', type: 'hero', data: { v: 1 } },
      { id: null, type: 'location', data: { v: 3 } },
    ];
    const ops = diffBlocks(old, next);
    expect(ops.deletes.map((block) => block.id)).toEqual(['b']);
    expect(ops.updates).toEqual([]);
    expect(ops.inserts).toEqual([{ index: 1, type: 'location', data: { v: 3 } }]);
  });
});
