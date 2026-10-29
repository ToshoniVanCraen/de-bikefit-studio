import { describe, expect, it } from 'vitest';
import { DEFAULT_SERVICES } from '@/lib/booking/defaults';
import { DEFAULT_OFFERS, PRICES } from './defaults';
import { AUDIENCE_LABELS } from './offering-audience';

/**
 * The copy and prices of the default offerings that must agree with each other
 * (the file itself is data, `defaults.ts`): the youth price of 27 Oct 2026, the
 * corrections Toshoni made that day, and Jeugd as the one-off fit only (29 Oct 2026).
 */

const offer = (slug: string) => {
  const found = DEFAULT_OFFERS.find((entry) => entry.content.slug === slug);
  if (!found) throw new Error(slug);
  return found;
};

describe('the youth price is the same everywhere (Toshoni, 27 Oct 2026)', () => {
  const fits = ['bikefit-nieuwe-fiets', 'bikefit-huidige-fiets'].map(offer);

  it('both fits: Volwassene € 275, Jeugd – eenmalig € 150, and no other variant (29 Oct 2026)', () => {
    expect(PRICES.bikefit).toBe(27500);
    expect(PRICES.bikefitUnder16).toBe(15000);
    for (const fit of fits) {
      expect(fit.variantMode).toBe('audience');
      expect(fit.variants.map((v) => `${v.audience}:${v.priceCents}`)).toEqual([
        'adult:27500',
        'youth:15000',
      ]);
    }
  });

  it('the Inhoud says it once, the same way on both fits: under 16, one fit without follow-up', () => {
    for (const fit of fits) {
      const slug = fit.content.slug;
      const [adults, youth] = fit.content.contents.slice(-2);
      expect(adults).toBe(
        'Probleemopvolging tot {{opvolging:volwassene}} na je fit is inbegrepen.',
      );
      expect(youth).toBe(
        `Jeugd (onder 16): {{prijs:${slug}:youth}} voor een eenmalige fit zonder opvolging.`,
      );
    }
  });

  it('the meta descriptions end with the same sentence, every amount a token', () => {
    for (const fit of fits) {
      const slug = fit.content.slug;
      expect(fit.content.metaDescription).toMatch(
        new RegExp(
          ` \\{\\{prijs:${slug}:adult\\}\\}; onder 16 \\{\\{prijs:${slug}:youth\\}\\} eenmalig\\.$`,
        ),
      );
    }
  });

  it('no default offering or service names the withdrawn youth package (29 Oct 2026)', () => {
    const text = JSON.stringify([DEFAULT_OFFERS, DEFAULT_SERVICES]);
    expect(text).not.toMatch(/volledig pakket|volledige pakket|youth-package|jeugd-pakket/i);
  });

  it('only the bikefits that are booked online have a service per variant, with the variant price and label', () => {
    const current = offer('bikefit-huidige-fiets');
    expect(offer('bikefit-nieuwe-fiets').variants.every((v) => v.serviceSlug === null)).toBe(true);
    for (const variant of current.variants) {
      const service = DEFAULT_SERVICES.find((entry) => entry.slug === variant.serviceSlug);
      expect(service, variant.audience).toBeDefined();
      expect(service?.priceCents, variant.audience).toBe(variant.priceCents);
      expect(service?.choiceLabel, variant.audience).toBe(AUDIENCE_LABELS[variant.audience]);
      expect(service?.showPrice).toBe(true);
    }
  });

  it('the services: Jeugd is the one-off fit without a guardian rule, adults keep six months', () => {
    const bySlug = (slug: string) => DEFAULT_SERVICES.find((entry) => entry.slug === slug);
    expect(DEFAULT_SERVICES.map((service) => service.slug)).toEqual(['volwassenenfit', 'jeugdfit']);
    expect(bySlug('jeugdfit')).toMatchObject({
      name: 'Jeugdfit – eenmalig',
      choiceLabel: 'Jeugd – eenmalig',
      description:
        'Voor fietsers onder 16: één fit, afgestemd op een lichaam in groei, zonder opvolging.',
      durationMinutes: 120,
      priceCents: 15000,
      requiresGuardian: false,
    });
    expect(DEFAULT_SERVICES.every((service) => !service.requiresGuardian)).toBe(true);
    expect(bySlug('volwassenenfit')?.description).toContain(
      'Probleemopvolging tot {{opvolging:volwassene}} na je fit is inbegrepen.',
    );
    // "Volwassene" is no longer what a rider under 16 picks to get follow-up.
    expect(bySlug('jeugdfit')?.description).not.toContain('Volwassene');
  });
});

describe('Bikefit – aankoop nieuwe fiets (Toshoni, 27 Oct 2026)', () => {
  const content = offer('bikefit-nieuwe-fiets').content;
  const adjustment =
    'De afstelling van je nieuwe fiets na de aankoop is inbegrepen in de {{prijs:bikefit-nieuwe-fiets:adult}}: ze hoort bij de opvolging tot {{opvolging:volwassene}} na je fit.';

  it('the adjustment after the purchase is included: in the Inhoud, right before the follow-up lines', () => {
    expect(content.contents.at(-3)).toBe(adjustment);
    expect(content.contents.at(-2)).toMatch(/^Probleemopvolging tot \{\{opvolging:volwassene\}\}/);
  });

  it('it is no longer listed as a possible extra; the second visit and second bike stay', () => {
    expect(content.extras).toEqual([
      'Een tweede bezoek na meer dan {{tweede-bezoek-gratis}}: {{prijs:bikefit-tweede-bezoek:all}}.',
      'Een tweede fiets erbij: vanaf {{prijs:bikefit-tweede-fiets:all}}.',
    ]);
    expect(offer('bikefit-nieuwe-fiets')).toMatchObject({ bookingMode: 'enquiry' });
  });

  it('is asked for, but its Duur follows the Volwassenenfit service instead of typing 2 hours', () => {
    expect(content.duration).toBe('{{duur:volwassenenfit}}');
    expect(DEFAULT_SERVICES.find((entry) => entry.slug === 'volwassenenfit')?.durationMinutes).toBe(
      120,
    );
  });
});

describe('the free-text Kostprijs of an offering that is asked for (27 Oct 2026)', () => {
  it('Bikefit – tweede bezoek says it is free within the follow-up window; no other default has a text', () => {
    // The window and the price are tokens. The price is the variant's (`:all`): the price line
    // of this offering is this very text, so a token for the line would point at itself.
    expect(offer('bikefit-tweede-bezoek').content.priceText).toBe(
      'Gratis binnen {{tweede-bezoek-gratis}} na je fit, daarna {{prijs:bikefit-tweede-bezoek:all}}',
    );
    expect(
      DEFAULT_OFFERS.filter((entry) => entry.content.priceText !== '').map(
        (entry) => entry.content.slug,
      ),
    ).toEqual(['bikefit-tweede-bezoek']);
    // The structured price stays the one after the free period.
    expect(offer('bikefit-tweede-bezoek').variants).toEqual([
      { audience: 'all', serviceSlug: null, priceCents: PRICES.secondVisit },
    ]);
  });
});
