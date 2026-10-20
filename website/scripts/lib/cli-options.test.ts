import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  assertWriteTarget,
  databaseHost,
  describeError,
  rejectBooleanFlagValues,
  rejectPositionals,
  rejectUnknownOptions,
  valueOf,
} from './cli-options.mjs';

/** Looks like a password pasted in the wrong place. Test-only, never a real credential. */
const SECRET = 'Kluis-Geheim-2026';

/** The error message of `run`, or `'ok'` when it does not throw. */
function messageOf(run: () => unknown): string {
  try {
    run();
    return 'ok';
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
}

describe('rejectUnknownOptions', () => {
  const known = ['--add', '--identifier', '--note'];

  it('lets known options through, bare or with =value, and leaves positionals to rejectPositionals', () => {
    expect(messageOf(() => rejectUnknownOptions(['--add', '--identifier', 'x'], known))).toBe('ok');
    expect(messageOf(() => rejectUnknownOptions(['--identifier=x', '--note=a=b'], known))).toBe(
      'ok',
    );
    expect(messageOf(() => rejectUnknownOptions(['positional', '-p'], known))).toBe('ok');
  });

  it('identifies an unknown option only by position', () => {
    expect(messageOf(() => rejectUnknownOptions(['--add', '--foo'], known))).toBe(
      'unknown option #2 (name and value not shown)',
    );
    expect(messageOf(() => rejectUnknownOptions(['--'], known))).toBe(
      'unknown option #1 (name and value not shown)',
    );
  });

  it('never shows an unknown name or what follows =', () => {
    const message = messageOf(() => rejectUnknownOptions(['--add', `--password=${SECRET}`], known));
    expect(message).toBe('unknown option #2 (name and value not shown)');
    expect(message).not.toContain(SECRET);
    expect(messageOf(() => rejectUnknownOptions(['--password='], known))).toBe(
      'unknown option #1 (name and value not shown)',
    );
  });

  it('never echoes a pasted secret that happens to look like an option', () => {
    for (const arg of [
      `--${SECRET}`,
      `--x${SECRET}=1`,
      '--a\u001b[2Jb',
      '--pässwort',
      '--A',
      '--secret123',
    ]) {
      const message = messageOf(() => rejectUnknownOptions(['--add', arg], known));
      expect(message).toBe('unknown option #2 (name and value not shown)');
      expect(message).not.toContain(SECRET);
      expect(message).not.toContain('\u001b');
    }
  });
});

describe('rejectBooleanFlagValues', () => {
  const flags = ['--add', '--password-stdin'];

  it('refuses --flag=value on a flag without a value, without showing the value', () => {
    const message = messageOf(() => rejectBooleanFlagValues([`--password-stdin=${SECRET}`], flags));
    expect(message).toBe('--password-stdin takes no value (value not shown)');
    expect(message).not.toContain(SECRET);
    expect(messageOf(() => rejectBooleanFlagValues(['--add='], flags))).toBe(
      '--add takes no value (value not shown)',
    );
  });

  it('lets bare flags, other options with a value and positionals through', () => {
    expect(
      messageOf(() =>
        rejectBooleanFlagValues(['--add', '--password-stdin', '--identifier=x', 'a=b'], flags),
      ),
    ).toBe('ok');
  });
});

describe('rejectPositionals', () => {
  const valueFlags = ['--identifier', '--note', '--expect-host'];

  it('lets options and the values of value options through', () => {
    for (const args of [
      ['--add', '--identifier', 'x', '--note', 'PR #18', '--expect-host', 'db.example'],
      ['--add', '--identifier=x', '--note=PR #18', '--password-stdin'],
      ['--list'],
      [],
    ]) {
      expect(messageOf(() => rejectPositionals(args, valueFlags))).toBe('ok');
    }
  });

  it('refuses a stray argument by position, never by value', () => {
    const cases: Array<[string[], number]> = [
      [['--add', '--identifier', 'x', SECRET], 4],
      [[SECRET, '--list'], 1],
      [['--identifier=x', SECRET], 2],
      [['--password-stdin', SECRET], 2],
      [['--add', '-p', SECRET], 2],
      // A value option followed by an option does not consume it (valueOf refuses that pair).
      [['--identifier', '--add', SECRET], 3],
    ];
    for (const [args, position] of cases) {
      const message = messageOf(() => rejectPositionals(args, valueFlags));
      expect(message).toBe(`unexpected argument #${position} (value not shown)`);
      expect(message).not.toContain(SECRET);
    }
  });
});

describe('valueOf (unchanged)', () => {
  it('reads --flag value and --flag=value; null when absent; the first occurrence wins', () => {
    expect(valueOf(['--identifier', 'x'], '--identifier')).toBe('x');
    expect(valueOf(['--identifier=x=y'], '--identifier')).toBe('x=y');
    expect(valueOf(['--identifier='], '--identifier')).toBe('');
    expect(valueOf(['--note', 'n'], '--identifier')).toBeNull();
    expect(valueOf(['--identifier', 'a', '--identifier', 'b'], '--identifier')).toBe('a');
  });

  it('refuses a missing value or an option in its place', () => {
    expect(messageOf(() => valueOf(['--identifier'], '--identifier'))).toBe(
      '--identifier needs a value',
    );
    expect(messageOf(() => valueOf(['--identifier', '--add'], '--identifier'))).toBe(
      '--identifier needs a value',
    );
  });
});

describe('databaseHost and assertWriteTarget (unchanged)', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('databaseHost gives the host of DATABASE_URL, never its credentials', () => {
    vi.stubEnv('DATABASE_URL', 'postgres://gebruiker:wachtwoord@db.example.invalid:5432/neondb');
    expect(databaseHost()).toBe('db.example.invalid:5432');
    vi.stubEnv('DATABASE_URL', 'not a url');
    expect(databaseHost()).toBe('unparseable');
    vi.stubEnv('DATABASE_URL', '');
    expect(databaseHost()).toBeNull();
  });

  it('assertWriteTarget needs --expect-host equal to the host for Neon, nothing for PGlite', () => {
    expect(messageOf(() => assertWriteTarget('pglite', null, null))).toBe('ok');
    expect(messageOf(() => assertWriteTarget('neon-http', 'db.example', 'db.example'))).toBe('ok');
    expect(messageOf(() => assertWriteTarget('neon-http', 'db.example', null))).toContain(
      '--expect-host is required',
    );
    expect(messageOf(() => assertWriteTarget('neon-http', 'db.example', 'other.example'))).toBe(
      '--expect-host does not match DATABASE_URL host; nothing changed',
    );
  });
});

describe('describeError', () => {
  it('prints the message, every cause with its code, and the call site', () => {
    const driver = Object.assign(new Error('relation "x" does not exist'), { code: '42P01' });
    driver.name = 'NeonDbError';
    const query = new Error('Failed query: select 1', { cause: driver });
    const text = describeError(query, 2);
    expect(text).toContain('Failed query: select 1');
    expect(text).toContain('cause: NeonDbError: relation "x" does not exist (code 42P01)');
    expect(text).toContain('at:');
    expect(describeError('plain string')).toBe('plain string');
    expect(describeError(new Error('no cause'))).not.toContain('cause:');
  });
});
