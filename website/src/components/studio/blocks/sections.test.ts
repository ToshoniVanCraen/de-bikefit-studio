import { createElement, type ComponentType } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { defaultDataFor, validateBlock, type BlockTypeData } from '@/lib/cms/blocks';
import { emptyCopyTokenLookup, resolveCopyTokens } from '@/lib/studio/copy-tokens';
import { LEGAL_IDENTITY } from '@/lib/studio/legal';
import { AudienceBlock } from './audience';
import { ChooserBlock } from './chooser';
import { CtaBlock } from './cta';
import { FaqBlock } from './faq';
import { TeamBlock } from './team';
import { WelcomeBlock } from './welcome';

/**
 * Server renders of the section blocks that need no picture from the media library (a picture is
 * an async server component that reads the database; these tests keep to markup, ids, classes
 * and headings). `BlockRenderer` resolves the copy tokens before a block renders; the helper
 * does the same with the engine.
 */

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

type Props<K extends keyof BlockTypeData> = {
  data: BlockTypeData[K];
  anchor?: string;
  headingLevel: 1 | 2;
  locale: 'nl';
  page: { slug: string; requestedService: null };
};

function html<K extends keyof BlockTypeData>(
  type: K,
  Block: ComponentType<Props<K>>,
  data: unknown,
  extra: { anchor?: string; headingLevel?: 1 | 2 } = {},
): string {
  const checked = validateBlock(type, data);
  if (!checked.ok) throw new Error(checked.message);
  const resolved = resolveCopyTokens(checked.data, LOOKUP) as BlockTypeData[K];
  return renderToStaticMarkup(
    createElement(Block, {
      data: resolved,
      anchor: extra.anchor,
      headingLevel: extra.headingLevel ?? 2,
      locale: 'nl',
      page: { slug: '', requestedService: null },
    }),
  );
}

describe('chooser', () => {
  it('makes every card one link, the phone card a tel: link with the number in its label', () => {
    const markup = html('chooser', ChooserBlock, defaultDataFor('chooser'), {
      anchor: 'keuzehulp',
    });
    expect(markup).toContain('id="keuzehulp"');
    expect(markup.match(/<a /g)).toHaveLength(4);
    expect(markup).toContain('href="/aanbod/zadelanalyse"');
    expect(markup).toMatch(
      /<a [^>]*href="tel:\+\d+"[^>]*class="studio-choice studio-choice--featured"|<a [^>]*class="studio-choice studio-choice--featured"[^>]*href="tel:\+\d+"/,
    );
    expect(markup).toMatch(/Bel \+\d[\d ]+/);
    expect(markup).not.toContain('{{');
  });

  it('puts the gray variant on the section and one h2 for the title, h3 for the cards', () => {
    const data = { ...(defaultDataFor('chooser') as object), variant: 'gray' };
    const markup = html('chooser', ChooserBlock, data);
    expect(markup).toContain('studio-section--gray');
    expect(markup.match(/<h2/g)).toHaveLength(1);
    expect(markup.match(/<h3/g)).toHaveLength(4);
  });
});

describe('welcome', () => {
  it('renders the two title lines, the buttons and one row per point', () => {
    const markup = html('welcome', WelcomeBlock, defaultDataFor('welcome'), { anchor: 'welkom' });
    expect(markup).toContain('id="welkom"');
    expect(markup).toContain('<em>Je bent 100% welkom.</em>');
    expect(markup.match(/studio-welcome__item"/g)).toHaveLength(4);
    expect(markup).toContain('href="/aanbod#keuzehulp"');
    expect(markup).toContain('href="/veelgestelde-vragen#beginners"');
  });
});

describe('faq', () => {
  const grouped = {
    collapsible: true,
    openFirst: true,
    items: [
      { question: 'Eerste?', answer: 'Ja.', group: 'Nieuw op de fiets?', groupAnchor: 'beginners' },
      { question: 'Tweede?', answer: 'Ja.', group: 'Nieuw op de fiets?', groupAnchor: '' },
      { question: 'Derde?', answer: 'Ja.', group: 'Over de bikefit', groupAnchor: '' },
    ],
  };

  it('puts consecutive groups under one heading each, with the anchor "beginners"', () => {
    const markup = html('faq', FaqBlock, grouped);
    expect(markup).toContain(
      '<h2 class="studio-faq__group" id="beginners">Nieuw op de fiets?</h2>',
    );
    expect(markup).toContain('id="over-de-bikefit"');
    expect(markup.match(/studio-faq__group/g)).toHaveLength(2);
    // Section without a title: the group is an h2, the questions h3.
    expect(markup.match(/<h3 class="studio-faq__q"/g)).toHaveLength(3);
  });

  it('opens the first question only', () => {
    const markup = html('faq', FaqBlock, grouped);
    expect(markup.match(/<details/g)).toHaveLength(3);
    expect(markup.match(/<details[^>]* open/g)).toHaveLength(1);
    expect(markup.indexOf('open')).toBeLessThan(markup.indexOf('Tweede?'));
  });

  it('renders old flat data without a group heading', () => {
    const markup = html('faq', FaqBlock, {
      title: 'Veelgestelde vragen',
      items: [{ question: 'Vraag?', answer: 'Antwoord.' }],
    });
    expect(markup).not.toContain('studio-faq__group');
    expect(markup).toContain('<h3 class="studio-faq__q">Vraag?</h3>');
    expect(markup).not.toContain('<details');
  });

  it('moves the group heading and the questions one level down under a section title', () => {
    const markup = html('faq', FaqBlock, { ...grouped, title: 'Vragen' });
    expect(markup).toContain('<h3 class="studio-faq__group"');
    expect(markup.match(/<h4 class="studio-faq__q"/g)).toHaveLength(3);
  });
});

describe('audience', () => {
  it('renders plain tiles for old data: the number apart from the heading', () => {
    const markup = html('audience', AudienceBlock, defaultDataFor('audience'));
    expect(markup).toContain('studio-tile');
    expect(markup).not.toContain('studio-photo-tile');
    expect(markup).toContain('<small class="studio-tile__num">01</small>');
    expect(markup).toContain('studio-tiles--cols-3');
    expect(markup.match(/<h3 class="studio-tile__title"/g)).toHaveLength(5);
  });

  it('uses as many columns as there are tiles, up to four', () => {
    const items = (n: number) => Array.from({ length: n }, (_, i) => ({ title: `T${i}` }));
    expect(html('audience', AudienceBlock, { items: items(4) })).toContain('studio-tiles--cols-4');
    expect(html('audience', AudienceBlock, { items: items(2) })).toContain('studio-tiles--cols-2');
  });
});

describe('cta', () => {
  it('is compact without a body, regular with one, and honours an explicit size', () => {
    const base = { title: 'Comfort is een keuze. Maak ze.' };
    expect(html('cta', CtaBlock, base)).toContain('studio-callout--compact');
    expect(html('cta', CtaBlock, { ...base, body: 'Tekst.' })).not.toContain(
      'studio-callout--compact',
    );
    expect(html('cta', CtaBlock, { ...base, body: 'Tekst.', size: 'compact' })).toContain(
      'studio-callout--compact',
    );
    expect(html('cta', CtaBlock, { ...base, size: 'regular' })).not.toContain(
      'studio-callout--compact',
    );
  });

  it('maps gray to the cream band with the primary and ghost buttons, the rest to the wine band', () => {
    const base = {
      title: 'Titel',
      primaryCta: { label: 'Afspraak maken →', href: '/afspraak' },
      secondaryCta: { label: '{{telefoon}}', href: '{{telefoon-href}}' },
    };
    const gray = html('cta', CtaBlock, { ...base, variant: 'gray' });
    expect(gray).toContain('studio-callout--gray');
    expect(gray).toContain('studio-btn--primary');
    expect(gray).toContain('studio-btn--ghost"');

    for (const variant of ['accent', 'dark']) {
      const wine = html('cta', CtaBlock, { ...base, variant });
      expect(wine, variant).not.toContain('studio-callout--gray');
      expect(wine, variant).toContain('studio-btn--light');
      expect(wine, variant).toContain('studio-btn--outline-light');
      expect(wine, variant).toMatch(/href="tel:\+\d+"/);
    }
  });

  it('draws no photo without an image, whatever the variant', () => {
    expect(html('cta', CtaBlock, { title: 'T' })).not.toContain('studio-callout--photo');
  });
});

describe('team', () => {
  const members = [
    { name: 'Rutger Roelandts', role: 'Oprichter', bio: ['Een.', 'Twee.'] },
    { name: 'Tweede Persoon', role: '', bio: [] },
  ];
  const cta = { label: 'Afspraak maken →', href: '/afspraak', external: false };

  it('puts the button of a single profile under its bio, with the initials as portrait', () => {
    const markup = html('team', TeamBlock, { members: [members[0]], cta });
    expect(markup).toContain('studio-founder__initials');
    expect(markup).toContain('<h2 class="studio-founder__name">Rutger Roelandts</h2>');
    expect(markup.match(/studio-founder__bio/g)).toHaveLength(2);
    expect(markup.match(/href="\/afspraak"/g)).toHaveLength(1);
    expect(markup.indexOf('studio-founder__actions')).toBeGreaterThan(markup.indexOf('Twee.'));
    expect(markup).not.toContain('studio-founder--flip');
  });

  it('repeats the rows for several members, flips every second one and puts the button once below', () => {
    const markup = html('team', TeamBlock, { members, cta });
    expect(markup.match(/<li class="studio-founder/g)).toHaveLength(2);
    expect(markup.match(/studio-founder--flip/g)).toHaveLength(1);
    expect(markup.match(/href="\/afspraak"/g)).toHaveLength(1);
    expect(markup).toContain('studio-founders__actions');
  });

  it('renders no button without a cta, and never the internal note', () => {
    const markup = html('team', TeamBlock, {
      members: [{ ...members[0], internalNote: 'nog op te vragen' }],
    });
    expect(markup).not.toContain('studio-founder__actions');
    expect(markup).not.toContain('nog op te vragen');
  });

  it('keeps the person name an h3 under a section title', () => {
    const markup = html('team', TeamBlock, { title: 'Ons team', members: [members[0]] });
    expect(markup).toContain('<h3 class="studio-founder__name">');
  });
});
