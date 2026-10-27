import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { EMPTY_OFFERING_CONTENT } from '@/lib/offers/offering-content';
import { OfferingForm, type OfferingFormValues } from './offering-form';

/**
 * The offering form rendered to HTML (server render, no browser): the free-text
 * Kostprijs next to the free-text Duur for an offering that is asked for
 * (27 Oct 2026), and the variant choice that names the three audiences. The
 * server actions are replaced: only the markup is under test.
 */

vi.mock('@/lib/cms/actions/offerings', () => ({
  saveOfferingAction: vi.fn(),
  deleteOfferingAction: vi.fn(),
}));

const PRICE_TEXT = 'Gratis binnen 6 maanden na je fit, daarna € 75';

function render(overrides: Partial<OfferingFormValues> = {}): string {
  const offering: OfferingFormValues = {
    id: 'off-1',
    content: { ...EMPTY_OFFERING_CONTENT, slug: 'bikefit-tweede-bezoek', priceText: PRICE_TEXT },
    isListed: true,
    bookingMode: 'enquiry',
    variantMode: 'single',
    variants: [],
    isAddon: false,
    soldAlone: true,
    addonMinutes: null,
    addonIds: [],
    addonOptions: [],
    ...overrides,
  };
  return renderToStaticMarkup(
    createElement(OfferingForm, {
      offering,
      locations: [],
      media: [],
      defaultBuffer: 15,
      addonCandidates: [],
    }),
  );
}

/** The `<input …>` with this name, as markup; '' when there is none. */
function input(html: string, name: string): string {
  return new RegExp(`<input[^>]*name="${name}"[^>]*>`).exec(html)?.[0] ?? '';
}

describe('OfferingForm: Prijs (tekst)', () => {
  it('is a labelled field under Duur (tekst) for an offering that is asked for, with its hint and limit', () => {
    const html = render();
    expect(html).toContain('Prijs (tekst)');
    expect(html.indexOf('Duur (tekst)')).toBeGreaterThan(-1);
    expect(html.indexOf('Prijs (tekst)')).toBeGreaterThan(html.indexOf('Duur (tekst)'));
    expect(html).toContain(
      'Vrije tekst voor aanbod op aanvraag, bv. “Gratis binnen 6 maanden na je fit, daarna € 75”. Leeg = de prijs van de varianten.',
    );
    const field = input(html, 'priceText');
    expect(field).not.toContain('type="hidden"');
    expect(field).toContain(`value="${PRICE_TEXT}"`);
    expect(field).toContain('maxLength="120"');
  });

  it('is kept as a hidden value for an offering that is booked online, so saving does not wipe it', () => {
    const html = render({ bookingMode: 'direct' });
    expect(html).not.toContain('Prijs (tekst)');
    const field = input(html, 'priceText');
    expect(field).toContain('type="hidden"');
    expect(field).toContain(`value="${PRICE_TEXT}"`);
    // The same rule as the free-text Duur next to it.
    expect(input(html, 'duration')).toContain('type="hidden"');
  });
});

describe('OfferingForm: copy tokens', () => {
  it('lists the variables a text may use, collapsed, above the text fields', () => {
    const html = render();
    expect(html).toContain('Variabelen in teksten');
    expect(html).toContain('{{telefoon}}');
    expect(html).toContain('{{prijs:&lt;aanbod&gt;:&lt;voor wie&gt;}}');
    expect(html).toContain('<details');
    expect(html.indexOf('Variabelen in teksten')).toBeLessThan(html.indexOf('Korte omschrijving'));
  });

  it('shows the variable of each choice of an extra and carries its key through a save', () => {
    const html = render({
      isAddon: true,
      addonOptions: [
        { key: 'zelfde-type', label: 'Zelfde type fiets', minutes: 30, priceCents: 7500 },
      ],
    });
    expect(html).toContain('Variabele voor teksten: {{extra:bikefit-tweede-bezoek:zelfde-type}}');
    expect(input(html, 'addonOptionKey:0')).toContain('type="hidden"');
    expect(input(html, 'addonOptionKey:0')).toContain('value="zelfde-type"');
    // A row without a choice has no key yet.
    expect(input(html, 'addonOptionKey:1')).toContain('value=""');
  });
});

describe('OfferingForm: the variants', () => {
  it('the audience choice names the three variants it creates', () => {
    const html = render();
    expect(html).toContain('Volwassene en Jeugd apart');
    expect(html).toContain(
      'Per variant (Volwassene, Jeugd – eenmalig, Jeugd – volledig pakket) een eigen duur, ouderregel en prijs.',
    );
  });

  it('an offering split by audience shows the card with the three variants', () => {
    const html = render({ variantMode: 'audience' });
    for (const label of ['Volwassene', 'Jeugd – eenmalig', 'Jeugd – volledig pakket']) {
      expect(html).toContain(`>${label}</legend>`);
    }
    expect(input(html, 'price:youth-package')).not.toBe('');
  });
});
