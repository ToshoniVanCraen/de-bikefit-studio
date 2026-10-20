import { describe, expect, it } from 'vitest';
import type { BookingEmailData } from './templates';
import { bookingReminderEmail, reviewRequestEmail } from './templates-followups';

const DATA: BookingEmailData = {
  siteName: 'De Bikefit Studio',
  siteUrl: 'https://studio.invalid',
  serviceName: 'Volwassenenfit',
  durationMinutes: 120,
  providerName: 'Rutger',
  customerName: 'Anna <b>',
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

describe('bookingReminderEmail', () => {
  it('names the appointment, what to bring and the phone, and escapes the name', () => {
    const mail = bookingReminderEmail(DATA);
    expect(mail.subject).toMatch(/^Herinnering: Volwassenenfit op .* om 09:00$/);
    expect(mail.text).toContain('Hallo Anna <b>, een korte herinnering');
    expect(mail.text).toContain('Volwassenenfit (2 uur)');
    expect(mail.text).toContain('Bel ons even op +32 473 95 26 33');
    expect(mail.text).toContain('Privacyverklaring: https://studio.invalid/privacy');
    expect(mail.html).toContain('Anna &lt;b&gt;');
    expect(mail.html).not.toContain('Qarakter');
  });
});

describe('reviewRequestEmail', () => {
  it('links the review page, promises no automatic publication and dates the link', () => {
    const mail = reviewRequestEmail(DATA, { reviewUrl: 'https://studio.invalid/beoordeling/tok' });
    expect(mail.subject).toBe('Hoe was je volwassenenfit?');
    expect(mail.text).toContain('Laat weten hoe het was: https://studio.invalid/beoordeling/tok');
    expect(mail.text).toContain('komt niet automatisch op de website');
    expect(mail.text).toContain('De link werkt 30 dagen.');
    expect(mail.html).toContain('href="https://studio.invalid/beoordeling/tok"');
    expect(mail.html).toContain('Algemene voorwaarden');
  });
});
