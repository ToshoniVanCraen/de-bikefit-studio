import { describe, expect, it } from 'vitest';
import { allBlockSpecs, blockSpec, type FieldSpec } from './field-spec';

/**
 * The admin form of the redesign's blocks is derived from their schemas: Dutch labels for the new
 * fields, the right inputs, and labels that differ per block where one field name means two things.
 */

const field = (fields: FieldSpec[], name: string) => fields.find((entry) => entry.name === name);
const names = (fields: FieldSpec[]) => fields.map((entry) => entry.name);

describe('admin form for welcome, chooser and photoStrip', () => {
  it('are in the block palette', () => {
    const specs = allBlockSpecs();
    for (const type of ['welcome', 'chooser', 'photoStrip']) expect(specs[type]).toBeDefined();
  });

  it('welcome offers title, accent line, text, two buttons and a list of points', () => {
    const spec = blockSpec('welcome');
    expect(names(spec.fields)).toEqual([
      'eyebrow',
      'title',
      'titleEmphasis',
      'body',
      'primaryCta',
      'secondaryCta',
      'items',
    ]);
    expect(field(spec.fields, 'primaryCta')).toMatchObject({ kind: 'link', nullable: true });
    expect(field(spec.fields, 'body')).toMatchObject({ kind: 'text', multiline: true });
  });

  it('chooser has a variant select and cards with their own Dutch labels', () => {
    const spec = blockSpec('chooser');
    expect(field(spec.fields, 'variant')).toMatchObject({
      kind: 'enum',
      options: ['default', 'gray'],
    });
    const choices = field(spec.fields, 'choices');
    expect(choices).toMatchObject({ kind: 'objectList', label: 'Keuzekaarten (2 tot 4)' });
    if (choices?.kind !== 'objectList') throw new Error('choices is no list');
    expect(names(choices.fields)).toEqual([
      'label',
      'title',
      'body',
      'linkLabel',
      'href',
      'featured',
    ]);
    expect(field(choices.fields, 'label')?.label).toMatch(/boven de titel/);
    expect(field(choices.fields, 'featured')).toMatchObject({ kind: 'boolean' });
  });

  it('photoStrip has a layout select, an image list and its own caption label', () => {
    const spec = blockSpec('photoStrip');
    expect(field(spec.fields, 'layout')).toMatchObject({
      kind: 'enum',
      options: ['strip', 'gallery', 'wide'],
    });
    const images = field(spec.fields, 'images');
    if (images?.kind !== 'objectList') throw new Error('images is no list');
    expect(names(images.fields)).toEqual(['image', 'caption', 'focus']);
    expect(field(images.fields, 'image')).toMatchObject({ kind: 'image' });
    // The voucher's caption keeps its own label (field-spec-gift-voucher.test.ts).
    expect(field(images.fields, 'caption')?.label).toBe('Bijschrift (optioneel)');
  });
});

describe('admin form for the extended blocks', () => {
  it('faq items carry a group and an anchor, the block can open the first question', () => {
    const spec = blockSpec('faq');
    expect(field(spec.fields, 'openFirst')).toMatchObject({ kind: 'boolean' });
    const items = field(spec.fields, 'items');
    if (items?.kind !== 'objectList') throw new Error('items is no list');
    expect(names(items.fields)).toEqual(['question', 'answer', 'group', 'groupAnchor']);
    expect(field(items.fields, 'groupAnchor')?.label).toMatch(/beginners/);
  });

  it('cta has an image and a size', () => {
    const spec = blockSpec('cta');
    expect(field(spec.fields, 'image')).toMatchObject({ kind: 'image' });
    expect(field(spec.fields, 'size')).toMatchObject({
      kind: 'enum',
      options: ['auto', 'regular', 'compact'],
    });
  });

  it('audience items carry an optional image', () => {
    const items = field(blockSpec('audience').fields, 'items');
    if (items?.kind !== 'objectList') throw new Error('items is no list');
    expect(field(items.fields, 'image')).toMatchObject({ kind: 'image' });
  });

  it('team has an optional button', () => {
    expect(field(blockSpec('team').fields, 'cta')).toMatchObject({ kind: 'link', nullable: true });
  });
});
