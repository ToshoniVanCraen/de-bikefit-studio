import { describe, expect, it } from 'vitest';
import { DEFAULT_STUDIO_LOCATION } from '@/lib/booking/defaults';
import { siteSettingSchemas, validateBlock, validateBlocks } from '@/lib/cms/blocks';
import { studioPlace } from '@/lib/studio/location';
import { AFSPRAAK_PAGE } from './appointment';
import {
  LOCATION_BLOCK,
  STUDIO_CONTACT_ADDRESS,
  STUDIO_LOCATION_ADDRESS,
} from './location-section';

/**
 * The values `cms:patch-aanbod-correcties` applies to an existing database and
 * `cms:seed` publishes on a fresh one (Toshoni, 27 Oct 2026).
 */

describe('studio address', () => {
  it('is Halsesteenweg 406 a, 9403 Neigem', () => {
    expect(STUDIO_CONTACT_ADDRESS).toEqual({
      addressLines: ['Halsesteenweg 406 a'],
      postalCode: '9403',
      city: 'Neigem',
      country: 'BE',
    });
  });

  it('is a valid Instellingen → Contact value that the footer and the location block can print', () => {
    const contact = siteSettingSchemas.contact.parse({
      phoneLabel: '+32 473 95 26 33',
      phoneHref: 'tel:+32473952633',
      ...STUDIO_CONTACT_ADDRESS,
      addressLines: [...STUDIO_CONTACT_ADDRESS.addressLines],
    });
    expect(contact).toMatchObject({ postalCode: '9403', city: 'Neigem', country: 'BE' });
    const place = studioPlace(contact);
    expect(place?.lines).toEqual(['Halsesteenweg 406 a']);
    expect(place?.postalCity).toBe('9403 Neigem');
    expect(place?.query).toBe('Halsesteenweg 406 a, 9403 Neigem, België');
  });

  it('is the same address on the booking location, whose name keeps "Ninove"', () => {
    expect(STUDIO_LOCATION_ADDRESS).toBe(STUDIO_CONTACT_ADDRESS);
    expect(DEFAULT_STUDIO_LOCATION.name).toBe('De Bikefit Studio, Ninove');
    expect({
      addressLines: DEFAULT_STUDIO_LOCATION.addressLines,
      postalCode: DEFAULT_STUDIO_LOCATION.postalCode,
      city: DEFAULT_STUDIO_LOCATION.city,
      country: DEFAULT_STUDIO_LOCATION.country,
    }).toEqual(STUDIO_LOCATION_ADDRESS);
  });
});

describe('LOCATION_BLOCK', () => {
  it('is a valid location block that validation does not change', () => {
    const result = validateBlock(LOCATION_BLOCK.type, LOCATION_BLOCK.data);
    expect(result).toEqual({ ok: true, data: LOCATION_BLOCK.data });
  });

  it('asks "Waar vind je ons?" with the map on and the parking line under the address', () => {
    expect(LOCATION_BLOCK.type).toBe('location');
    expect(LOCATION_BLOCK.data).toMatchObject({
      eyebrow: 'Locatie',
      title: 'Waar vind je ons?',
      note: 'Parking beschikbaar voor de deur.',
      showMap: true,
      mapLabel: 'Kaart tonen',
      routeLabel: 'Route plannen',
    });
  });

  it('carries no address of its own: the street is typed in one place only', () => {
    expect(JSON.stringify(LOCATION_BLOCK)).not.toMatch(/Halsesteenweg|Neigem|9403/);
  });

  it('uses no dash as a sentence separator (Toshoni: a comma or a colon)', () => {
    for (const value of Object.values(LOCATION_BLOCK.data)) {
      if (typeof value === 'string') expect(value, value).not.toMatch(/\s[-–—]\s/);
    }
  });
});

describe('/afspraak', () => {
  it('ends with the location section, after "Voor je komt"', () => {
    expect(AFSPRAAK_PAGE.blocks.map((block) => block.type)).toEqual([
      'booking',
      'richText',
      'location',
    ]);
    expect(AFSPRAAK_PAGE.blocks.at(-1)).toBe(LOCATION_BLOCK);
  });

  it('still validates as a whole page', () => {
    expect(validateBlocks(AFSPRAAK_PAGE.blocks).ok).toBe(true);
  });
});
