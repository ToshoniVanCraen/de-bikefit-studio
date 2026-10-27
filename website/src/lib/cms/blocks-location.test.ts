import { describe, expect, it } from 'vitest';
import {
  BLOCK_TYPES,
  blockRegistry,
  defaultDataFor,
  isBlockType,
  validateBlock,
  validateBlocks,
} from './blocks';
import { LOCATION_DEFAULTS, locationSchema } from './blocks-location';

describe('location block schema', () => {
  it('fills every field of an empty block with the documented defaults', () => {
    expect(locationSchema.parse({})).toEqual({
      variant: 'default',
      eyebrow: '',
      title: 'Waar vind je ons?',
      intro: '',
      note: 'Parking beschikbaar voor de deur.',
      showMap: true,
      mapLabel: 'Kaart tonen',
      routeLabel: 'Route plannen',
    });
  });

  it('keeps what an editor typed, an emptied note included', () => {
    const data = locationSchema.parse({
      variant: 'gray',
      eyebrow: 'Hier',
      title: 'Kom langs',
      intro: 'Op afspraak.',
      note: '',
      showMap: false,
      mapLabel: 'Toon de kaart',
      routeLabel: 'Hoe geraak ik er?',
    });
    expect(data).toMatchObject({
      variant: 'gray',
      title: 'Kom langs',
      note: '',
      showMap: false,
      mapLabel: 'Toon de kaart',
      routeLabel: 'Hoe geraak ik er?',
    });
  });

  it('refuses values of the wrong type', () => {
    expect(locationSchema.safeParse({ showMap: 'ja' }).success).toBe(false);
    expect(locationSchema.safeParse({ note: 3 }).success).toBe(false);
    expect(locationSchema.safeParse({ variant: 'blue' }).success).toBe(false);
  });

  it('has no address field: the address is read from Instellingen → Contact', () => {
    const fields = Object.keys(locationSchema.shape);
    expect(fields).not.toContain('addressLines');
    expect(fields).not.toContain('city');
    expect(fields).not.toContain('mapEmbedUrl');
  });
});

describe('location block in the registry', () => {
  it('is registered with a Dutch label, description and editor hint', () => {
    expect(isBlockType('location')).toBe(true);
    expect(BLOCK_TYPES).toContain('location');
    const definition = blockRegistry.location;
    expect(definition.label).toBe('Locatie');
    expect(definition.description).toMatch(/Instellingen/);
    expect(definition.editorHint).toMatch(/Zonder adresregels toont dit blok niets/);
  });

  it('inserts a block that validates and does not change when validated again', () => {
    const inserted = defaultDataFor('location');
    const result = validateBlock('location', inserted);
    expect(result).toEqual({ ok: true, data: inserted });
    expect(inserted).toMatchObject({ eyebrow: 'Locatie', showMap: true });
  });

  it('hands out a copy, so an editor can never change the registry default', () => {
    const first = defaultDataFor('location');
    first.title = 'Gewijzigd';
    expect(defaultDataFor('location').title).toBe(LOCATION_DEFAULTS.title);
    expect(blockRegistry.location.defaultData.title).toBe(LOCATION_DEFAULTS.title);
  });

  it('reports the field that is wrong, in a message the admin can show', () => {
    const result = validateBlock('location', { showMap: 'ja' });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toContain('showMap');
  });

  it('lets a page hold the block next to the others', () => {
    const result = validateBlocks([
      { id: 'a', type: 'richText', data: { html: '<p>Voor je komt</p>' } },
      { id: 'b', type: 'location', data: {} },
    ]);
    expect(result.ok).toBe(true);
    if (result.ok)
      expect(result.blocks.map((block) => block.type)).toEqual(['richText', 'location']);
  });
});

describe('location copy', () => {
  it('uses no dash as a sentence separator (Toshoni, 27 Oct 2026: a comma or a colon)', () => {
    const copy = [
      ...Object.values(LOCATION_DEFAULTS),
      blockRegistry.location.description,
      blockRegistry.location.editorHint,
    ];
    for (const text of copy) expect(text, text).not.toMatch(/\s[-–—]\s/);
  });
});
