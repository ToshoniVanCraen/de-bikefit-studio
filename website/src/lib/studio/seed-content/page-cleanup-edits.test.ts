import { describe, expect, it } from 'vitest';
import {
  cleanupBlocks,
  type CleanupBlock,
  type CleanupEdit,
  type PageCleanupSpec,
  type Selector,
} from './page-cleanup';

/**
 * The three kinds of edit added for the corrections of 27 Oct 2026
 * (`replace`, `replaceItem`, `replaceAll`): what they swap, that they are
 * idempotent, and that a field nobody can recognise is a conflict, never
 * overwritten. The older kinds are covered by `page-cleanup.test.ts`.
 */

const info: Selector = {
  label: 'richText "Info"',
  type: 'richText',
  where: (data) => data.title === 'Info',
};
const faq: Selector = { label: 'faq', type: 'faq' };

function page(): CleanupBlock[] {
  return [
    {
      type: 'hero',
      data: {
        title: 'Kop',
        primaryCta: { label: 'Bel 0473 95 26 33', href: 'tel:0473952633', external: false },
      },
    },
    { type: 'richText', data: { title: 'Info', html: '<p>Eerst.</p><p>Tweede alinea.</p>' } },
    {
      type: 'faq',
      data: {
        items: [
          { question: 'A?', answer: 'Eén.' },
          { question: 'B?', answer: 'Twee.' },
        ],
      },
    },
  ];
}

function run(blocks: CleanupBlock[], ...edits: CleanupEdit[]) {
  const spec: PageCleanupSpec = { slug: 'x', edits };
  return cleanupBlocks(spec, blocks);
}

function field(blocks: CleanupBlock[], type: string, name: string) {
  return blocks.find((block) => block.type === type)?.data[name];
}

describe('replace: the exact old text inside a text field', () => {
  const edit = (from: string, to: string): CleanupEdit => ({
    kind: 'replace',
    select: info,
    field: 'html',
    from,
    to,
  });

  it('swaps only that text and leaves the rest of the field and the other blocks alone', () => {
    const result = run(page(), edit('<p>Tweede alinea.</p>', '<p>Andere alinea.</p>'));
    expect(result.conflicts).toEqual([]);
    expect(field(result.next, 'richText', 'html')).toBe('<p>Eerst.</p><p>Andere alinea.</p>');
    expect(result.updated.map((entry) => entry.block.type)).toEqual(['richText']);
    expect(result.changes).toHaveLength(1);
  });

  it('is idempotent, also when the new text contains the old one', () => {
    const grow = edit('<p>Eerst.</p>', '<p>Eerst.</p><p>Nieuw.</p>');
    const first = run(page(), grow);
    expect(field(first.next, 'richText', 'html')).toBe(
      '<p>Eerst.</p><p>Nieuw.</p><p>Tweede alinea.</p>',
    );
    const again = run(first.next, grow);
    expect(again.changes).toEqual([]);
    expect(again.updated).toEqual([]);
    expect(again.conflicts).toEqual([]);
  });

  it('is idempotent when the new text is part of the old one (text taken out)', () => {
    const cut = edit('<p>Tweede alinea.</p>', '');
    const first = run(page(), cut);
    expect(field(first.next, 'richText', 'html')).toBe('<p>Eerst.</p>');
    const again = run(first.next, cut);
    expect(again.changes).toEqual([]);
    expect(again.conflicts).toEqual([]);
  });

  it('refuses text it cannot recognise (an editor changed it) and leaves the field as it is', () => {
    const blocks = page();
    blocks[1].data.html = '<p>Eerst.</p><p>Door de redactie herschreven.</p>';
    const result = run(blocks, edit('<p>Tweede alinea.</p>', '<p>Andere alinea.</p>'));
    expect(result.conflicts).toEqual([
      expect.stringContaining('richText "Info".html: expected the text'),
    ]);
    expect(field(result.next, 'richText', 'html')).toBe(
      '<p>Eerst.</p><p>Door de redactie herschreven.</p>',
    );
    expect(result.updated).toEqual([]);
  });

  it('reports a field that is not text and a block that is missing or doubled', () => {
    const blocks = page();
    blocks[1].data.html = ['<p>Eerst.</p>'];
    expect(run(blocks, edit('Eerst', 'Eerste')).conflicts).toEqual([
      'richText "Info".html: not text',
    ]);
    expect(run([], edit('Eerst', 'Eerste')).conflicts).toEqual([
      'richText "Info": expected one such block, found 0',
    ]);
    expect(run([...page(), page()[1]], edit('Eerst', 'Eerste')).conflicts).toEqual([
      'richText "Info": expected one such block, found 2',
    ]);
  });
});

describe('replaceItem: the one list entry equal to the old value', () => {
  const answer = (text: string) => ({ question: 'B?', answer: text });
  const edit = (from: unknown, to: unknown): CleanupEdit => ({
    kind: 'replaceItem',
    select: faq,
    field: 'items',
    from,
    to,
  });

  it('swaps that entry in place, whatever the key order, and keeps the others', () => {
    // Postgres jsonb does not keep key order: the stored entry reads answer-first.
    const blocks = page();
    blocks[2].data.items = [
      { question: 'A?', answer: 'Eén.' },
      { answer: 'Twee.', question: 'B?' },
    ];
    const result = run(blocks, edit(answer('Twee.'), answer('Twee, aangepast.')));
    expect(result.conflicts).toEqual([]);
    expect(field(result.next, 'faq', 'items')).toEqual([
      { question: 'A?', answer: 'Eén.' },
      answer('Twee, aangepast.'),
    ]);
    expect(result.updated.map((entry) => entry.block.type)).toEqual(['faq']);
  });

  it('works on plain text entries too', () => {
    const blocks: CleanupBlock[] = [{ type: 'imageText', data: { paragraphs: ['Een.', 'Twee.'] } }];
    const result = run(blocks, {
      kind: 'replaceItem',
      select: { label: 'imageText', type: 'imageText' },
      field: 'paragraphs',
      from: 'Twee.',
      to: 'Drie.',
    });
    expect(field(result.next, 'imageText', 'paragraphs')).toEqual(['Een.', 'Drie.']);
  });

  it('is idempotent', () => {
    const swap = edit(answer('Twee.'), answer('Twee, aangepast.'));
    const first = run(page(), swap);
    const again = run(first.next, swap);
    expect(again.changes).toEqual([]);
    expect(again.updated).toEqual([]);
    expect(again.conflicts).toEqual([]);
  });

  it('refuses a list without the old entry, and a list that holds it twice', () => {
    const edited = page();
    edited[2].data.items = [
      { question: 'A?', answer: 'Eén.' },
      answer('Door de redactie herschreven.'),
    ];
    const missing = run(edited, edit(answer('Twee.'), answer('Nieuw.')));
    expect(missing.conflicts).toEqual([expect.stringContaining('faq.items: no entry equals')]);
    expect(field(missing.next, 'faq', 'items')).toEqual(edited[2].data.items);

    const doubled = page();
    doubled[2].data.items = [answer('Twee.'), answer('Twee.')];
    expect(run(doubled, edit(answer('Twee.'), answer('Nieuw.'))).conflicts).toEqual([
      expect.stringContaining('faq.items: 2 entries equal'),
    ]);
  });

  it('refuses a field that is not a list', () => {
    const blocks = page();
    blocks[2].data.items = 'Een tekst';
    expect(run(blocks, edit('x', 'y')).conflicts).toEqual(['faq.items: not a list']);
  });
});

describe('replaceAll: an exact string in every field of every block', () => {
  const phone: CleanupEdit = { kind: 'replaceAll', from: '0473 95 26 33', to: '+32 473 95 26 33' };

  it('reaches nested fields, html included, and counts the fields it changed', () => {
    const blocks = page();
    blocks[1].data.html =
      '<p>Bel <a href="tel:+32473952633">0473 95 26 33</a> of 0473 95 26 33.</p>';
    blocks[2].data.items = [{ question: 'Bellen?', answer: 'Ja: 0473 95 26 33.' }];
    const result = run(blocks, phone);
    expect(JSON.stringify(result.next)).not.toContain('0473 95 26 33');
    expect(field(result.next, 'richText', 'html')).toBe(
      '<p>Bel <a href="tel:+32473952633">+32 473 95 26 33</a> of +32 473 95 26 33.</p>',
    );
    expect(result.next[0].data.primaryCta).toMatchObject({
      label: 'Bel +32 473 95 26 33',
      href: 'tel:0473952633',
      external: false,
    });
    expect(result.changes).toEqual(['3 field(s): "0473 95 26 33" → "+32 473 95 26 33"']);
    expect(result.updated.map((entry) => entry.block.type)).toEqual(['hero', 'richText', 'faq']);
  });

  it('never matches inside the new form, so a second run finds nothing', () => {
    const first = run(page(), phone);
    const again = run(first.next, phone);
    expect(again.changes).toEqual([]);
    expect(again.updated).toEqual([]);
    expect(again.conflicts).toEqual([]);
  });

  it('skips blocks an earlier edit of the same spec removed', () => {
    const result = run(page(), { kind: 'remove', select: { label: 'hero', type: 'hero' } }, phone);
    expect(result.removed.map((block) => block.type)).toEqual(['hero']);
    expect(result.updated).toEqual([]);
    expect(result.changes).toEqual(['remove hero']);
  });

  it('refuses an empty string, which would match everywhere', () => {
    expect(() => run(page(), { kind: 'replaceAll', from: '', to: 'x' })).toThrow(
      /must not be empty/,
    );
  });

  it('never touches the caller’s block objects', () => {
    const blocks = page();
    const snapshot = JSON.stringify(blocks);
    run(
      blocks,
      phone,
      { kind: 'replace', select: info, field: 'html', from: 'Eerst', to: 'Eerste' },
      {
        kind: 'replaceItem',
        select: faq,
        field: 'items',
        from: { question: 'A?', answer: 'Eén.' },
        to: { question: 'A?', answer: 'Een.' },
      },
    );
    expect(JSON.stringify(blocks)).toBe(snapshot);
  });
});
