import { describe, expect, it } from 'vitest';
import { PASSWORD_MAX_LENGTH, validatePasswordStrength } from '@/lib/cms/password';
import {
  PASSWORD_INPUT_MESSAGES,
  PASSWORD_STDIN_MAX_BYTES,
  PASSWORD_STDIN_TTY_REFUSAL,
  checkProvidedPassword,
  parseProvidedPassword,
  passwordStdinSourceAllowed,
  readBoundedSource,
  readProvidedPassword,
  type PasswordInputErrorCode,
} from './password-stdin';

/** Strong by the CMS rules, with spaces inside. Test-only, never a real credential. */
const STRONG = 'Zadel en Pen 2026';

const utf8 = (text: string) => new TextEncoder().encode(text);
const bytes = (...values: number[]) => Uint8Array.from(values);

async function* chunksOf(...parts: Array<Uint8Array | string>) {
  for (const part of parts) yield part;
}

/** A source that fails on its first read (as stdin does with EISDIR when it is a directory). */
function failingSource(message: string): AsyncIterable<Uint8Array> {
  return { [Symbol.asyncIterator]: () => ({ next: () => Promise.reject(new Error(message)) }) };
}

/** An endless source of `size`-byte chunks that counts what was pulled and whether it was closed. */
function countingSource(size: number) {
  const state = { pulled: 0, closed: false };
  async function* generate() {
    try {
      for (;;) {
        state.pulled += 1;
        yield new Uint8Array(size).fill(0x61);
      }
    } finally {
      state.closed = true;
    }
  }
  return { state, source: generate() };
}

const DUTCH = {
  short: validatePasswordStrength('Kort-1'),
  long: validatePasswordStrength(`Aa1${'b'.repeat(PASSWORD_MAX_LENGTH)}`),
  classes: validatePasswordStrength('zonder-hoofdletter-2026'),
};

function codeOf(input: Uint8Array): PasswordInputErrorCode | 'ok' {
  const result = parseProvidedPassword(input);
  return result.ok ? 'ok' : result.code;
}

describe('PASSWORD_STDIN_MAX_BYTES', () => {
  it('is PASSWORD_MAX_LENGTH characters of 4-byte UTF-8 plus a CRLF', () => {
    expect(PASSWORD_STDIN_MAX_BYTES).toBe(802);
    expect(PASSWORD_STDIN_MAX_BYTES).toBe(PASSWORD_MAX_LENGTH * 4 + 2);
  });

  it('fits the longest valid passwords, 3-byte and astral characters included', async () => {
    const bmp = `Aa1${'€'.repeat(PASSWORD_MAX_LENGTH - 3)}`;
    const astral = `Aa1${'🚲'.repeat((PASSWORD_MAX_LENGTH - 4) / 2)}`;
    for (const password of [bmp, astral]) {
      expect(password.length).toBeLessThanOrEqual(PASSWORD_MAX_LENGTH);
      expect(await readProvidedPassword(chunksOf(`${password}\r\n`))).toEqual({
        ok: true,
        password,
      });
    }
  });
});

describe('readBoundedSource', () => {
  it('joins byte and string chunks, strings as UTF-8', async () => {
    const read = await readBoundedSource(chunksOf(utf8('Za'), 'dél', bytes(0x31)));
    expect(read).toEqual({ ok: true, bytes: utf8('Zadél1') });
  });

  it('reads an empty source as zero bytes', async () => {
    expect(await readBoundedSource(chunksOf())).toEqual({ ok: true, bytes: new Uint8Array(0) });
  });

  it('accepts exactly the bound and refuses one byte more', async () => {
    const atBound = new Uint8Array(PASSWORD_STDIN_MAX_BYTES).fill(0x61);
    expect((await readBoundedSource(chunksOf(atBound))).ok).toBe(true);
    expect(await readBoundedSource(chunksOf(atBound, 'a'))).toEqual({
      ok: false,
      code: 'oversized',
    });
    expect(await readBoundedSource(chunksOf('abcdef'), 5)).toEqual({
      ok: false,
      code: 'oversized',
    });
  });

  it('stops pulling at the first chunk past the bound and closes the source', async () => {
    const { state, source } = countingSource(100);
    expect(await readBoundedSource(source)).toEqual({ ok: false, code: 'oversized' });
    // 8 chunks are 800 bytes (within 802), the 9th passes the bound: nothing after it is read.
    expect(state.pulled).toBe(9);
    expect(state.closed).toBe(true);
  });

  it('stops after one pull when the first chunk alone is too big', async () => {
    const { state, source } = countingSource(64 * 1024);
    expect((await readBoundedSource(source)).ok).toBe(false);
    expect(state.pulled).toBe(1);
    expect(state.closed).toBe(true);
  });
});

describe('parseProvidedPassword', () => {
  it('accepts a strong password without a newline, unchanged', () => {
    expect(parseProvidedPassword(utf8(STRONG))).toEqual({ ok: true, password: STRONG });
  });

  it('strips exactly one trailing \\n or \\r\\n', () => {
    expect(parseProvidedPassword(utf8(`${STRONG}\n`))).toEqual({ ok: true, password: STRONG });
    expect(parseProvidedPassword(utf8(`${STRONG}\r\n`))).toEqual({ ok: true, password: STRONG });
  });

  it('keeps leading and trailing spaces (no trimming)', () => {
    expect(parseProvidedPassword(utf8(`  ${STRONG} \n`))).toEqual({
      ok: true,
      password: `  ${STRONG} `,
    });
  });

  it('refuses a second trailing newline, an embedded one and any \\r as multiline', () => {
    for (const text of [
      `${STRONG}\n\n`,
      `${STRONG}\r\n\r\n`,
      `${STRONG}\n\r\n`,
      'Zadel-en\nPen-2026',
      'Zadel-en\rPen-2026',
      `${STRONG}\r`,
      `\n${STRONG}`,
      '\n\n',
    ]) {
      expect(codeOf(utf8(text))).toBe('multiline');
    }
  });

  it('refuses empty and newline-only input as empty', () => {
    for (const text of ['', '\n', '\r\n']) expect(codeOf(utf8(text))).toBe('empty');
  });

  it('refuses C0 and C1 control characters and a byte order mark', () => {
    for (const text of [
      'Zadel\u0000Pen-2026',
      'Zadel\tPen-2026',
      'Zadel\u001b[2JPen-2026',
      'Zadel\u007fPen-2026',
      'Zadel\u0085Pen-2026',
      'Zadel\u009bPen-2026',
      `${STRONG}\ufeff`,
    ]) {
      expect(codeOf(utf8(text))).toBe('control_characters');
    }
    // A leading UTF-8 BOM is kept by the decoder (not dropped silently), then refused.
    expect(codeOf(bytes(0xef, 0xbb, 0xbf, ...utf8(STRONG)))).toBe('control_characters');
  });

  it('refuses malformed UTF-8 instead of replacing it', () => {
    for (const input of [
      bytes(0x5a, 0xff, 0x31),
      bytes(...utf8('Zadel-en-Pen-2026'), 0xe2, 0x82),
      bytes(0xc0, 0xaf),
      bytes(0xed, 0xa0, 0x80),
      bytes(0x80, 0x0a),
    ]) {
      expect(codeOf(input)).toBe('invalid_utf8');
    }
  });

  it('applies the CMS strength rules and returns their Dutch reason', () => {
    const cases: Array<[string, string | null]> = [
      ['Kort-Ww-1', DUTCH.short],
      ['Zadel-en-Pen-Klaar', DUTCH.classes],
      ['zadel-en-pen-2026', DUTCH.classes],
      ['ZADEL-EN-PEN-2026', DUTCH.classes],
      [`Aa1${'b'.repeat(PASSWORD_MAX_LENGTH - 2)}`, DUTCH.long],
    ];
    for (const [password, reason] of cases) {
      expect(reason).toMatch(/^Wachtwoord /);
      expect(parseProvidedPassword(utf8(`${password}\n`))).toEqual({
        ok: false,
        code: 'weak',
        message: reason,
      });
    }
    expect(DUTCH.short).toBe('Wachtwoord moet minstens 12 tekens lang zijn.');
    expect(DUTCH.long).toBe('Wachtwoord mag hoogstens 200 tekens lang zijn.');
  });

  it('accepts the boundaries of the strength rules: 12 and 200 characters', () => {
    for (const password of ['Aa1bbbbbbbbb', `Aa1${'b'.repeat(PASSWORD_MAX_LENGTH - 3)}`]) {
      expect(parseProvidedPassword(utf8(password))).toEqual({ ok: true, password });
    }
  });

  it('accepts a strong Unicode password with multibyte characters, exactly as given', () => {
    const password = 'Ｆｉｅｔｓ-Zadel-2026-ﬁ-✓-🚲';
    const result = parseProvidedPassword(utf8(`${password}\n`));
    expect(result).toEqual({ ok: true, password });
    // Not NFKC-normalised here: hashPassword() and verifyPassword() both normalise.
    expect(password.normalize('NFKC')).not.toBe(password);
  });
});

describe('checkProvidedPassword (the rules the account core applies to a provided password)', () => {
  it('refuses empty, multi-line, control characters and weak; accepts a strong one', () => {
    expect(checkProvidedPassword('')).toMatchObject({ ok: false, code: 'empty' });
    expect(checkProvidedPassword(`${STRONG}\n`)).toMatchObject({ ok: false, code: 'multiline' });
    expect(checkProvidedPassword(`${STRONG}\u0007`)).toMatchObject({
      ok: false,
      code: 'control_characters',
    });
    expect(checkProvidedPassword(' ')).toEqual({ ok: false, code: 'weak', message: DUTCH.short });
    expect(checkProvidedPassword(STRONG)).toEqual({ ok: true, password: STRONG });
  });
});

describe('readProvidedPassword', () => {
  it('reads, strips one newline and checks, across chunks', async () => {
    expect(await readProvidedPassword(chunksOf(utf8('Zadel en '), 'Pen 2026', '\n'))).toEqual({
      ok: true,
      password: STRONG,
    });
  });

  it('turns an oversized and a failing source into fixed refusals', async () => {
    expect(await readProvidedPassword(countingSource(100).source)).toEqual({
      ok: false,
      code: 'oversized',
      message: PASSWORD_INPUT_MESSAGES.oversized,
    });
    const failing = failingSource('EISDIR: illegal operation on a directory, read');
    expect(await readProvidedPassword(failing)).toEqual({
      ok: false,
      code: 'unreadable',
      message: PASSWORD_INPUT_MESSAGES.unreadable,
    });
  });
});

describe('no refusal ever contains the input', () => {
  const SENTINEL = 'Kluis-Geheim-77';
  const fixedMessages = new Set<string>([
    ...Object.values(PASSWORD_INPUT_MESSAGES),
    ...Object.values(DUTCH).filter((m): m is string => m !== null),
  ]);
  const cases: Array<{
    name: string;
    code: PasswordInputErrorCode;
    secret: string;
    source: () => AsyncIterable<Uint8Array | string>;
  }> = [
    {
      name: 'unreadable (the error itself carries the secret)',
      code: 'unreadable',
      secret: SENTINEL,
      source: () => failingSource(`read failed near ${SENTINEL}`),
    },
    {
      name: 'unreadable after a first chunk',
      code: 'unreadable',
      secret: SENTINEL,
      source: async function* () {
        yield utf8(SENTINEL);
        throw new Error(SENTINEL);
      },
    },
    {
      name: 'oversized',
      code: 'oversized',
      secret: SENTINEL,
      source: () => chunksOf(SENTINEL.repeat(60)),
    },
    {
      name: 'invalid UTF-8',
      code: 'invalid_utf8',
      secret: SENTINEL,
      source: () => chunksOf(utf8(SENTINEL), bytes(0xff), utf8(`${SENTINEL}\n`)),
    },
    {
      name: 'multi-line',
      code: 'multiline',
      secret: SENTINEL,
      source: () => chunksOf(`${SENTINEL}\n${SENTINEL}\n`),
    },
    {
      name: 'control characters',
      code: 'control_characters',
      secret: SENTINEL,
      source: () => chunksOf(`${SENTINEL}\u001b[31m\n`),
    },
    {
      name: 'byte order mark',
      code: 'control_characters',
      secret: SENTINEL,
      source: () => chunksOf(bytes(0xef, 0xbb, 0xbf), `${SENTINEL}\n`),
    },
    { name: 'too short', code: 'weak', secret: 'Kl-1x', source: () => chunksOf('Kl-1x\n') },
    {
      name: 'no digit',
      code: 'weak',
      secret: 'Kluis-Geheim-Zonder',
      source: () => chunksOf('Kluis-Geheim-Zonder\n'),
    },
    {
      name: 'too long',
      code: 'weak',
      secret: 'geheimgeheim',
      source: () => chunksOf(`Kluis-1${'geheim'.repeat(40)}\n`),
    },
  ];

  for (const { name, code, secret, source } of cases) {
    it(`${name}: fixed code and message, no input`, async () => {
      const result = await readProvidedPassword(source());
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.code).toBe(code);
      expect(fixedMessages.has(result.message)).toBe(true);
      expect(JSON.stringify(result)).not.toContain(secret);
    });
  }

  it('the TTY refusal is a fixed sentence', () => {
    expect(PASSWORD_STDIN_TTY_REFUSAL).toBe(
      '--password-stdin: refusing to read a password from a terminal; pipe it from the secret store',
    );
  });
});

describe('passwordStdinSourceAllowed', () => {
  it('refuses a terminal and allows a pipe, a file or /dev/null', () => {
    expect(passwordStdinSourceAllowed(true)).toBe(false);
    expect(passwordStdinSourceAllowed(undefined)).toBe(true);
    expect(passwordStdinSourceAllowed(false)).toBe(true);
  });
});
