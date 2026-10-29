import { describe, expect, it, vi } from 'vitest';
import type { CmsBooking, CmsLocation, CmsProvider, CmsService } from '@/db/cms-schema';
import { defaultSiteSettings } from '@/lib/cms/site-settings';
import { NB_YOUTH, SERVICES } from '@/lib/offers/direct-production-fixture';
import { bookingConfirmationEmail, providerNotificationEmail } from '@/lib/email/templates';
import { customerRecipients, emailData, type BookingContext } from './notifications';

vi.mock('@/lib/cms/content', () => ({
  getSiteSettings: vi.fn(async () => defaultSiteSettings()),
}));

/** The new-bike Jeugd service after the patch (2 hours, no guardian rule). */
const YOUTH = SERVICES.find((service) => service.id === NB_YOUTH.id);

/** Synthetic post-patch booking row; no database or mail transport is used. */
const context: BookingContext = {
  service: { ...YOUTH, locale: 'nl' } as CmsService,
  booking: {
    id: 'booking-jeugd',
    serviceId: NB_YOUTH.id,
    providerId: 'prov-2',
    locationId: 'studio',
    startsAt: new Date('2026-11-03T09:00:00.000Z'),
    endsAt: new Date('2026-11-03T11:00:00.000Z'),
    timezone: 'Europe/Brussels',
    assignment: 'assigned',
    customerName: 'Lotte Peeters',
    customerEmail: 'ann.peeters@example.test',
    customerPhone: '+32 470 12 34 56',
    customerAge: 13,
    guardianName: null,
    guardianEmail: null,
    guardianPhone: null,
    bikeDetails: 'Koersfiets',
    notes: null,
    customerAddress: null,
  } as CmsBooking,
  provider: {
    id: 'prov-2',
    displayName: 'Fitter Twee',
    email: 'fitter@studio.invalid',
  } as CmsProvider,
  providerLoginEmail: 'fitter-login@studio.invalid',
  location: {
    id: 'studio',
    name: 'De Bikefit Studio',
    kind: 'studio',
    addressLines: ['Halsesteenweg 406 a'],
    postalCode: '9403',
    city: 'Neigem',
    country: 'BE',
  } as CmsLocation,
  addons: [],
};

describe('direct production Jeugd email, rendered without sending (no guardian since 29 Oct 2026)', () => {
  it('uses the Jeugd service and booked span; customer gets one confirmation, nobody is named as guardian', async () => {
    const data = await emailData(context, {
      cancelUrl: 'https://studio.invalid/afspraak/annuleren/token',
    });
    expect(data).toMatchObject({
      serviceName: 'Bikefit – aankoop nieuwe fiets – Jeugd',
      durationMinutes: 120,
      providerName: 'Fitter Twee',
      assignmentPending: false,
      customerName: 'Lotte Peeters',
      locationLabel: 'De Bikefit Studio',
    });
    expect(customerRecipients(context.booking)).toEqual(['ann.peeters@example.test']);
    const customer = bookingConfirmationEmail(data);
    const provider = providerNotificationEmail({ ...data, cancelUrl: null });
    expect(customer.subject).toContain('Bikefit – aankoop nieuwe fiets – Jeugd');
    expect(customer.text).toContain('Wat: Bikefit – aankoop nieuwe fiets – Jeugd (2 uur)');
    expect(customer.text).toContain('Bij: Fitter Twee');
    expect(customer.text).toContain('https://studio.invalid/afspraak/annuleren/token');
    expect(provider.text).toContain('Dienst: Bikefit – aankoop nieuwe fiets – Jeugd (2 uur)');
    expect(provider.text).toContain('Lotte Peeters');
    for (const mail of [customer, provider]) {
      expect(mail.text).not.toMatch(/voogd|pakket/i);
      expect(mail.html).not.toMatch(/voogd|pakket/i);
    }
    expect(provider.text).not.toContain('/afspraak/annuleren/token');
  });
});
