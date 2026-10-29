import { describe, expect, it } from 'vitest';
import { defaultSiteSettings } from '@/lib/cms/blocks';
import { DEFAULT_OFFERS } from '@/lib/offers/defaults';
import {
  AUDIENCE_LABELS,
  type OfferingAudience,
  type ResolvedOffering,
} from '@/lib/offers/offering';
import { offeringServiceJsonLd, organizationJsonLd, vatIdForSchema } from './jsonld';

const settings = defaultSiteSettings();
const origin = 'https://studio.test';
const canonical = `${origin}/aanbod/bikefit-huidige-fiets`;
const content = DEFAULT_OFFERS.find(
  (entry) => entry.content.slug === 'bikefit-huidige-fiets',
)!.content;

const variant = (audience: OfferingAudience, priceCents: number | null) => ({
  audience,
  label: AUDIENCE_LABELS[audience],
  serviceId: null,
  serviceSlug: null,
  serviceName: null,
  durationMinutes: null,
  requiresGuardian: false,
  priceCents,
  bookable: true,
});
const offering = (
  variants: ReturnType<typeof variant>[],
  bookingMode: ResolvedOffering['bookingMode'] = 'direct',
): ResolvedOffering => ({
  source: 'stored',
  isListed: true,
  isAddon: false,
  soldAlone: true,
  addonMinutes: null,
  addonIds: [],
  addonOptions: [],
  bookingMode,
  variantMode: variants.length > 1 ? 'audience' : 'single',
  status: bookingMode === 'direct' ? 'bookable' : 'enquiry',
  variants,
});
const node = (
  variants: ReturnType<typeof variant>[],
  bookingMode: ResolvedOffering['bookingMode'] = 'direct',
  priceText = '',
) =>
  offeringServiceJsonLd({
    content: { ...content, priceText },
    offering: offering(variants, bookingMode),
    settings,
    origin,
    canonical,
  });

describe('Organization JSON-LD: the legal identity is the business settings', () => {
  it('prints the legal name and the VAT id of Instellingen → Bedrijfsgegevens', () => {
    const node = organizationJsonLd(defaultSiteSettings(), origin);
    expect(node).toMatchObject({
      '@id': `${origin}/#organization`,
      name: 'De Bikefit Studio',
      legalName: 'Qarakter BV',
      vatID: 'BE1036912281',
    });
  });

  it('follows the settings and leaves a cleared field out', () => {
    const changed = defaultSiteSettings();
    changed.business = {
      ...changed.business,
      legalName: 'Studio BV',
      vatNumber: 'BE 0123.456.789',
    };
    expect(organizationJsonLd(changed, origin)).toMatchObject({
      legalName: 'Studio BV',
      vatID: 'BE0123456789',
    });
    changed.business = { ...changed.business, vatNumber: '' };
    expect(organizationJsonLd(changed, origin)).not.toHaveProperty('vatID');
  });

  it('writes a VAT id without spaces and dots', () => {
    expect(vatIdForSchema('BE 1036.912.281')).toBe('BE1036912281');
    expect(vatIdForSchema('')).toBe('');
  });
});

describe('offering Service JSON-LD', () => {
  it('names the offering, its category and the organisation; no price while "Prijs op aanvraag"', () => {
    const service = node([variant('all', null)]);
    expect(service).toMatchObject({
      '@type': 'Service',
      '@id': `${canonical}#dienst`,
      name: 'Bikefit – huidige fiets',
      serviceType: 'Bikefit',
      url: canonical,
      provider: { '@id': `${origin}/#organization` },
    });
    expect(service).not.toHaveProperty('offers');
  });

  it('mirrors the prices set in Beheer → Aanbod: one amount, or one Offer per priced variant', () => {
    expect(node([variant('all', 9900)]).offers).toEqual({
      '@type': 'Offer',
      price: '99.00',
      priceCurrency: 'EUR',
    });
    expect(node([variant('adult', 15000), variant('youth', null)]).offers).toEqual({
      '@type': 'Offer',
      name: 'Volwassene',
      price: '150.00',
      priceCurrency: 'EUR',
    });
    expect(node([variant('adult', 15000), variant('youth', 9000)]).offers).toEqual([
      { '@type': 'Offer', name: 'Volwassene', price: '150.00', priceCurrency: 'EUR' },
      { '@type': 'Offer', name: 'Jeugd – eenmalig', price: '90.00', priceCurrency: 'EUR' },
    ]);
  });

  it('names the two variants of a fit like the page does (29 Oct 2026)', () => {
    const fit = [variant('adult', 27500), variant('youth', 15000)];
    expect(node(fit).offers).toEqual([
      { '@type': 'Offer', name: 'Volwassene', price: '275.00', priceCurrency: 'EUR' },
      { '@type': 'Offer', name: 'Jeugd – eenmalig', price: '150.00', priceCurrency: 'EUR' },
    ]);
  });

  it('a free-text Kostprijs is the Offer description; the cents stay the price after the free period', () => {
    const text = 'Gratis binnen 6 maanden na je fit, daarna € 75';
    expect(node([variant('all', 7500)], 'enquiry', text).offers).toEqual({
      '@type': 'Offer',
      price: '75.00',
      priceCurrency: 'EUR',
      description: text,
    });
    // Booked online, the text does not apply; without a price there is nothing to describe.
    expect(node([variant('all', 7500)], 'direct', text).offers).toEqual({
      '@type': 'Offer',
      price: '75.00',
      priceCurrency: 'EUR',
    });
    expect(node([variant('all', null)], 'enquiry', text)).not.toHaveProperty('offers');
  });
});
