import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { LocationOption } from './booking-labels';
import { OfferingVariantsFields, type OfferingFormVariant } from './offering-variants-fields';

/**
 * The "Varianten" card of Beheer → Aanbod rendered to HTML (server render, no
 * browser): three fieldsets for an offering split by audience, labelled the way
 * the website prints them, a parent or guardian required by default for both
 * Jeugd variants (27 Oct 2026).
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
  it('shows one fieldset per variant, named like the website: Volwassene, Jeugd – eenmalig, Jeugd – volledig pakket', () => {
    const html = render({ variantMode: 'audience', bookingMode: 'direct' });
    const legends = fieldsets(html).map((set) => /<legend[^>]*>([^<]*)<\/legend>/.exec(set)?.[1]);
    expect(legends).toEqual(['Volwassene', 'Jeugd – eenmalig', 'Jeugd – volledig pakket']);
    expect(html).toContain('Varianten');
    for (const audience of ['adult', 'youth', 'youth-package']) {
      for (const field of ['serviceId', 'duration', 'buffer', 'location', 'price', 'guardian']) {
        expect(html, `${field}:${audience}`).toContain(`name="${field}:${audience}"`);
      }
    }
  });

  it('requires a parent or guardian by default for both Jeugd variants, not for Volwassene', () => {
    const [adult, youth, youthPackage] = fieldsets(
      render({ variantMode: 'audience', bookingMode: 'direct' }),
    );
    const checked = (set: string) =>
      /<input[^>]*name="guardian:[a-z-]+"[^>]*>/.exec(set)?.[0] ?? '';
    expect(checked(adult)).not.toContain('checked');
    expect(checked(youth)).toContain('checked');
    expect(checked(youthPackage)).toContain('checked');
  });

  it('keeps what is stored: the service, the price and an unticked guardian rule', () => {
    const variants: OfferingFormVariant[] = [
      {
        audience: 'youth-package',
        serviceId: 'svc-pakket',
        priceCents: 27500,
        durationMinutes: 120,
        bufferAfterMinutes: null,
        locationId: null,
        requiresGuardian: false,
        providerNames: ['Toshoni'],
      },
    ];
    const [, , youthPackage] = fieldsets(
      render({ variantMode: 'audience', bookingMode: 'direct', variants }),
    );
    expect(youthPackage).toContain('value="svc-pakket"');
    expect(youthPackage).toContain('value="275"');
    expect(youthPackage).toContain('value="120"');
    expect(youthPackage).toContain('Aangeboden door Toshoni.');
    expect(/<input[^>]*name="guardian:youth-package"[^>]*>/.exec(youthPackage)?.[0]).not.toContain(
      'checked',
    );
  });

  it('a single option has one fieldset for "Het aanbod" and no Jeugd fields', () => {
    const html = render({ variantMode: 'single', bookingMode: 'enquiry' });
    expect(fieldsets(html)).toHaveLength(1);
    expect(html).toContain('Het aanbod');
    expect(html).toContain('name="price:all"');
    expect(html).not.toContain(':youth');
  });
});
