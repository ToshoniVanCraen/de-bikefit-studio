import { describe, expect, it } from 'vitest';
import { blockSpec } from './field-spec';

/**
 * The admin form of the `giftVoucher` block is derived from its schema
 * (`field-spec.ts`). The suggested amounts and the validity line (27 Oct 2026)
 * must be editable in Beheer, with Dutch labels that say what to type: the
 * amount is in eurocent, an empty list leaves the free amount field alone.
 */

describe('admin form for the gift voucher block', () => {
  const spec = blockSpec('giftVoucher');
  const field = (name: string) => spec.fields.find((entry) => entry.name === name);

  it('offers the copy, then the suggested amounts and the validity line', () => {
    expect(spec.fields.map((entry) => entry.name)).toEqual([
      'sortOrder',
      'eyebrow',
      'title',
      'summary',
      'intro',
      'formTitle',
      'sentTitle',
      'sentText',
      'amounts',
      'validityNote',
    ]);
  });

  it('edits the suggested amounts as a list of amount + caption', () => {
    const amounts = field('amounts');
    expect(amounts).toMatchObject({
      kind: 'objectList',
      label: 'Voorgestelde bedragen (leeg = enkel een vrij bedrag)',
    });
    if (amounts?.kind !== 'objectList') throw new Error('amounts is not a list');
    expect(amounts.fields.map((entry) => entry.name)).toEqual(['cents', 'caption']);
    expect(amounts.fields[0]).toMatchObject({
      kind: 'number',
      integer: true,
      label: 'Bedrag in eurocent (7500 = € 75)',
    });
    expect(amounts.fields[1]).toMatchObject({
      kind: 'text',
      multiline: false,
      label: 'Bijschrift (optioneel, bv. Volledige bikefit)',
    });
    expect(amounts.defaultItem).toEqual({ cents: 0, caption: '' });
  });

  it('edits the validity as one line of text', () => {
    expect(field('validityNote')).toMatchObject({
      kind: 'text',
      multiline: false,
      label: 'Geldigheid (regel onder de inleiding en op de bevestiging)',
    });
  });

  it('tells the editor where the validity goes and how amounts are written', () => {
    expect(spec.hint).toMatch(/veld Geldigheid/);
    expect(spec.hint).toMatch(/eurocent/);
    expect(spec.description).toMatch(/voorgestelde bedragen/);
  });
});
