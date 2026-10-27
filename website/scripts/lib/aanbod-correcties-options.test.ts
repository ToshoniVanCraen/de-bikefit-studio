import { describe, expect, it } from 'vitest';
import { assertCorrectiesTarget, parseCorrectiesOptions } from './aanbod-correcties-options.mjs';

/**
 * The options of `cms:patch-aanbod-correcties`: the default is unchanged (a dry run
 * that takes Toshoni's offerings away), `--staging-retain-toshoni` (staging only,
 * 27 Oct 2026) is a bare flag, never next to `--restore`, and bound to its host on
 * Neon for the dry run as well as the apply.
 */

/** Looks like a password pasted in the wrong place. Test-only, never a real credential. */
const SECRET = 'Kluis-Geheim-2026';
const HOST = 'ep-staging.example.invalid';

/** The error message of `run`, or `'ok'` when it does not throw. */
function messageOf(run: () => unknown): string {
  try {
    run();
    return 'ok';
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
}

describe('parseCorrectiesOptions', () => {
  it('without options: a dry run that takes Toshoni’s offerings away, as before', () => {
    expect(parseCorrectiesOptions([])).toEqual({
      apply: false,
      restore: null,
      expectHost: null,
      backupDir: '.rollout-backups',
      providerMode: 'remove',
    });
    expect(
      parseCorrectiesOptions(['--apply', '--expect-host', HOST, '--backup-dir=/tmp/b']),
    ).toEqual({
      apply: true,
      restore: null,
      expectHost: HOST,
      backupDir: '/tmp/b',
      providerMode: 'remove',
    });
  });

  it('--staging-retain-toshoni keeps him, for the dry run and for the apply', () => {
    expect(
      parseCorrectiesOptions(['--staging-retain-toshoni', '--expect-host', HOST]),
    ).toMatchObject({ apply: false, providerMode: 'staging-retain', expectHost: HOST });
    expect(
      parseCorrectiesOptions([
        '--apply',
        '--staging-retain-toshoni',
        `--expect-host=${HOST}`,
        '--backup-dir',
        'b',
      ]),
    ).toMatchObject({ apply: true, providerMode: 'staging-retain', backupDir: 'b' });
  });

  it('the flag and --apply take no value, in either form, and the value is never shown', () => {
    for (const [args, expected] of [
      [
        [`--staging-retain-toshoni=${SECRET}`],
        '--staging-retain-toshoni takes no value (value not shown)',
      ],
      [['--staging-retain-toshoni='], '--staging-retain-toshoni takes no value (value not shown)'],
      [['--apply=no'], '--apply takes no value (value not shown)'],
      // A word after the flag is not its value: "false" would otherwise switch it on.
      [['--staging-retain-toshoni', 'false'], 'unexpected argument #2 (value not shown)'],
      [['--apply', SECRET], 'unexpected argument #2 (value not shown)'],
    ] as const) {
      const message = messageOf(() => parseCorrectiesOptions([...args]));
      expect(message, args.join(' ')).toBe(expected);
      expect(message).not.toContain(SECRET);
    }
  });

  it('refuses the flag next to --restore (a restore takes no mode), and --apply next to --restore', () => {
    expect(
      messageOf(() =>
        parseCorrectiesOptions(['--restore', 'backup.json', '--staging-retain-toshoni']),
      ),
    ).toBe(
      '--staging-retain-toshoni and --restore cannot be combined: a restore takes no mode, it puts back what its backup lists',
    );
    expect(messageOf(() => parseCorrectiesOptions(['--apply', '--restore=backup.json']))).toBe(
      '--apply and --restore cannot be combined',
    );
    expect(parseCorrectiesOptions(['--restore', 'backup.json'])).toMatchObject({
      restore: 'backup.json',
      providerMode: 'remove',
    });
  });

  it('refuses an unknown option, or a misspelt flag, by position only', () => {
    for (const arg of ['--staging-retain', '--retain-toshoni', `--${SECRET}`]) {
      const message = messageOf(() => parseCorrectiesOptions(['--apply', arg]));
      expect(message).toBe('unknown option #2 (name and value not shown)');
      expect(message).not.toContain(SECRET);
    }
  });
});

describe('assertCorrectiesTarget', () => {
  const dry = parseCorrectiesOptions([]);
  const retainDry = parseCorrectiesOptions(['--staging-retain-toshoni']);

  it('a dry run without the flag needs no host, as before; PGlite never does', () => {
    expect(messageOf(() => assertCorrectiesTarget(dry, 'neon-http', HOST))).toBe('ok');
    expect(messageOf(() => assertCorrectiesTarget(retainDry, 'pglite', null))).toBe('ok');
    expect(
      messageOf(() => assertCorrectiesTarget({ ...retainDry, apply: true }, 'pglite', null)),
    ).toBe('ok');
  });

  it('a dry run with the flag on Neon needs --expect-host, equal to the DATABASE_URL host', () => {
    expect(messageOf(() => assertCorrectiesTarget(retainDry, 'neon-http', HOST))).toBe(
      `--staging-retain-toshoni needs --expect-host on Neon, for the dry run too; this DATABASE_URL points at ${HOST}`,
    );
    expect(
      messageOf(() =>
        assertCorrectiesTarget(
          { ...retainDry, expectHost: 'ep-production.example.invalid' },
          'neon-http',
          HOST,
        ),
      ),
    ).toBe('--expect-host does not match DATABASE_URL host; nothing changed');
    expect(
      messageOf(() =>
        assertCorrectiesTarget({ ...retainDry, expectHost: HOST }, 'neon-http', HOST),
      ),
    ).toBe('ok');
  });

  it('a write to Neon needs it with or without the flag, as before', () => {
    for (const options of [
      parseCorrectiesOptions(['--apply']),
      parseCorrectiesOptions(['--apply', '--staging-retain-toshoni']),
      parseCorrectiesOptions(['--restore', 'backup.json']),
    ]) {
      expect(messageOf(() => assertCorrectiesTarget(options, 'neon-http', HOST))).toContain(
        '--expect-host is required',
      );
      expect(
        messageOf(() =>
          assertCorrectiesTarget({ ...options, expectHost: HOST }, 'neon-http', HOST),
        ),
      ).toBe('ok');
    }
  });
});
