import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { BookingWidget } from './booking-widget';
import type {
  BookingProviderOption,
  BookingServiceOption,
  BookingWidgetProps,
  BookingWidgetRules,
} from './types';

/**
 * The widget's first paint per provider setup (27 Oct 2026, Toshoni): rendered
 * on the server with `react-dom/server`, no browser, so it checks that the
 * rule of `provider-choice.ts` is wired in. "Bij wie?" is asked only when
 * there is something to choose; with one provider for the service the visitor
 * lands on the service or, when it is preselected, on the day and time.
 * A first render never calls a server action; they are mocked so the
 * server-only booking code stays out of the test.
 */
vi.mock('@/lib/booking/public-actions', () => ({
  bookAction: vi.fn(),
  availabilityAction: vi.fn(),
}));

function service(id: string, name: string): BookingServiceOption {
  return {
    id,
    slug: id,
    name,
    choiceLabel: '',
    description: '',
    durationMinutes: 60,
    requiresGuardian: false,
    location: null,
    priceLabel: '',
    priceCents: null,
    addons: [],
  };
}

function provider(id: string, serviceIds: string[]): BookingProviderOption {
  return {
    id,
    name: id,
    services: serviceIds.map((serviceId) => ({ serviceId, location: null })),
    locations: [],
  };
}

const adult = service('adult', 'Volwassenenfit');
const youth = service('youth', 'Jeugdfit');
const rutger = provider('Rutger', ['adult', 'youth']);
const sam = provider('Sam', ['adult']);

const RULES: BookingWidgetRules = {
  timezone: 'Europe/Brussels',
  horizonDays: 56,
  cancelUntilHours: 48,
  showProviderChoice: true,
};

/** The steps in page order, the open one and their numbers, read from the markup. */
function firstPaint(partial: Partial<BookingWidgetProps>) {
  const html = renderToString(
    createElement(BookingWidget, {
      services: [adult, youth],
      locations: [],
      providers: [rutger, sam],
      rules: RULES,
      copy: { successTitle: '', successText: '', phoneLabel: '', phoneHref: '' },
      todayYmd: '2026-10-27',
      ...partial,
    }),
  );
  return {
    html,
    steps: [...html.matchAll(/data-step-heading="(\w+)"/g)].map((match) => match[1]),
    open: /data-state="active">[\s\S]*?data-step-heading="(\w+)"/.exec(html)?.[1] ?? null,
    numbers: [...html.matchAll(/studio-booking__step-num" aria-hidden="true">(\d+)</g)].map(
      (match) => match[1],
    ),
  };
}

describe('the booking widget with one provider', () => {
  it('starts at the service: no "Bij wie?", the numbering starts at 01', () => {
    const paint = firstPaint({ providers: [rutger] });
    expect(paint.steps).toEqual(['service', 'when', 'details']);
    expect(paint.open).toBe('service');
    expect(paint.numbers).toEqual(['01', '02', '03']);
    expect(paint.html).not.toContain('Bij wie?');
  });

  it('goes from a preselected service straight to the day and time', () => {
    const paint = firstPaint({ providers: [rutger], initialServiceId: 'youth' });
    expect(paint.steps).toEqual(['service', 'when', 'details']);
    expect(paint.open).toBe('when');
  });
});

describe('the booking widget with several providers', () => {
  it('asks who first when nothing is preselected', () => {
    const paint = firstPaint({});
    expect(paint.steps).toEqual(['provider', 'service', 'when', 'details']);
    expect(paint.open).toBe('provider');
    expect(paint.numbers).toEqual(['01', '02', '03', '04']);
    expect(paint.html).toContain('Bij wie?');
    expect(paint.html).toContain('Iedereen');
    expect(paint.html).toContain('Rutger');
    expect(paint.html).toContain('Sam');
  });

  it('still asks for a preselected service that several of them offer', () => {
    const paint = firstPaint({ initialServiceId: 'adult' });
    expect(paint.steps).toEqual(['provider', 'service', 'when', 'details']);
    expect(paint.open).toBe('provider');
  });

  it('does not ask for a preselected service that only one of them offers', () => {
    const paint = firstPaint({ initialServiceId: 'youth' });
    expect(paint.steps).toEqual(['service', 'when', 'details']);
    expect(paint.open).toBe('when');
    expect(paint.html).not.toContain('Bij wie?');
  });

  it('never asks when the choice is switched off', () => {
    const paint = firstPaint({
      initialServiceId: 'adult',
      rules: { ...RULES, showProviderChoice: false },
    });
    expect(paint.steps).toEqual(['service', 'when', 'details']);
    expect(paint.open).toBe('when');
  });
});
