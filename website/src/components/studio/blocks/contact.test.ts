import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { validateBlock } from '@/lib/cms/blocks';
import { emptyCopyTokenLookup, resolveCopyTokens } from '@/lib/studio/copy-tokens';
import { ContactBlock } from './contact';

/**
 * The `contact` block with copy tokens in its data (27 Oct 2026) and its map.
 * `BlockRenderer` resolves every string of the block before this component
 * runs; the test does the same with the engine and renders the result to HTML
 * (server render, no browser).
 */

const lookup = emptyCopyTokenLookup();
const FACTS = {
  ...lookup,
  facts: {
    ...lookup.facts,
    telefoon: '+32 473 95 26 33',
    'telefoon-href': 'tel:+32473952633',
    'e-mail': 'info@debikefitstudio.be',
    adres: 'Halsesteenweg 406 a, 9403 Neigem',
  },
};

const TOKENS = {
  title: 'Contact',
  phoneLabel: '{{telefoon}}',
  phoneHref: '{{telefoon-href}}',
  email: '{{e-mail}}',
  addressLines: ['{{adres}}'],
  hours: 'Op afspraak',
};

function render(data: Record<string, unknown>, resolveWith = FACTS): string {
  const checked = validateBlock('contact', data);
  if (!checked.ok) throw new Error(checked.message);
  const resolved = resolveCopyTokens(checked.data, resolveWith) as Parameters<
    typeof ContactBlock
  >[0]['data'];
  return renderToStaticMarkup(
    createElement(ContactBlock, {
      data: resolved,
      headingLevel: 2,
      locale: 'nl',
      page: { slug: 'contact', requestedService: null },
    }),
  );
}

describe('ContactBlock: tokens in its data', () => {
  it('prints the phone as a link, the e-mail as a link and the address on one line', () => {
    const html = render(TOKENS);
    expect(html).toContain('<a href="tel:+32473952633">+32 473 95 26 33</a>');
    expect(html).toContain('<a href="mailto:info@debikefitstudio.be">info@debikefitstudio.be</a>');
    expect(html).toContain('Halsesteenweg 406 a, 9403 Neigem');
    expect(html).not.toContain('{{');
  });

  it('a token whose setting is empty makes its row disappear, like an empty field', () => {
    const html = render(TOKENS, emptyCopyTokenLookup());
    expect(html).not.toContain('Telefoon');
    expect(html).not.toContain('mailto:');
    expect(html).not.toContain('Waar');
    expect(html).toContain('Op afspraak');
    expect(html).not.toContain('{{');
  });
});

describe('ContactBlock: the map', () => {
  const EMBED = 'https://www.google.com/maps?q=Halsesteenweg&output=embed';

  it('is the two-click map: a notice and a button, no Google frame in the page', () => {
    const html = render({ ...TOKENS, mapEmbedUrl: EMBED });
    expect(html).not.toContain('<iframe');
    expect(html).not.toContain('google.com');
    expect(html).toContain('Deze kaart komt van Google Maps');
    expect(html).toContain('Kaart tonen');
    expect(html).toContain('href="/privacy"');
  });

  it('has no map at all while mapEmbedUrl is empty', () => {
    const html = render(TOKENS);
    expect(html).not.toContain('Kaart tonen');
  });
});
