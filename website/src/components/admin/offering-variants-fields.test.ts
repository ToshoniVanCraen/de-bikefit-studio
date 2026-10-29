import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { LocationOption } from './booking-labels';
import { OfferingVariantsFields, type OfferingFormVariant } from './offering-variants-fields';

/**
 * The "Varianten" card of Beheer → Aanbod rendered to HTML (server render, no
 * browser): two fieldsets for an offering split by audience, labelled the way
 * the website prints them, without a guardian rule (29 Oct 2026).
 */

const LOCATIONS: LocationOption[] = [];

function render(props: {
  variantMode: 'single' | 'audience';
  bookingMode: 'direct' | 'enquiry';
  variants?: OfferingFormVariant[];
}): string {
  return renderToStaticMarkup(
    createElement(OfferingVariantsFields, {
      variantMode: props.variantMode,
      bookingMode: props.bookingMode,
      variants: props.variants ?? [],
      locations: LOCATIONS,
      defaultBuffer: 15,
    }),
  );
}

/** The `<fieldset>`s of the card, each as its own HTML string. */
function fieldsets(html: string): string[] {
  return html.split('<fieldset').slice(1);
}

describe('OfferingVariantsFields', () => {
  it('shows one fieldset per variant, named like the website: Volwassene, Jeugd – eenmalig', () => {
    const html = render({ variantMode: 'audience', bookingMode: 'direct' });
    const legends = fieldsets(html).map((set) => /<legend[^>]*>([^<]*)<\/legend>/.exec(set)?.[1]);
    expect(legends).toEqual(['Volwassene', 'Jeugd – eenmalig']);
    expect(html).toContain('Varianten');
    for (const audience of ['adult', 'youth']) {
      for (const field of ['serviceId', 'duration', 'buffer', 'location', 'price']) {
        expect(html, `${field}:${audience}`).toContain(`name="${field}:${audience}"`);
      }
    }
  });

  it('asks for no parent or guardian, for no variant (29 Oct 2026)', () => {
    const html = render({ variantMode: 'audience', bookingMode: 'direct' });
    expect(html).not.toContain('name="guardian:');
    expect(html).not.toMatch(/ouder|voogd|volledig pakket/i);
  });

  it('keeps what is stored: the service and the price', () => {
    const variants: OfferingFormVariant[] = [
      {
        audience: 'youth',
        serviceId: 'svc-jeugd',
        priceCents: 15000,
        durationMinutes: 120,
        bufferAfterMinutes: null,
        locationId: null,
        providerNames: ['Toshoni'],
      },
    ];
    const [, youth] = fieldsets(
      render({ variantMode: 'audience', bookingMode: 'direct', variants }),
    );
    expect(youth).toContain('value="svc-jeugd"');
    expect(youth).toContain('value="150"');
    expect(youth).toContain('value="120"');
    expect(youth).toContain('Aangeboden door Toshoni.');
  });

  it('a single option has one fieldset for "Het aanbod" and no Jeugd fields', () => {
    const html = render({ variantMode: 'single', bookingMode: 'enquiry' });
    expect(fieldsets(html)).toHaveLength(1);
    expect(html).toContain('Het aanbod');
    expect(html).toContain('name="price:all"');
    expect(html).not.toContain(':youth');
  });
});
