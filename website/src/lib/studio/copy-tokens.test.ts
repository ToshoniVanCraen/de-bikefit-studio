import { describe, expect, it } from 'vitest';
import {
  copyTokenSlugs,
  DURATION_TOKEN_FALLBACK,
  durationToken,
  emptyCopyTokenLookup,
  EXTRA_TOKEN_FALLBACK,
  extraChoiceKey,
  extraToken,
  FACT_TOKENS,
  factToken,
  hasCopyTokens,
  parseCopyToken,
  PRICE_TOKEN_FALLBACK,
  priceLineSlugs,
  priceToken,
  resolveCopyTokens,
  resolveCopyTokensInText,
  variantPriceKey,
  type CopyTokenLookup,
  type FactToken,
} from './copy-tokens';

const FACTS: Record<FactToken, string> = {
  telefoon: '+32 473 95 26 33',
  'telefoon-href': 'tel:+32473952633',
  'e-mail': 'info@debikefitstudio.be',
  adres: 'Halsesteenweg 406 a, 9403 Neigem',
  'adres-studio': 'Halsesteenweg 406 a, 9403 Neigem',
  bedrijf: 'Qarakter BV',
  zetel: 'Weversstraat 7, 1730 Asse',
  kbo: 'BE 1036.912.281',
  btw: 'BE 1036.912.281',
  'opvolging:volwassene': 'zes maanden',
  'tweede-bezoek-gratis': 'zes maanden',
  'cadeaubon-geldigheid': 'een jaar',
};

const lookup: CopyTokenLookup = {
  durationBySlug: new Map([
    ['volwassenenfit', '2 uur'],
    ['jeugdfit', '1 u 30 min'],
  ]),
  priceLineBySlug: new Map([
    ['bikefit-huidige-fiets', 'Volwassene € 275,00 · Jeugd – eenmalig € 150,00'],
    ['zadelanalyse', '€ 60,00'],
  ]),
  priceByVariant: new Map([
    [variantPriceKey('bikefit-huidige-fiets', 'adult'), '€ 275'],
    [variantPriceKey('bikefit-huidige-fiets', 'youth'), '€ 150'],
    [variantPriceKey('zadelanalyse', 'all'), '€ 60'],
  ]),
  extraBySlug: new Map([['voetanalyse', '€ 85 en 30 minuten extra']]),
  extraChoiceByKey: new Map([
    [extraChoiceKey('bikefit-tweede-fiets', 'zelfde-type'), '€ 75 en 30 minuten extra'],
    [extraChoiceKey('bikefit-tweede-fiets', 'ander-type'), '€ 150 en 1 uur extra'],
  ]),
  facts: FACTS,
};

const resolve = (text: string) => resolveCopyTokensInText(text, lookup);

describe('copy tokens: finding them', () => {
  it('finds tokens anywhere in a block, and nowhere in plain copy', () => {
    expect(hasCopyTokens('Reken op {{duur:volwassenenfit}}.')).toBe(true);
    expect(hasCopyTokens({ data: { items: [{ answer: 'x {{ duur:jeugdfit }}' }] } })).toBe(true);
    expect(hasCopyTokens({ href: '{{telefoon-href}}' })).toBe(true);
    expect(hasCopyTokens('{{prijs:zadelanalyse:all}} en {{extra:voetanalyse}}')).toBe(true);
    expect(hasCopyTokens({ data: { html: '<p>Reken op 90 minuten.</p>' } })).toBe(false);
    expect(hasCopyTokens(null)).toBe(false);
    expect(hasCopyTokens(42)).toBe(false);
  });

  it('does not count something that is no token of the set', () => {
    expect(hasCopyTokens('{{onbekend}} {{duur}} {{duur:a:b}} {{Telefoon}} {telefoon}')).toBe(false);
  });

  it('lists the service slugs of the duration tokens, each once', () => {
    expect(copyTokenSlugs([{ html: '{{duur:a}} {{duur:b}} {{duur:a}} {{telefoon}}' }])).toEqual([
      'a',
      'b',
    ]);
    expect(copyTokenSlugs('{{prijs:a}} {{extra:b}}')).toEqual([]);
  });

  it('lists the offerings a text points at by the line form, each once', () => {
    expect(
      priceLineSlugs('{{prijs:a}} {{prijs:a:all}} {{prijs:b}} {{prijs:a}} {{extra:c}}'),
    ).toEqual(['a', 'b']);
    expect(priceLineSlugs('geen {{prijs:a:youth}}')).toEqual([]);
    expect(priceLineSlugs('')).toEqual([]);
  });

  it('prints and reads the same spelling', () => {
    expect(durationToken('volwassenenfit')).toBe('{{duur:volwassenenfit}}');
    expect(priceToken('zadelanalyse')).toBe('{{prijs:zadelanalyse}}');
    expect(priceToken('zadelanalyse', 'all')).toBe('{{prijs:zadelanalyse:all}}');
    expect(extraToken('voetanalyse')).toBe('{{extra:voetanalyse}}');
    expect(extraToken('bikefit-tweede-fiets', 'ander-type')).toBe(
      '{{extra:bikefit-tweede-fiets:ander-type}}',
    );
    expect(factToken('opvolging:volwassene')).toBe('{{opvolging:volwassene}}');
    expect(parseCopyToken('duur:jeugdfit')).toEqual({ kind: 'duration', slug: 'jeugdfit' });
    expect(parseCopyToken('prijs:a')).toEqual({ kind: 'price', slug: 'a', audience: null });
    expect(parseCopyToken('prijs:a:youth')).toEqual({
      kind: 'price',
      slug: 'a',
      audience: 'youth',
    });
    expect(parseCopyToken('extra:a:b')).toEqual({ kind: 'extra', slug: 'a', choice: 'b' });
    expect(parseCopyToken('e-mail')).toEqual({ kind: 'fact', name: 'e-mail' });
    for (const name of FACT_TOKENS) {
      expect(parseCopyToken(name)).toEqual({ kind: 'fact', name });
    }
  });
});

describe('copy tokens: {{duur:…}}', () => {
  it('replaces a token with the service duration, or "in overleg"', () => {
    expect(
      resolve('Reken op {{duur:volwassenenfit}} voor volwassenen en {{duur:jeugdfit}} voor jeugd.'),
    ).toBe('Reken op 2 uur voor volwassenen en 1 u 30 min voor jeugd.');
    expect(resolve('{{duur:onbekend}}')).toBe(DURATION_TOKEN_FALLBACK);
    expect(DURATION_TOKEN_FALLBACK).toBe('in overleg');
  });
});

describe('copy tokens: {{prijs:…}}', () => {
  it('the line form is the price line of the offering as /aanbod shows it', () => {
    expect(resolve('Kostprijs: {{prijs:bikefit-huidige-fiets}}.')).toBe(
      'Kostprijs: Volwassene € 275,00 · Jeugd – eenmalig € 150,00.',
    );
    expect(resolve('{{prijs:zadelanalyse}}')).toBe('€ 60,00');
  });

  it('the variant form is one amount in prose', () => {
    expect(
      resolve('{{prijs:bikefit-huidige-fiets:adult}} of {{prijs:bikefit-huidige-fiets:youth}}'),
    ).toBe('€ 275 of € 150');
    expect(resolve('{{prijs:zadelanalyse:all}}')).toBe('€ 60');
  });

  it('reads "op aanvraag" for an offering, a variant or an audience that is not there', () => {
    expect(resolve('{{prijs:onbekend}}')).toBe(PRICE_TOKEN_FALLBACK);
    expect(resolve('{{prijs:onbekend:adult}}')).toBe(PRICE_TOKEN_FALLBACK);
    expect(resolve('{{prijs:bikefit-huidige-fiets:volwassen}}')).toBe(PRICE_TOKEN_FALLBACK);
    expect(PRICE_TOKEN_FALLBACK).toBe('op aanvraag');
  });
});

describe('copy tokens: {{extra:…}}', () => {
  it('an extra and a choice of an extra read price, then time', () => {
    expect(resolve('{{extra:voetanalyse}}')).toBe('€ 85 en 30 minuten extra');
    expect(resolve('{{extra:bikefit-tweede-fiets:zelfde-type}}')).toBe('€ 75 en 30 minuten extra');
    expect(resolve('{{extra:bikefit-tweede-fiets:ander-type}}')).toBe('€ 150 en 1 uur extra');
  });

  it('reads "in overleg" when the extra or the choice is not there, or the extra has choices only', () => {
    expect(resolve('{{extra:onbekend}}')).toBe(EXTRA_TOKEN_FALLBACK);
    expect(resolve('{{extra:bikefit-tweede-fiets:onbekend}}')).toBe(EXTRA_TOKEN_FALLBACK);
    // An extra with choices has no price of its own: the choice must be named.
    expect(resolve('{{extra:bikefit-tweede-fiets}}')).toBe(EXTRA_TOKEN_FALLBACK);
    expect(EXTRA_TOKEN_FALLBACK).toBe('in overleg');
  });
});

describe('copy tokens: the facts', () => {
  it.each(FACT_TOKENS)('{{%s}} reads its value from the lookup', (name) => {
    expect(resolve(`[${factToken(name)}]`)).toBe(`[${FACTS[name]}]`);
  });

  it('puts the phone, the e-mail and the address where a sentence or a link needs them', () => {
    expect(resolve('Bel {{telefoon}} of mail {{e-mail}}.')).toBe(
      'Bel +32 473 95 26 33 of mail info@debikefitstudio.be.',
    );
    expect(resolve('Je komt naar {{adres}}.')).toBe(
      'Je komt naar Halsesteenweg 406 a, 9403 Neigem.',
    );
    expect(resolve('{{bedrijf}}, {{zetel}}, {{kbo}}, {{btw}}')).toBe(
      'Qarakter BV, Weversstraat 7, 1730 Asse, BE 1036.912.281, BE 1036.912.281',
    );
    expect(
      resolve('Tot {{opvolging:volwassene}} na je fit; cadeaubon {{cadeaubon-geldigheid}}.'),
    ).toBe('Tot zes maanden na je fit; cadeaubon een jaar.');
  });

  it('an empty fact reads empty, never the raw token', () => {
    const empty = { ...lookup, facts: { ...FACTS, 'e-mail': '', btw: '' } };
    expect(resolveCopyTokensInText('Mail: {{e-mail}}|{{btw}}', empty)).toBe('Mail: |');
  });
});

describe('copy tokens: what is not a token stays as typed', () => {
  it.each([
    '{{onbekend}}',
    '{{duur}}',
    '{{duur:a:b}}',
    '{{prijs}}',
    '{{prijs:a:b:c}}',
    '{{extra:a:b:c}}',
    '{{Telefoon}}',
    '{{telefoon:extra}}',
    '{{opvolging:onbekend}}',
    '{{opvolging}}',
    '{{ }}',
    '{{}}',
    '{telefoon}',
    '{{duur:Volwassenenfit}}',
  ])('leaves %s alone', (text) => {
    expect(resolve(text)).toBe(text);
    expect(resolve(`voor ${text} na`)).toBe(`voor ${text} na`);
  });

  it('copes with spaces inside the braces and with a token next to other text', () => {
    expect(resolve('{{ telefoon }}|{{  duur:jeugdfit}}|{{prijs:zadelanalyse:all  }}')).toBe(
      '+32 473 95 26 33|1 u 30 min|€ 60',
    );
  });
});

describe('copy tokens: one pass', () => {
  it('never scans what it printed: a value that holds a token comes out as that text', () => {
    const tricky: CopyTokenLookup = {
      ...lookup,
      durationBySlug: new Map([['x', 'zie {{telefoon}} en {{duur:x}}']]),
    };
    expect(resolveCopyTokensInText('{{duur:x}}', tricky)).toBe('zie {{telefoon}} en {{duur:x}}');
  });

  it('does not treat $ in a value as a replacement pattern', () => {
    const dollars: CopyTokenLookup = {
      ...lookup,
      facts: { ...FACTS, bedrijf: "A$& B$1 C$'" },
    };
    expect(resolveCopyTokensInText('{{bedrijf}}', dollars)).toBe("A$& B$1 C$'");
  });
});

describe('copy tokens: the empty lookup', () => {
  it('reads every fallback and an empty fact', () => {
    const none = emptyCopyTokenLookup();
    expect(
      resolveCopyTokensInText(
        '{{duur:a}}|{{prijs:a}}|{{prijs:a:all}}|{{extra:a}}|{{extra:a:b}}|{{telefoon}}',
        none,
      ),
    ).toBe('in overleg|op aanvraag|op aanvraag|in overleg|in overleg|');
    for (const name of FACT_TOKENS) expect(none.facts[name]).toBe('');
  });
});

describe('copy tokens: HTML and walking a block', () => {
  it('escapes the text in HTML and leaves it plain elsewhere', () => {
    const odd: CopyTokenLookup = {
      ...lookup,
      durationBySlug: new Map([['x', '2 <uur> & meer']]),
      facts: { ...FACTS, 'telefoon-href': 'tel:"+32"' },
    };
    expect(resolveCopyTokensInText('{{duur:x}}', odd, { html: true })).toBe(
      '2 &lt;uur&gt; &amp; meer',
    );
    expect(resolveCopyTokensInText('{{duur:x}}', odd)).toBe('2 <uur> & meer');
    expect(
      resolveCopyTokensInText('<a href="{{telefoon-href}}">{{telefoon}}</a>', odd, { html: true }),
    ).toBe('<a href="tel:&quot;+32&quot;">+32 473 95 26 33</a>');
  });

  it('walks a block: strings everywhere, html keys escaped, the rest untouched', () => {
    const block = {
      id: 'b1',
      type: 'richText',
      data: {
        title: 'Voor je komt',
        html: '<p>Reken op {{duur:volwassenenfit}}, mail <a href="mailto:{{e-mail}}">{{e-mail}}</a>.</p>',
        items: [{ answer: 'Jeugd: {{duur:jeugdfit}}', count: 2, flag: true }],
        cta: { label: 'Bel {{telefoon}}', href: '{{telefoon-href}}' },
        nothing: null,
      },
    };
    const resolved = resolveCopyTokens(block, lookup);
    expect(resolved).toEqual({
      id: 'b1',
      type: 'richText',
      data: {
        title: 'Voor je komt',
        html: '<p>Reken op 2 uur, mail <a href="mailto:info@debikefitstudio.be">info@debikefitstudio.be</a>.</p>',
        items: [{ answer: 'Jeugd: 1 u 30 min', count: 2, flag: true }],
        cta: { label: 'Bel +32 473 95 26 33', href: 'tel:+32473952633' },
        nothing: null,
      },
    });
    // A copy: the stored block keeps its token.
    expect(block.data.html).toContain('{{duur:volwassenenfit}}');
    expect(block.data.cta.href).toBe('{{telefoon-href}}');
  });
});
