import { describe, expect, it } from 'vitest';
import { LEGAL_IDENTITY } from '@/lib/studio/legal';
import {
  defaultSiteSettings,
  isSiteSettingKey,
  parseSiteSetting,
  SITE_SETTING_KEYS,
  siteSettingSchemas,
} from './site-settings';

/**
 * The masters copy refers to (27 Oct 2026): `business` (the legal identity) and
 * `rules` (the lengths in months). A database without their rows reads the
 * schema defaults, which are the values the legal pages and the copy used to
 * type.
 */

describe('business: the legal identity', () => {
  it('defaults to LEGAL_IDENTITY, so a database without the row shows what it showed before', () => {
    expect(defaultSiteSettings().business).toEqual({
      legalName: 'Qarakter BV',
      seatAddressLines: ['Weversstraat 7'],
      seatPostalCode: '1730',
      seatCity: 'Asse',
      seatCountry: 'BE',
      enterpriseNumber: 'BE 1036.912.281',
      vatNumber: 'BE 1036.912.281',
    });
    expect(defaultSiteSettings().business).toEqual({
      legalName: LEGAL_IDENTITY.name,
      seatAddressLines: [LEGAL_IDENTITY.street],
      seatPostalCode: LEGAL_IDENTITY.postalCode,
      seatCity: LEGAL_IDENTITY.city,
      seatCountry: LEGAL_IDENTITY.country,
      enterpriseNumber: LEGAL_IDENTITY.kbo,
      vatNumber: LEGAL_IDENTITY.kbo,
    });
  });

  it('a missing row, an empty value and a partial value read the defaults field by field', () => {
    const defaults = defaultSiteSettings().business;
    expect(parseSiteSetting('business', undefined)).toEqual(defaults);
    expect(parseSiteSetting('business', {})).toEqual(defaults);
    expect(parseSiteSetting('business', { legalName: 'Studio BV' })).toEqual({
      ...defaults,
      legalName: 'Studio BV',
    });
  });

  it('keeps a field an admin emptied empty: the default is for a missing field only', () => {
    expect(parseSiteSetting('business', { vatNumber: '' }).vatNumber).toBe('');
  });

  it('a value that does not validate resets the whole group, which is why the action checks first', () => {
    expect(parseSiteSetting('business', { legalName: 'x'.repeat(121), vatNumber: 'BE 1' })).toEqual(
      defaultSiteSettings().business,
    );
    expect(siteSettingSchemas.business.safeParse({ seatCountry: 'BEL' }).success).toBe(false);
  });

  it('gives every parse its own address array', () => {
    const first = parseSiteSetting('business', {});
    first.seatAddressLines.push('Wijziging');
    expect(parseSiteSetting('business', {}).seatAddressLines).toEqual(['Weversstraat 7']);
    expect(defaultSiteSettings().business.seatAddressLines).toEqual(['Weversstraat 7']);
  });
});

describe('rules: the lengths in the copy', () => {
  it('defaults to six months of follow-up, six months free, a year valid', () => {
    expect(defaultSiteSettings().rules).toEqual({
      followUpMonthsAdult: 6,
      secondVisitFreeMonths: 6,
      voucherValidityMonths: 12,
    });
  });

  it('reads a stored value field by field', () => {
    expect(parseSiteSetting('rules', { followUpMonthsAdult: 9 })).toEqual({
      followUpMonthsAdult: 9,
      secondVisitFreeMonths: 6,
      voucherValidityMonths: 12,
    });
  });

  it('a stored value with the youth package length of 27 Oct 2026 still reads, without it', () => {
    expect(
      parseSiteSetting('rules', { followUpMonthsAdult: 9, followUpMonthsYouthPackage: 12 }),
    ).toEqual({
      followUpMonthsAdult: 9,
      secondVisitFreeMonths: 6,
      voucherValidityMonths: 12,
    });
  });

  it('takes whole months from 1 to 60 and says so in Dutch', () => {
    const message = (value: unknown) => {
      const parsed = siteSettingSchemas.rules.safeParse({ voucherValidityMonths: value });
      return parsed.success ? null : parsed.error.issues[0].message;
    };
    expect(message(1)).toBeNull();
    expect(message(60)).toBeNull();
    expect(message(0)).toBe('Minstens 1 maand.');
    expect(message(61)).toBe('Maximaal 60 maanden.');
    expect(message(6.5)).toBe('Geef een geheel aantal maanden.');
    expect(message(Number.NaN)).toBe('Geef een geheel aantal maanden.');
  });
});

describe('the other groups', () => {
  it('knows the new keys next to the old ones', () => {
    expect(SITE_SETTING_KEYS).toEqual([
      'site',
      'contact',
      'seo',
      'organization',
      'analytics',
      'booking',
      'business',
      'rules',
    ]);
    expect(isSiteSettingKey('business')).toBe(true);
    expect(isSiteSettingKey('rules')).toBe(true);
    expect(isSiteSettingKey('legal')).toBe(false);
  });

  it('organization no longer holds the legal name or the VAT number: a stored value is ignored', () => {
    const organization = parseSiteSetting('organization', {
      type: 'LocalBusiness',
      legalName: 'De Bikefit Studio',
      vatNumber: 'BE 0',
      priceRange: '€€',
    });
    expect(organization).not.toHaveProperty('legalName');
    expect(organization).not.toHaveProperty('vatNumber');
    expect(organization.priceRange).toBe('€€');
  });

  it('every group has a default for every field (a fresh site parses {})', () => {
    for (const key of SITE_SETTING_KEYS) {
      expect(siteSettingSchemas[key].safeParse({}).success, key).toBe(true);
    }
  });
});
