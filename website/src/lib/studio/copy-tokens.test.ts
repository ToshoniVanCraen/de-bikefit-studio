import { describe, expect, it } from 'vitest';
import {
  copyTokenSlugs,
  DURATION_TOKEN_FALLBACK,
  durationToken,
  hasCopyTokens,
  resolveCopyTokens,
  resolveCopyTokensInText,
} from './copy-tokens';

const lookup = {
  durationBySlug: new Map([
    ['volwassenenfit', '2 uur'],
    ['jeugdfit', '1 u 30 min'],
  ]),
};

describe('copy tokens', () => {
  it('finds tokens anywhere in a block, and nowhere in plain copy', () => {
    expect(hasCopyTokens('Reken op {{duur:volwassenenfit}}.')).toBe(true);
    expect(hasCopyTokens({ data: { items: [{ answer: 'x {{ duur:jeugdfit }}' }] } })).toBe(true);
    expect(hasCopyTokens({ data: { html: '<p>Reken op 90 minuten.</p>' } })).toBe(false);
    expect(hasCopyTokens(null)).toBe(false);
    expect(copyTokenSlugs([{ html: '{{duur:a}} {{duur:b}} {{duur:a}}' }])).toEqual(['a', 'b']);
    expect(durationToken('volwassenenfit')).toBe('{{duur:volwassenenfit}}');
  });

  it('replaces a token with the service duration, or "in overleg"', () => {
    expect(
      resolveCopyTokensInText(
        'Reken op {{duur:volwassenenfit}} voor volwassenen en {{duur:jeugdfit}} voor jeugd.',
        lookup,
      ),
    ).toBe('Reken op 2 uur voor volwassenen en 1 u 30 min voor jeugd.');
    expect(resolveCopyTokensInText('{{duur:onbekend}}', lookup)).toBe(DURATION_TOKEN_FALLBACK);
  });

  it('escapes the label in HTML and leaves it plain elsewhere', () => {
    const odd = { durationBySlug: new Map([['x', '2 <uur> & meer']]) };
    expect(resolveCopyTokensInText('{{duur:x}}', odd, { html: true })).toBe(
      '2 &lt;uur&gt; &amp; meer',
    );
    expect(resolveCopyTokensInText('{{duur:x}}', odd)).toBe('2 <uur> & meer');
  });

  it('walks a block: strings everywhere, html keys escaped, the rest untouched', () => {
    const block = {
      id: 'b1',
      type: 'richText',
      data: {
        title: 'Voor je komt',
        html: '<p>Reken op {{duur:volwassenenfit}}.</p>',
        items: [{ answer: 'Jeugd: {{duur:jeugdfit}}', count: 2, flag: true }],
        nothing: null,
      },
    };
    const resolved = resolveCopyTokens(block, lookup);
    expect(resolved).toEqual({
      id: 'b1',
      type: 'richText',
      data: {
        title: 'Voor je komt',
        html: '<p>Reken op 2 uur.</p>',
        items: [{ answer: 'Jeugd: 1 u 30 min', count: 2, flag: true }],
        nothing: null,
      },
    });
    // A copy: the stored block keeps its token.
    expect(block.data.html).toContain('{{duur:volwassenenfit}}');
  });
});
