import { describe, expect, it } from 'vitest';
import { allBlockSpecs, blockSpec } from './field-spec';

/**
 * The admin form of a block is derived from its schema (`field-spec.ts`), so
 * registering the `location` block is what puts it in the palette. These tests
 * keep that form usable: Dutch labels for the new fields, the right inputs, and
 * no field for the address (it is edited in Instellingen → Contact).
 */

describe('admin form for the location block', () => {
  const spec = blockSpec('location');
  const field = (name: string) => spec.fields.find((entry) => entry.name === name);

  it('is in the block palette with its label, description and editor hint', () => {
    expect(allBlockSpecs().location).toBeDefined();
    expect(spec.label).toBe('Locatie');
    expect(spec.description).toMatch(/Google Maps/);
    expect(spec.hint).toMatch(/Instellingen → Contact/);
  });

  it('offers the copy fields in reading order', () => {
    expect(spec.fields.map((entry) => entry.name)).toEqual([
      'variant',
      'eyebrow',
      'title',
      'intro',
      'note',
      'showMap',
      'mapLabel',
      'routeLabel',
    ]);
  });

  it('has no address field to type into', () => {
    const names = spec.fields.map((entry) => entry.name);
    for (const address of ['addressLines', 'postalCode', 'city', 'mapEmbedUrl']) {
      expect(names).not.toContain(address);
    }
  });

  it('labels the new fields in Dutch, not with the field name', () => {
    expect(field('note')?.label).toBe('Opmerking onder het adres (leeg = geen opmerking)');
    expect(field('showMap')?.label).toBe('Kaart tonen (laadt pas na een klik van de bezoeker)');
    expect(field('mapLabel')?.label).toBe('Knoptekst voor de kaart');
    expect(field('routeLabel')?.label).toBe('Linktekst voor de route');
    expect(field('intro')?.label).toBe('Inleiding');
  });

  it('edits the switch as a checkbox, the note as a line and the intro as text', () => {
    expect(field('showMap')?.kind).toBe('boolean');
    expect(field('note')).toMatchObject({ kind: 'text', multiline: false });
    expect(field('intro')).toMatchObject({ kind: 'text', multiline: true });
    expect(field('variant')).toMatchObject({
      kind: 'enum',
      options: ['default', 'gray', 'dark'],
    });
  });
});
