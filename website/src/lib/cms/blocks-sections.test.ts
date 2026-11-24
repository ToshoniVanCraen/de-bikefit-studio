import { describe, expect, it } from 'vitest';
import { emptyCopyTokenLookup, resolveCopyTokens } from '@/lib/studio/copy-tokens';
import { LEGAL_IDENTITY } from '@/lib/studio/legal';

/** The lookup the site builds, with the phone facts the settings hold (the empty lookup has none). */
const LOOKUP = (() => {
  const empty = emptyCopyTokenLookup();
  return {
    ...empty,
    facts: {
      ...empty.facts,
      telefoon: LEGAL_IDENTITY.phoneLabel,
      'telefoon-href': LEGAL_IDENTITY.phoneHref,
    },
  };
})();
import { sectionAnchors } from '@/lib/studio/blocks';
import { blockRegistry, defaultDataFor, validateBlock, type BlockInstance } from './blocks';

/**
 * The section blocks of the redesign (24 Nov 2026): their defaults, their limits and the promise
 * that data stored before the extensions (flat FAQ items, audience items, a cta, a team block)
 * stays valid.
 */

function parse(type: string, data: unknown) {
  const result = validateBlock(type, data);
  if (!result.ok) throw new Error(result.message);
  return result.data as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
}

describe('welcome', () => {
  it('starts from valid data with two lines of title and four points', () => {
    const data = parse('welcome', defaultDataFor('welcome'));
    expect(data.titleEmphasis).toBeTruthy();
    expect(data.items).toHaveLength(4);
  });

  it('wants 2 to 6 points', () => {
    const base = defaultDataFor('welcome') as { items: Array<{ title: string; body: string }> };
    const point = { title: 'Punt', body: '' };
    expect(validateBlock('welcome', { ...base, items: [point] }).ok).toBe(false);
    expect(validateBlock('welcome', { ...base, items: [point, point] }).ok).toBe(true);
    expect(validateBlock('welcome', { ...base, items: Array(6).fill(point) }).ok).toBe(true);
    expect(validateBlock('welcome', { ...base, items: Array(7).fill(point) }).ok).toBe(false);
  });
});

describe('chooser', () => {
  const choices = (n: number) =>
    Array.from({ length: n }, (_, i) => ({ title: `Kaart ${i}`, href: '/aanbod' }));

  it('wants 2 to 4 cards and a link on each', () => {
    expect(validateBlock('chooser', { choices: choices(1) }).ok).toBe(false);
    expect(validateBlock('chooser', { choices: choices(2) }).ok).toBe(true);
    expect(validateBlock('chooser', { choices: choices(4) }).ok).toBe(true);
    expect(validateBlock('chooser', { choices: choices(5) }).ok).toBe(false);
    expect(validateBlock('chooser', { choices: [{ title: 'a' }, { title: 'b' }] }).ok).toBe(false);
  });

  it('knows a default and a gray variant only', () => {
    expect(validateBlock('chooser', { variant: 'gray', choices: choices(2) }).ok).toBe(true);
    expect(validateBlock('chooser', { variant: 'dark', choices: choices(2) }).ok).toBe(false);
  });

  it('has the phone link and label as copy tokens, which resolve in href and linkLabel alike', () => {
    const data = parse('chooser', defaultDataFor('chooser'));
    const call = data.choices.find((choice: { featured: boolean }) => choice.featured);
    expect(call.href).toBe('{{telefoon-href}}');
    expect(call.linkLabel).toContain('{{telefoon}}');

    // `BlockRenderer` runs this engine over every string of the block.
    const resolved = resolveCopyTokens(data, LOOKUP);
    const resolvedCall = resolved.choices.find((choice: { featured: boolean }) => choice.featured);
    expect(resolvedCall.href).toBe(LEGAL_IDENTITY.phoneHref);
    expect(resolvedCall.href.startsWith('tel:')).toBe(true);
    expect(resolvedCall.linkLabel).toContain(LEGAL_IDENTITY.phoneLabel);
    expect(JSON.stringify(resolved)).not.toContain('{{');
  });

  it('links the other cards to offer pages', () => {
    const data = parse('chooser', defaultDataFor('chooser'));
    const hrefs = data.choices.map((choice: { href: string }) => choice.href);
    expect(hrefs.filter((href: string) => href.startsWith('/aanbod/'))).toHaveLength(3);
  });
});

describe('photoStrip', () => {
  const image = { image: {}, caption: '', focus: '' };

  it('starts as a strip of three captioned photos', () => {
    const data = parse('photoStrip', defaultDataFor('photoStrip'));
    expect(data.layout).toBe('strip');
    expect(data.images.map((entry: { caption: string }) => entry.caption)).toEqual([
      'Samen bergop',
      'Pauze in Ronse',
      'Even sleutelen',
    ]);
  });

  it('knows the three layouts and nothing else', () => {
    for (const layout of ['strip', 'gallery', 'wide']) {
      expect(validateBlock('photoStrip', { layout, images: [image] }).ok, layout).toBe(true);
    }
    expect(validateBlock('photoStrip', { layout: 'carousel', images: [image] }).ok).toBe(false);
  });

  it('wants 1 to 6 photos', () => {
    expect(validateBlock('photoStrip', { images: [] }).ok).toBe(false);
    expect(validateBlock('photoStrip', { images: Array(6).fill(image) }).ok).toBe(true);
    expect(validateBlock('photoStrip', { images: Array(7).fill(image) }).ok).toBe(false);
  });

  it('accepts a focus of two percentages and rejects anything that is not', () => {
    const withFocus = (focus: string) =>
      validateBlock('photoStrip', { images: [{ ...image, focus }] });
    expect(withFocus('50% 55%').ok).toBe(true);
    expect(withFocus('').ok).toBe(true);
    expect(withFocus('center').ok).toBe(false);
    expect(withFocus('50% 55%; background: red').ok).toBe(false);
  });
});

describe('data stored before the extensions stays valid', () => {
  it('a flat faq: no groups, nothing open', () => {
    const data = parse('faq', {
      variant: 'default',
      collapsible: true,
      items: [{ question: 'Vraag?', answer: 'Antwoord.' }],
    });
    expect(data.openFirst).toBe(false);
    expect(data.items[0]).toMatchObject({ group: '', groupAnchor: '' });
  });

  it('an audience item without an image', () => {
    const data = parse('audience', {
      items: [{ title: 'Jonge fietsers', body: 'Tekst', featured: true }],
    });
    expect(data.items[0].image).toEqual({ mediaId: null, url: null, alt: '', decorative: false });
  });

  it('a cta without image or size: still every variant, compact by itself without a body', () => {
    for (const variant of ['accent', 'dark', 'gray']) {
      const data = parse('cta', { variant, title: 'Comfort is een keuze. Maak ze.' });
      expect(data.size).toBe('auto');
      expect(data.image.url).toBeNull();
    }
  });

  it('a team block without a cta', () => {
    const data = parse('team', { members: [{ name: 'Rutger' }] });
    expect(data.cta).toBeNull();
  });
});

describe('faq groups', () => {
  const item = (group: string, groupAnchor = '') => ({
    question: 'V?',
    answer: 'A.',
    group,
    groupAnchor,
  });

  it('takes a group with the anchor "beginners"', () => {
    expect(validateBlock('faq', { items: [item('Nieuw op de fiets?', 'beginners')] }).ok).toBe(
      true,
    );
  });

  it('only takes an anchor that is safe as an id', () => {
    for (const bad of ['Beginners', 'met spatie', 'x"y', '-a', 'a-', '#beginners']) {
      expect(validateBlock('faq', { items: [item('G', bad)] }).ok, bad).toBe(false);
    }
  });
});

describe('anchors', () => {
  const block = (id: string, type: string) => ({ id, type, data: {} }) as unknown as BlockInstance;

  it('gives the chooser #keuzehulp (other pages link to it) and the welcome band #welkom', () => {
    const anchors = sectionAnchors([
      block('a', 'welcome'),
      block('b', 'chooser'),
      block('c', 'photoStrip'),
    ]);
    expect(anchors.get('a')).toBe('welkom');
    expect(anchors.get('b')).toBe('keuzehulp');
    expect(anchors.get('c')).toBe('fotos');
  });

  it('numbers a second chooser, so ids stay unique', () => {
    const anchors = sectionAnchors([block('a', 'chooser'), block('b', 'chooser')]);
    expect(anchors.get('b')).toBe('keuzehulp-2');
  });
});

describe('registry', () => {
  it('lists the new blocks with a Dutch label and description', () => {
    for (const type of ['welcome', 'chooser', 'photoStrip'] as const) {
      expect(blockRegistry[type].label).toBeTruthy();
      expect(blockRegistry[type].description).toMatch(/\S/);
    }
  });
});
