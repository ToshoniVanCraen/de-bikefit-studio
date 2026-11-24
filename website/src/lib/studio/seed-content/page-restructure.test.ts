import { describe, expect, it } from 'vitest';
import { set, type CleanupBlock } from './page-cleanup';
import { isNew, restructureBlocks, type RestructureSpec } from './page-restructure';
import { identity } from './site-redesign';

/** The block-level operations of the guarded page engine: insert, replace, idempotent, guarded. */

type Row = CleanupBlock & { id: string };

const page = (): Row[] => [
  { id: 'a', type: 'hero', data: { title: 'Kop', subtitle: 'Oud' } },
  { id: 'b', type: 'cta', data: { title: 'Band', body: 'Tekst', variant: 'gray' } },
  { id: 'c', type: 'contact', data: { title: 'Contact' } },
];

const spec: RestructureSpec = {
  slug: 'test',
  blocks: [
    {
      kind: 'insertBlock',
      block: { type: 'welcome', data: { title: 'Welkom' } },
      at: { after: identity('hero', 'Kop') },
      done: identity('welcome', 'Welkom'),
    },
    {
      kind: 'replaceBlock',
      select: identity('cta', 'Band'),
      from: { title: 'Band', body: 'Tekst', variant: 'gray' },
      with: [
        { type: 'imageText', data: { title: 'Band', paragraphs: ['Tekst'] } },
        { type: 'richText', data: { title: '' } },
      ],
      done: [identity('imageText', 'Band'), identity('richText', '')],
    },
    {
      kind: 'insertBlock',
      block: { type: 'chooser', data: { title: 'Keuze' } },
      at: 'start',
      done: identity('chooser', 'Keuze'),
    },
  ],
  edits: [
    set(identity('hero', 'Kop'), 'subtitle', 'Oud', 'Nieuw'),
    set(identity('welcome', 'Welkom'), 'title', 'Welkom', 'Welkom'),
  ],
};

/** The blocks of a result as rows, the new ones with a made-up id (as an apply would add them). */
function asRows(next: ReturnType<typeof restructureBlocks<Row>>['next']): Row[] {
  return next.map((entry, index) =>
    entry.block
      ? { ...entry.block, data: entry.data }
      : { id: `new-${index}`, type: entry.type, data: entry.data },
  );
}

describe('restructureBlocks', () => {
  it('inserts, replaces and then edits fields, keeping the identity of what stays', () => {
    const blocks = page();
    const result = restructureBlocks(spec, blocks);
    expect(result.conflicts).toEqual([]);
    expect(result.next.map((entry) => entry.type)).toEqual([
      'chooser',
      'hero',
      'welcome',
      'imageText',
      'richText',
      'contact',
    ]);
    expect(result.next.filter(isNew).map((entry) => entry.type)).toEqual([
      'chooser',
      'welcome',
      'imageText',
      'richText',
    ]);
    expect(result.next[1].block).toBe(blocks[0]);
    expect(result.next[1].data.subtitle).toBe('Nieuw');
    expect(result.removed).toEqual([blocks[1]]);
    expect(result.changes).toEqual([
      'insert welcome "Welkom" after hero "Kop"',
      'replace cta "Band" with imageText "Band" + richText',
      'insert chooser "Keuze" at the start',
      expect.stringContaining('hero "Kop".subtitle'),
    ]);
    // The caller's objects are untouched.
    expect(blocks[0].data.subtitle).toBe('Oud');
  });

  it('finds nothing to do on its own result', () => {
    const once = asRows(restructureBlocks(spec, page()).next);
    const again = restructureBlocks(spec, once);
    expect(again.changes).toEqual([]);
    expect(again.conflicts).toEqual([]);
    expect(again.removed).toEqual([]);
    expect(again.next.every((entry) => !isNew(entry))).toBe(true);
  });

  it('never replaces a block an editor changed, and says which field', () => {
    const edited = page().map((block) =>
      block.id === 'b' ? { ...block, data: { ...block.data, body: 'Eigen tekst' } } : block,
    );
    const result = restructureBlocks(spec, edited);
    expect(result.conflicts).toEqual([
      'cta "Band": edited since it was published (body), not replaced',
    ]);
    expect(result.removed).toEqual([]);
    expect(result.next.some((entry) => entry.type === 'cta')).toBe(true);
  });

  it('refuses an insert without its anchor, and a block found twice', () => {
    const noHero = page().filter((block) => block.type !== 'hero');
    const result = restructureBlocks({ ...spec, edits: [] }, noHero);
    expect(result.conflicts).toEqual([
      'welcome "Welkom": its place, after hero "Kop", is not one block (found 0)',
    ]);
    const twice = [
      ...page(),
      { id: 'x', type: 'chooser', data: { title: 'Keuze' } },
      { id: 'y', type: 'chooser', data: { title: 'Keuze' } },
    ];
    expect(restructureBlocks({ ...spec, edits: [] }, twice).conflicts).toContain(
      'chooser "Keuze": found 2 times, expected once',
    );
  });

  it('reports a replacement that has neither the old block nor its new ones', () => {
    const gone = page().filter((block) => block.type !== 'cta');
    expect(restructureBlocks({ ...spec, edits: [] }, gone).conflicts).toEqual([
      'cta "Band": neither the old block nor all its replacements are there',
    ]);
  });

  it('a field edit on a value an editor changed is a conflict, as in page-cleanup', () => {
    const edited = page().map((block) =>
      block.id === 'a' ? { ...block, data: { ...block.data, subtitle: 'Van de redactie' } } : block,
    );
    const result = restructureBlocks(spec, edited);
    expect(result.conflicts).toEqual([expect.stringContaining('hero "Kop".subtitle: expected')]);
    expect(result.next.find((entry) => entry.type === 'hero')?.data.subtitle).toBe(
      'Van de redactie',
    );
  });
});
