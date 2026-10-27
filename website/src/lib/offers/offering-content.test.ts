import { describe, expect, it } from 'vitest';
import { OFFER_CTA_LABEL, OFFER_DURATION_FALLBACK } from './catalogue';
import {
  contentFromRow,
  EMPTY_OFFERING_CONTENT,
  linesToList,
  offeringCtaLabel,
  offeringEditorialDuration,
  offeringSummary,
  validateOfferingContent,
} from './offering-content';

describe('validateOfferingContent (Beheer → Aanbod, the text of an offering)', () => {
  it('accepts the fields the form sends, trims, drops empty list lines', () => {
    const result = validateOfferingContent({
      slug: ' Voetanalyse ',
      category: 'bikefit',
      sortOrder: 30,
      title: '  Voetanalyse ',
      summary: 'Meer inzicht.',
      contents: ['Eerste.', '', '  Tweede.  '],
      extras: [],
      image: {
        mediaId: null,
        url: '/images/editorial/bikefit-studio-v1.webp',
        alt: '',
        decorative: false,
      },
    });
    expect(result).toMatchObject({
      ok: true,
      data: {
        slug: 'voetanalyse',
        title: 'Voetanalyse',
        contents: ['Eerste.', 'Tweede.'],
        extras: [],
        duration: '',
        ctaLabel: '',
        metaDescription: '',
      },
    });
  });

  it('refuses a missing title, a malformed slug and an unknown category, in Dutch', () => {
    const bad = validateOfferingContent({ slug: 'Bad Slug!', title: '', category: 'spa' });
    expect(bad.ok).toBe(false);
    if (!bad.ok) {
      expect(bad.message).toContain('titel');
      expect(bad.message).toContain('slug');
    }
  });

  it('fills defaults from a stored row defensively', () => {
    const content = contentFromRow({
      slug: 'coaching',
      category: 'nonsense',
      sortOrder: 20,
      title: 'Coaching',
      summary: '',
      intro: 'Samen vooruit.',
      goal: '',
      contents: ['a', 3, null, 'b'],
      extras: 'not a list',
      extrasNote: '',
      duration: '',
      ctaLabel: '',
      image: { broken: true },
      metaDescription: '',
    });
    expect(content.category).toBe('bikefit');
    expect(content.contents).toEqual(['a', 'b']);
    expect(content.extras).toEqual([]);
    expect(content.image).toEqual({ mediaId: null, url: null, alt: '', decorative: false });
  });

  it('labels: the booking button, the card summary and the enquiry duration fall back', () => {
    expect(offeringCtaLabel({ ctaLabel: '' })).toBe(OFFER_CTA_LABEL);
    expect(offeringCtaLabel({ ctaLabel: 'Plan je fit' })).toBe('Plan je fit');
    expect(offeringSummary({ summary: '', intro: 'De inleiding.' })).toBe('De inleiding.');
    expect(offeringSummary({ summary: 'Kort.', intro: 'De inleiding.' })).toBe('Kort.');
    expect(offeringEditorialDuration({ duration: ' ' })).toBe(OFFER_DURATION_FALLBACK);
    expect(offeringEditorialDuration({ duration: 'Ongeveer 90 minuten' })).toBe(
      'Ongeveer 90 minuten',
    );
  });

  it('a textarea becomes one item per non-empty line', () => {
    expect(linesToList('Een\r\n\n  Twee  \nDrie')).toEqual(['Een', 'Twee', 'Drie']);
    expect(EMPTY_OFFERING_CONTENT.contents).toEqual([]);
  });
});

describe('the free-text Kostprijs of an offering (27 Oct 2026)', () => {
  const base = { slug: 'bikefit-tweede-bezoek', title: 'Bikefit – tweede bezoek' };

  it('is empty by default, trimmed, and kept as typed otherwise', () => {
    expect(validateOfferingContent(base)).toMatchObject({ ok: true, data: { priceText: '' } });
    expect(EMPTY_OFFERING_CONTENT.priceText).toBe('');
    expect(
      validateOfferingContent({
        ...base,
        priceText: '  Gratis binnen 6 maanden na je fit, daarna € 75 ',
      }),
    ).toMatchObject({
      ok: true,
      data: { priceText: 'Gratis binnen 6 maanden na je fit, daarna € 75' },
    });
  });

  it('is at most 120 characters, with a Dutch message that names the field', () => {
    expect(validateOfferingContent({ ...base, priceText: 'x'.repeat(120) }).ok).toBe(true);
    expect(validateOfferingContent({ ...base, priceText: 'x'.repeat(121) })).toEqual({
      ok: false,
      message: 'De prijstekst is te lang (max. 120 tekens).',
    });
    // Whitespace around the text does not count against the limit.
    expect(validateOfferingContent({ ...base, priceText: ` ${'x'.repeat(120)} ` }).ok).toBe(true);
  });

  it('reads from a stored row, and as empty from a row that has no such column yet', () => {
    const row = {
      slug: 'bikefit-tweede-bezoek',
      category: 'bikefit',
      sortOrder: 25,
      title: 'Bikefit – tweede bezoek',
      summary: '',
      intro: '',
      goal: '',
      contents: [],
      extras: [],
      extrasNote: '',
      duration: '1 uur',
      ctaLabel: '',
      image: null,
      metaDescription: '',
    };
    expect(
      contentFromRow({ ...row, priceText: 'Gratis binnen 6 maanden na je fit' }).priceText,
    ).toBe('Gratis binnen 6 maanden na je fit');
    expect(contentFromRow(row).priceText).toBe('');
    expect(contentFromRow({ ...row, priceText: null }).priceText).toBe('');
  });
});
