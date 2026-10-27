import { describe, expect, it } from 'vitest';
import { DEFAULT_SERVICES } from '@/lib/booking/defaults';
import { DEFAULT_OFFERS } from '@/lib/offers/defaults';
import { BLOCK_TYPES, blockRegistry, defaultDataFor, validateBlock } from './blocks';

/**
 * The data an editor starts from when adding a block (`defaultDataFor`). Their facts are tokens
 * (27 Oct 2026), tied here to the masters they refer to: the bookable fits are the booking
 * services, their length is `{{duur:<service>}}` and their price the matching variant of the
 * offering "Bikefit – huidige fiets".
 */

const FITS = DEFAULT_SERVICES;
const huidigeFiets = DEFAULT_OFFERS.find((offer) => offer.content.slug === 'bikefit-huidige-fiets');
const audienceOf = new Map(huidigeFiets?.variants.map((v) => [v.serviceSlug, v.audience]));

describe('block defaults an editor starts from', () => {
  it('every block type starts from data its own schema accepts', () => {
    for (const type of BLOCK_TYPES) {
      expect(validateBlock(type, defaultDataFor(type)), type).toMatchObject({ ok: true });
    }
  });

  it('name no package that is no longer sold', () => {
    const text = JSON.stringify(Object.values(blockRegistry).map((block) => block.defaultData));
    expect(text).not.toMatch(/gezinspakket|gezinsfit|inspanningstest/i);
  });

  it('the services card grid offers the fits of the booking widget, their length a token', () => {
    const cards = blockRegistry.services.defaultData.cards.slice(0, FITS.length);
    expect(cards.map((card) => card.title)).toEqual(FITS.map((service) => service.name));
    expect(cards.map((card) => card.duration)).toEqual(
      FITS.map((service) => `{{duur:${service.slug}}}`),
    );
  });

  it('the pricing plans are those fits too, price and length from their masters, hidden until cleared', () => {
    const { plans, isPlaceholder } = blockRegistry.pricing.defaultData;
    const fits = plans.slice(0, FITS.length);
    expect(fits.map((plan) => plan.title)).toEqual(FITS.map((service) => service.name));
    expect(fits.map((plan) => plan.duration)).toEqual(
      FITS.map((service) => `{{duur:${service.slug}}}`),
    );
    expect(fits.map((plan) => plan.priceLabel)).toEqual(
      FITS.map((service) => `{{prijs:bikefit-huidige-fiets:${audienceOf.get(service.slug)}}}`),
    );
    expect(fits.every((plan) => plan.priceCents === null)).toBe(true);
    expect(isPlaceholder).toBe(true);
  });
});
