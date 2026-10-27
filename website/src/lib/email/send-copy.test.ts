import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ResolvedEmailSettings } from './config';
import { sendEmail } from './send';

/**
 * `sendEmail()` resolves copy tokens just before the send (27 Oct 2026): what
 * Resend receives never holds a `{{…}}`. Pure: `fetch` is stubbed, the settings
 * are passed in (`./settings` must never run) and the site's lookup is mocked.
 */

vi.mock('./settings', () => ({
  loadEmailSettings: vi.fn(async () => {
    throw new Error('loadEmailSettings must not run: every call passes its settings');
  }),
}));
vi.mock('@/lib/studio/copy-token-lookup', async () => {
  const { emptyCopyTokenLookup } = await import('@/lib/studio/copy-tokens');
  const lookup = emptyCopyTokenLookup();
  return {
    getCopyTokenLookup: vi.fn(async () => ({
      ...lookup,
      facts: {
        ...lookup.facts,
        telefoon: '+32 473 95 26 33',
        'tweede-bezoek-gratis': 'zes maanden',
      },
    })),
  };
});

const settings: ResolvedEmailSettings = {
  apiKey: 're_CopyTokenUnitKey_0123456789abcdef',
  apiKeySource: 'setting',
  from: 'De Bikefit Studio <afspraken@studio.test>',
  fromSource: 'setting',
  replyTo: '',
  replyToSource: 'none',
  recipient: { address: '', source: 'none', invalid: false },
};

const MAIL = {
  to: 'klant@example.test',
  subject: 'Je afspraak: bel {{telefoon}}',
  text: 'Een tweede bezoek is gratis tot {{tweede-bezoek-gratis}} na je fit.',
  html: '<p>Een tweede bezoek is gratis tot {{tweede-bezoek-gratis}} na je fit.</p>',
};

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function stubFetch() {
  const fetchMock = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    void url;
    void init;
    return new Response(JSON.stringify({ id: 'em_1' }), { status: 200 });
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

describe('sendEmail and copy tokens', () => {
  it('sends the subject, text and html with their tokens resolved', async () => {
    const fetchMock = stubFetch();
    const result = await sendEmail(MAIL, settings);
    expect(result).toEqual({ sent: true, id: 'em_1' });
    const body = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body));
    expect(body.subject).toBe('Je afspraak: bel +32 473 95 26 33');
    expect(body.text).toBe('Een tweede bezoek is gratis tot zes maanden na je fit.');
    expect(body.html).toBe('<p>Een tweede bezoek is gratis tot zes maanden na je fit.</p>');
    expect(JSON.stringify(body)).not.toContain('{{');
  });

  it('a mail without a token is sent as it is', async () => {
    const fetchMock = stubFetch();
    const plain = {
      to: 'klant@example.test',
      subject: 'Hallo',
      text: 'Tot dan!',
      html: '<p>Tot dan!</p>',
    };
    await sendEmail(plain, settings);
    const body = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body));
    expect(body).toMatchObject({ subject: 'Hallo', text: 'Tot dan!', html: '<p>Tot dan!</p>' });
  });

  it('a mail that is not sent does not read the lookup', async () => {
    const { getCopyTokenLookup } = await import('@/lib/studio/copy-token-lookup');
    vi.mocked(getCopyTokenLookup).mockClear();
    const fetchMock = stubFetch();
    const result = await sendEmail(MAIL, { ...settings, apiKey: null, apiKeySource: 'none' });
    expect(result).toEqual({ sent: false, reason: 'not_configured' });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(getCopyTokenLookup).not.toHaveBeenCalled();
  });
});
