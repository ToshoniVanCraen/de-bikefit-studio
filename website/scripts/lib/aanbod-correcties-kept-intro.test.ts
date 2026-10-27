import { describe, expect, it } from 'vitest';
import { AANBOD_INTRO } from '@/lib/studio/seed-content/copy';
import { correctionProblems } from '@/lib/studio/seed-content/corrections-2026-10-27';
import { KEPT_AANBOD_INTRO } from '@/lib/studio/seed-content/corrections-2026-10-27-copy';
import { seedBlocks, spec } from '@/lib/studio/seed-content/corrections-test-kit';
import {
  cleanupBlocks,
  pageHead,
  set,
  type CleanupBlock,
} from '@/lib/studio/seed-content/page-cleanup';
import { pageFixture } from './aanbod-correcties-before.mjs';
import { transformBlocks, type WorkBlock } from './aanbod-correcties-pages.mjs';

/**
 * Production's /aanbod subtitle of 21 Oct 2026 (Toshoni's own text, `KEPT_AANBOD_INTRO`):
 * the corrections keep it exactly as it is, staging's rollout text still moves, and any
 * third text is still an editor's change that blocks. The verify allows its
 * "gediplomeerde" in that one field of that one page only.
 */

const DIPLOMAS = 'still says the team is chosen on diplomas';
const KEPT_LINE = `hero (page head).subtitle ${JSON.stringify(`${KEPT_AANBOD_INTRO.slice(0, 57)}...`)}`;

const isHead = (block: CleanupBlock) => block.type === 'hero' && block.data.variant === 'pageHead';
const subtitleOf = (blocks: readonly CleanupBlock[]) => blocks.find(isHead)?.data.subtitle;

/** The blocks with the page head's subtitle set to `subtitle`. */
function withSubtitle<T extends CleanupBlock>(blocks: readonly T[], subtitle: unknown): T[] {
  return blocks.map((block) =>
    isHead(block) ? { ...block, data: { ...block.data, subtitle } } : block,
  );
}

/** /aanbod as production held it on 27 Oct 2026: the old page, with Toshoni's subtitle. */
const production = (): WorkBlock[] => withSubtitle(pageFixture('aanbod').old, KEPT_AANBOD_INTRO);

describe('the kept text itself', () => {
  it('is the 258 characters production holds, neither the rollout text nor the new one', () => {
    expect(KEPT_AANBOD_INTRO).toHaveLength(258);
    expect(
      KEPT_AANBOD_INTRO.endsWith('Persoonlijke fietsbegeleiding, in de studio of bij jou thuis.'),
    ).toBe(true);
    const edit = spec('aanbod').edits.find((entry) => entry.kind === 'set');
    expect(edit?.kind === 'set' && edit.keep).toEqual([KEPT_AANBOD_INTRO]);
    expect(edit?.kind === 'set' && [edit.from, edit.to]).not.toContain(KEPT_AANBOD_INTRO);
  });
});

describe('set with keep: the engine', () => {
  const head = (subtitle: unknown): CleanupBlock[] => [
    { type: 'hero', data: { variant: 'pageHead', title: 'Aanbod', subtitle } },
  ];
  const edit = set(pageHead, 'subtitle', 'Oud.', 'Nieuw.', ['Eigen.']);
  const run = (blocks: CleanupBlock[]) => cleanupBlocks({ slug: 'x', edits: [edit] }, blocks);

  it('leaves a kept value as it is: no write, no conflict, one kept line', () => {
    const result = run(head('Eigen.'));
    expect(result).toMatchObject({
      changes: [],
      conflicts: [],
      kept: ['hero (page head).subtitle "Eigen."'],
    });
    expect(result.updated).toEqual([]);
    expect(subtitleOf(result.next)).toBe('Eigen.');
  });

  it('still moves the old value, and finds nothing on the new one', () => {
    const moved = run(head('Oud.'));
    expect(moved.changes).toEqual(['hero (page head).subtitle: "Oud." → "Nieuw."']);
    expect(subtitleOf(moved.next)).toBe('Nieuw.');
    expect(run(head('Nieuw.'))).toMatchObject({ changes: [], conflicts: [], kept: [] });
  });

  it('refuses a third value, also one that only differs from the kept one by a space', () => {
    for (const third of ['Eigen. ', 'eigen.', 'Ander.', '', null]) {
      const result = run(head(third));
      expect(result.conflicts).toHaveLength(1);
      expect(result.conflicts[0]).toMatch(
        /^hero \(page head\)\.subtitle: expected "Oud\.", found /,
      );
      expect(result).toMatchObject({ changes: [], kept: [], updated: [] });
    }
  });

  it('refuses to keep its own old or new value (it would never correct anything)', () => {
    for (const keep of [['Oud.'], ['Nieuw.']]) {
      const wrong = set(pageHead, 'subtitle', 'Oud.', 'Nieuw.', keep);
      expect(() => cleanupBlocks({ slug: 'x', edits: [wrong] }, head('Oud.'))).toThrow(
        'a kept value is "from" or "to"',
      );
    }
  });

  it('is a plain set without keep', () => {
    expect(set(pageHead, 'subtitle', 'a', 'b')).not.toHaveProperty('keep');
  });
});

describe('/aanbod on production: Toshoni’s subtitle is kept, the rest of the page still moves', () => {
  it('no conflict, no subtitle change, the kept line; everything else reaches the target', () => {
    const { target } = pageFixture('aanbod');
    const result = transformBlocks('aanbod', production());
    expect(result.conflicts).toEqual([]);
    expect(result.kept).toEqual([KEPT_LINE]);
    expect(result.changes.some((line) => line.includes('.subtitle'))).toBe(false);
    expect(result.changes.length).toBeGreaterThan(0);
    const plain = result.next.map(({ type, data }) => ({ type, data }));
    expect(plain).toEqual(withSubtitle(target, KEPT_AANBOD_INTRO));
  });

  it('a second pass changes nothing and still reports the kept subtitle', () => {
    const once = transformBlocks('aanbod', production()).next;
    const again = transformBlocks('aanbod', once);
    expect(again).toMatchObject({ changes: [], conflicts: [], kept: [KEPT_LINE] });
  });

  it('staging’s rollout text still moves to the new intro, nothing kept', () => {
    const { old } = pageFixture('aanbod');
    const result = transformBlocks('aanbod', old);
    expect(result.kept).toEqual([]);
    expect(result.changes.some((line) => line.startsWith('hero (page head).subtitle: '))).toBe(
      true,
    );
    expect(subtitleOf(result.next)).toBe(AANBOD_INTRO);
  });

  it('a third text blocks: the kept one edited, trimmed, padded, or the kept one minus diplomas', () => {
    for (const third of [
      `${KEPT_AANBOD_INTRO} `,
      KEPT_AANBOD_INTRO.slice(0, -1),
      KEPT_AANBOD_INTRO.replace('gediplomeerde ', ''),
      KEPT_AANBOD_INTRO.replace('bij jou thuis', 'bij jou thuis of op locatie'),
    ]) {
      const result = transformBlocks('aanbod', withSubtitle(pageFixture('aanbod').old, third));
      expect(result.kept).toEqual([]);
      expect(
        result.conflicts.filter((line) => line.startsWith('hero (page head).subtitle: expected ')),
      ).toHaveLength(1);
    }
  });
});

describe('the verify: "gediplomeerde" allowed in that one subtitle only', () => {
  const aanbod = () => seedBlocks('aanbod');

  it('/aanbod with Toshoni’s subtitle passes; the new intro passes too', () => {
    expect(correctionProblems('aanbod', withSubtitle(aanbod(), KEPT_AANBOD_INTRO))).toEqual([]);
    expect(correctionProblems('aanbod', aanbod())).toEqual([]);
  });

  it('a subtitle that only contains the kept text, or another diploma text, still fails', () => {
    for (const subtitle of [
      `${KEPT_AANBOD_INTRO} Meer.`,
      'Gediplomeerde fitters.',
      `${KEPT_AANBOD_INTRO} `,
    ]) {
      expect(correctionProblems('aanbod', withSubtitle(aanbod(), subtitle))).toContain(DIPLOMAS);
    }
  });

  it('the kept text in another field or block of /aanbod still fails', () => {
    const blocks = withSubtitle(aanbod(), KEPT_AANBOD_INTRO);
    const inTitle = blocks.map((block) =>
      isHead(block) ? { ...block, data: { ...block.data, title: KEPT_AANBOD_INTRO } } : block,
    );
    expect(correctionProblems('aanbod', inTitle)).toContain(DIPLOMAS);
    const extra = { type: 'richText', data: { html: '<p>Onze diploma’s.</p>' } };
    expect(correctionProblems('aanbod', [...blocks, extra])).toContain(DIPLOMAS);
  });

  it('two page heads: no exception, also when both hold the kept text', () => {
    const blocks = withSubtitle(aanbod(), KEPT_AANBOD_INTRO);
    const head = blocks.find(isHead)!;
    expect(correctionProblems('aanbod', [...blocks, head])).toContain(DIPLOMAS);
  });

  it('the home page and /ons-team get no exception', () => {
    const head = {
      type: 'hero',
      data: { variant: 'pageHead', title: 'x', subtitle: KEPT_AANBOD_INTRO },
    };
    for (const slug of ['', 'ons-team']) {
      expect(correctionProblems(slug, [...seedBlocks(slug), head])).toContain(DIPLOMAS);
    }
  });
});
