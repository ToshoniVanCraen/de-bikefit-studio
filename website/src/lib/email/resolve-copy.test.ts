import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getCopyTokenLookup } from '@/lib/studio/copy-token-lookup';
import { resolveCopyText, resolveMailCopy } from './resolve-copy';

/**
 * Tokens in outgoing mail. The site's lookup is mocked (no readers, no
 * database): what is under test is where and how the engine is applied.
 */

vi.mock('@/lib/studio/copy-token-lookup', async () => {
  const { emptyCopyTokenLookup, variantPriceKey } = await import('@/lib/studio/copy-tokens');
  const lookup = emptyCopyTokenLookup();
  return {
    getCopyTokenLookup: vi.fn(async () => ({
      ...lookup,
      priceByVariant: new Map([[variantPriceKey('tweede-bezoek', 'all'), '€ 75 & meer']]),
      facts: {
        ...lookup.facts,
        telefoon: '+32 473 95 26 33',
        adres: 'Halsesteenweg 406 a, 9403 Neigem',
        'opvolging:volwassene': 'zes maanden',
      },
    })),
  };
});

let logged: unknown[][] = [];
beforeEach(() => {
  logged = [];
  vi.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
    logged.push(args);
  });
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.mocked(getCopyTokenLookup).mockClear();
});

const MAIL = {
  subject: 'Je afspraak, bel {{telefoon}}',
  text: 'Opvolging tot {{opvolging:volwassene}}. Tweede bezoek: {{prijs:tweede-bezoek:all}}. {{adres}}',
  html: '<p>Opvolging tot {{opvolging:volwassene}}. Tweede bezoek: {{prijs:tweede-bezoek:all}}.</p>',
  to: 'klant@example.test',
};

describe('resolveMailCopy', () => {
  it('resolves the subject and the text as plain text and the html escaped', async () => {
    const mail = await resolveMailCopy(MAIL);
    expect(mail.subject).toBe('Je afspraak, bel +32 473 95 26 33');
    expect(mail.text).toBe(
      'Opvolging tot zes maanden. Tweede bezoek: € 75 & meer. Halsesteenweg 406 a, 9403 Neigem',
    );
    expect(mail.html).toBe('<p>Opvolging tot zes maanden. Tweede bezoek: € 75 &amp; meer.</p>');
    // Whatever else the mail carries is passed on untouched.
    expect(mail.to).toBe('klant@example.test');
  });

  it('a mail without a token is the same object and reads nothing', async () => {
    const plain = { subject: 'Hallo', text: 'Tot dan! {{onbekend}}', html: '<p>Tot dan!</p>' };
    expect(await resolveMailCopy(plain)).toBe(plain);
    expect(getCopyTokenLookup).not.toHaveBeenCalled();
  });

  it('without a lookup the tokens read their fallbacks, never the raw token', async () => {
    vi.mocked(getCopyTokenLookup).mockRejectedValueOnce(
      new Error('select … from cms_site_settings'),
    );
    const mail = await resolveMailCopy({
      subject: 'Bel {{telefoon}}',
      text: 'Kost {{prijs:x}} en duurt {{duur:y}}.',
      html: '<p>Kost {{prijs:x:all}}.</p>',
    });
    expect(mail).toEqual({
      subject: 'Bel ',
      text: 'Kost op aanvraag en duurt in overleg.',
      html: '<p>Kost op aanvraag.</p>',
    });
    expect(logged).toEqual([['[email] copy_tokens_unavailable']]);
  });
});

describe('resolveCopyText', () => {
  it('resolves the plain strings of a calendar event', async () => {
    expect(
      await resolveCopyText({
        summary: 'Bikefit — De Bikefit Studio',
        description: 'Vragen? Bel {{telefoon}}',
        location: '{{adres}}',
      }),
    ).toEqual({
      summary: 'Bikefit — De Bikefit Studio',
      description: 'Vragen? Bel +32 473 95 26 33',
      location: 'Halsesteenweg 406 a, 9403 Neigem',
    });
  });

  it('hands back the same value when there is no token', async () => {
    const value = { summary: 'Bikefit', location: '' };
    expect(await resolveCopyText(value)).toBe(value);
    expect(getCopyTokenLookup).not.toHaveBeenCalled();
  });
});
