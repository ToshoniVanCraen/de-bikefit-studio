import { describe, expect, it } from 'vitest';
import {
  countryName,
  mapEmbedUrl,
  mapRouteUrl,
  studioPlace,
  type ContactAddress,
} from './location';

const STUDIO: ContactAddress = {
  addressLines: ['Teststraat 12 b'],
  postalCode: '9999',
  city: 'Testdorp',
  country: 'BE',
};

describe('studioPlace', () => {
  it('prints the street lines, then postal code and city, and asks Google for the whole address', () => {
    const place = studioPlace(STUDIO);
    expect(place).not.toBeNull();
    expect(place?.lines).toEqual(['Teststraat 12 b']);
    expect(place?.postalCity).toBe('9999 Testdorp');
    expect(place?.singleLine).toBe('Teststraat 12 b, 9999 Testdorp');
    expect(place?.query).toBe('Teststraat 12 b, 9999 Testdorp, België');
  });

  it('builds both URLs from the address it was given, never from a literal', () => {
    const place = studioPlace({ ...STUDIO, addressLines: ['Andere laan 7'], city: 'Elders' });
    const embed = new URL(place?.embedUrl ?? '');
    expect(embed.searchParams.get('q')).toBe('Andere laan 7, 9999 Elders, België');
    const route = new URL(place?.routeUrl ?? '');
    expect(route.searchParams.get('query')).toBe('Andere laan 7, 9999 Elders, België');
  });

  it('trims lines, drops empty ones and keeps several lines in order', () => {
    const place = studioPlace({
      ...STUDIO,
      addressLines: ['  De Bikefit Studio ', '', '   ', 'Teststraat 12 b'],
    });
    expect(place?.lines).toEqual(['De Bikefit Studio', 'Teststraat 12 b']);
    expect(place?.singleLine).toBe('De Bikefit Studio, Teststraat 12 b, 9999 Testdorp');
  });

  it('copes with a missing postal code, city or country', () => {
    expect(studioPlace({ ...STUDIO, postalCode: '' })?.postalCity).toBe('Testdorp');
    expect(studioPlace({ ...STUDIO, city: '' })?.postalCity).toBe('9999');
    const bare = studioPlace({
      addressLines: ['Teststraat 12 b'],
      postalCode: '',
      city: '',
      country: '',
    });
    expect(bare?.postalCity).toBe('');
    expect(bare?.query).toBe('Teststraat 12 b');
  });

  it('has no place without a street line: a pin on a town would claim an address nobody gave', () => {
    expect(studioPlace({ ...STUDIO, addressLines: [] })).toBeNull();
    expect(studioPlace({ ...STUDIO, addressLines: ['', '  '] })).toBeNull();
    expect(
      studioPlace({ addressLines: [], postalCode: '', city: 'Ninove', country: 'BE' }),
    ).toBeNull();
  });
});

describe('mapEmbedUrl', () => {
  it('is the key-less Google Maps embed that pins the query', () => {
    const url = new URL(mapEmbedUrl('Teststraat 12 b, 9999 Testdorp, België'));
    expect(url.origin).toBe('https://www.google.com');
    expect(url.pathname).toBe('/maps');
    expect(url.searchParams.get('q')).toBe('Teststraat 12 b, 9999 Testdorp, België');
    expect(url.searchParams.get('z')).toBe('15');
    expect(url.searchParams.get('output')).toBe('embed');
    expect(url.searchParams.has('key')).toBe(false);
  });

  it('URL-encodes the query: no raw space, comma, accent, ampersand or hash reaches the URL', () => {
    const query = 'Straat & Zoon #3, 9999 Dörp+, België';
    const raw = mapEmbedUrl(query);
    const queryString = raw.slice(raw.indexOf('?') + 1);
    expect(queryString).not.toMatch(/[ ,ö#]/);
    expect(queryString.match(/&/g)).toHaveLength(2);
    expect(new URL(raw).searchParams.get('q')).toBe(query);
  });
});

describe('mapRouteUrl', () => {
  it('is a Google Maps URLs search link with the encoded query', () => {
    const query = 'Teststraat 12 b, 9999 Testdorp, België';
    const raw = mapRouteUrl(query);
    expect(raw.startsWith('https://www.google.com/maps/search/?api=1&query=')).toBe(true);
    expect(raw).not.toMatch(/[ ,ë]/);
    expect(new URL(raw).searchParams.get('query')).toBe(query);
  });
});

describe('countryName', () => {
  it('names a two-letter code in Dutch', () => {
    expect(countryName('BE')).toBe('België');
    expect(countryName(' nl ')).toBe('Nederland');
  });

  it('uses anything else as typed and leaves an empty value empty', () => {
    expect(countryName('België')).toBe('België');
    expect(countryName('')).toBe('');
    expect(countryName('  ')).toBe('');
  });
});
