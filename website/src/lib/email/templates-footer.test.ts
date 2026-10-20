import { describe, expect, it } from 'vitest';
import { legalFooterHtml, legalFooterText, type BookingEmailData } from './templates';

const DATA: BookingEmailData = {
  siteName: 'De Bikefit Studio',
  siteUrl: 'https://studio.invalid/',
  serviceName: 'Volwassenenfit',
  durationMinutes: 120,
  providerName: 'Rutger',
  customerName: 'Anna',
  customerEmail: 'anna@example.com',
  startsAt: '2026-10-24T07:00:00.000Z',
  endsAt: '2026-10-24T09:00:00.000Z',
  timezone: 'Europe/Brussels',
  locationLabel: 'De Bikefit Studio, Ninove',
  locationKind: 'studio',
  locationAddressLines: ['Ninove'],
  contactPhoneLabel: '+32 473 95 26 33',
  studioAddress: 'Straat 1, 9400 Ninove',
};

describe('transactional footer (Toshoni, 20 Oct 2026)', () => {
  it('names the studio and its address and links the two legal pages, nothing else', () => {
    const text = legalFooterText(DATA);
    expect(text).toBe(
      [
        '--',
        'De Bikefit Studio · Straat 1, 9400 Ninove',
        'Algemene voorwaarden: https://studio.invalid/algemene-voorwaarden',
        'Privacyverklaring: https://studio.invalid/privacy',
      ].join('\n'),
    );
    const html = legalFooterHtml(DATA);
    expect(html).toContain('De Bikefit Studio · Straat 1, 9400 Ninove');
    expect(html).toContain('href="https://studio.invalid/algemene-voorwaarden"');
    expect(html).toContain('href="https://studio.invalid/privacy"');
    for (const gone of ['Qarakter', 'KBO', 'RPR', 'Weversstraat', 'Tel.', '0473']) {
      expect(text).not.toContain(gone);
      expect(html).not.toContain(gone);
    }
  });

  it('falls back to the name alone while no address is filled in, and escapes', () => {
    const text = legalFooterText({ ...DATA, studioAddress: null, siteName: 'Studio & Co' });
    expect(text.split('\n')[1]).toBe('Studio & Co');
    expect(legalFooterHtml({ ...DATA, studioAddress: '  ', siteName: 'Studio & Co' })).toContain(
      '>Studio &amp; Co</p>',
    );
  });
});
