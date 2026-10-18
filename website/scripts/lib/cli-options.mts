/**
 * Option parsing and the write-target guard shared by the CLIs that write to
 * an existing database (`cms:rollout-aanbod`, `cms:patch-booking-cta`,
 * `cms:patch-page-cleanup`, `cms:migrate-aanbod`, `cms:mfa-reset`,
 * `staging:access`). Unit tests: `./cli-options.test.ts`.
 *
 * The guards never repeat an unknown argument or an argument's value in an
 * error: either may be a secret pasted in the wrong place. An unknown option
 * is identified only by its position.
 */

/** Value of `--flag value` or `--flag=value`; null when the flag is absent. */
export function valueOf(args: string[], flag: string): string | null {
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === flag) {
      const value = args[index + 1];
      if (value === undefined || value.startsWith('--')) throw new Error(`${flag} needs a value`);
      return value;
    }
    if (arg.startsWith(`${flag}=`)) return arg.slice(flag.length + 1);
  }
  return null;
}

/** `--flag` and `--flag=value` both give `--flag`. */
function optionName(arg: string): string {
  const equals = arg.indexOf('=');
  return equals === -1 ? arg : arg.slice(0, equals);
}

/** Refuses any `--option` not in `known`; no part of it is ever shown. */
export function rejectUnknownOptions(args: string[], known: readonly string[]): void {
  args.forEach((arg, index) => {
    if (!arg.startsWith('--')) return;
    const name = optionName(arg);
    if (known.includes(name)) return;
    throw new Error(`unknown option #${index + 1} (name and value not shown)`);
  });
}

/** Refuses `--flag=value` for the options in `flags`, which take no value (the value is never shown). */
export function rejectBooleanFlagValues(args: string[], flags: readonly string[]): void {
  for (const arg of args) {
    const name = optionName(arg);
    if (arg.startsWith('--') && name !== arg && flags.includes(name)) {
      throw new Error(`${name} takes no value (value not shown)`);
    }
  }
}

/**
 * Refuses an argument that is neither an option nor the value of one of
 * `valueFlags` (`--flag value`; `--flag=value` carries its own and consumes
 * nothing; a value never starts with `--`, as in {@link valueOf}). Reported
 * by position only: a stray word may be a secret pasted in the wrong place.
 */
export function rejectPositionals(args: string[], valueFlags: readonly string[]): void {
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (!arg.startsWith('--')) {
      throw new Error(`unexpected argument #${index + 1} (value not shown)`);
    }
    const next = args[index + 1];
    if (valueFlags.includes(arg) && next !== undefined && !next.startsWith('--')) index += 1;
  }
}

/** Host part of DATABASE_URL — never the credentials. */
export function databaseHost(): string | null {
  const url = process.env.DATABASE_URL;
  if (!url) return null;
  try {
    return new URL(url).host;
  } catch {
    return 'unparseable';
  }
}

/**
 * A write to Neon needs `--expect-host` equal to the DATABASE_URL host, so a
 * wrong branch (e.g. production) is refused before anything is read.
 */
export function assertWriteTarget(
  driver: string,
  host: string | null,
  expectHost: string | null,
): void {
  if (driver !== 'neon-http') return;
  if (!expectHost) {
    throw new Error(
      `--expect-host is required to write to Neon; this DATABASE_URL points at ${host}`,
    );
  }
  if (expectHost !== host) {
    throw new Error('--expect-host does not match DATABASE_URL host; nothing changed');
  }
}
