/**
 * Vault-first passwords for `npm run staging:access -- --add / --reset-password
 * --password-stdin` (issue #18, `docs/staging-gate.md` §3–§4): the operator
 * creates the password in the secret store first and pipes it in, so it never
 * appears in argv, the environment, shell history or any output.
 *
 * Pure: the reader takes any async iterable of chunks (the CLI passes
 * `process.stdin` without an encoding, so the bytes arrive raw); nothing here
 * touches Node's stdin, the database or Next, and there is no `server-only`
 * (the CLI and the account core load it from plain Node).
 *
 * Rules, in order: at most {@link PASSWORD_STDIN_MAX_BYTES} bytes (reading
 * stops at the first chunk past the bound); strict UTF-8, where a byte order
 * mark is kept rather than dropped silently (and then refused); exactly one
 * trailing `\n` or `\r\n` is stripped (what `op read` and most secret-store
 * CLIs add) and nothing else, so leading and trailing spaces stay part of the
 * password; then not empty, no `\r` or `\n` left (one line only), no control
 * characters, and the CMS strength rules (`validatePasswordStrength()`).
 *
 * Every refusal is a stable code with a fixed sentence: no message here ever
 * contains a byte of the input. The `weak` sentence is the CMS's own Dutch
 * reason, which only names lengths and character classes.
 */
import { PASSWORD_MAX_LENGTH, validatePasswordStrength } from '@/lib/cms/password';

/**
 * Upper bound on what is read: {@link PASSWORD_MAX_LENGTH} characters of 4-byte
 * UTF-8 plus a `\r\n` (802 bytes). More than any password the strength rules
 * accept can take, so the bound never refuses a valid one.
 */
export const PASSWORD_STDIN_MAX_BYTES = PASSWORD_MAX_LENGTH * 4 + 2;

export type PasswordInputErrorCode =
  | 'unreadable'
  | 'oversized'
  | 'empty'
  | 'invalid_utf8'
  | 'multiline'
  | 'control_characters'
  | 'weak';

/** The fixed operator sentence of every code except `weak` (which carries the CMS reason). */
export const PASSWORD_INPUT_MESSAGES: Readonly<
  Record<Exclude<PasswordInputErrorCode, 'weak'>, string>
> = {
  unreadable: '--password-stdin: stdin could not be read',
  oversized: `--password-stdin: more than ${PASSWORD_STDIN_MAX_BYTES} bytes on stdin; pipe only the password`,
  empty: '--password-stdin: no password on stdin',
  invalid_utf8: '--password-stdin: stdin is not valid UTF-8',
  multiline:
    '--password-stdin: more than one line on stdin; pipe only the password (one trailing newline is fine)',
  control_characters:
    '--password-stdin: the password contains a control character or a byte order mark',
};

/** What the CLI prints when stdin is a terminal: the password must come from the secret store. */
export const PASSWORD_STDIN_TTY_REFUSAL =
  '--password-stdin: refusing to read a password from a terminal; pipe it from the secret store';

export type BoundedRead = { ok: true; bytes: Uint8Array } | { ok: false; code: 'oversized' };

export type ProvidedPasswordResult =
  { ok: true; password: string } | { ok: false; code: PasswordInputErrorCode; message: string };

/** One line only: what is left after the single trailing newline was stripped. */
const LINE_BREAK = /[\r\n]/;
/** C0 and C1 controls (Unicode `Cc`) and U+FEFF (byte order mark / zero-width no-break space). */
const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f-\u009f\ufeff]/;

function refused(code: Exclude<PasswordInputErrorCode, 'weak'>): ProvidedPasswordResult {
  return { ok: false, code, message: PASSWORD_INPUT_MESSAGES[code] };
}

/**
 * Stdin is acceptable unless it is a terminal: a password typed there would
 * not come from the vault (and could echo). The CLI passes `process.stdin.isTTY`,
 * which is `true` for a terminal and absent for a pipe, a file or `/dev/null`.
 */
export function passwordStdinSourceAllowed(isTTY: boolean | undefined): boolean {
  return isTTY !== true;
}

/**
 * All bytes of `source`, or `oversized` as soon as the total passes `maxBytes`:
 * the loop is left at that chunk, which closes the source (a stream is
 * destroyed), so the rest is never read. String chunks count as UTF-8. Errors
 * of the source propagate unchanged; {@link readProvidedPassword} turns them
 * into a fixed code.
 */
export async function readBoundedSource(
  source: AsyncIterable<Uint8Array | string>,
  maxBytes: number = PASSWORD_STDIN_MAX_BYTES,
): Promise<BoundedRead> {
  const encoder = new TextEncoder();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for await (const chunk of source) {
    const bytes = typeof chunk === 'string' ? encoder.encode(chunk) : chunk;
    total += bytes.byteLength;
    if (total > maxBytes) return { ok: false, code: 'oversized' };
    chunks.push(bytes);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return { ok: true, bytes };
}

/** Exactly one trailing `\r\n` or `\n`, nothing else (no trimming: spaces may be part of it). */
function stripOneTrailingNewline(text: string): string {
  if (text.endsWith('\r\n')) return text.slice(0, -2);
  if (text.endsWith('\n')) return text.slice(0, -1);
  return text;
}

/**
 * The rules for a password that is already text (the core of `staging:access`
 * applies them too, before any query): not empty, one line, no control
 * characters, the CMS strength rules. The password is returned as given, not
 * normalised (`hashPassword()` applies NFKC itself).
 */
export function checkProvidedPassword(password: string): ProvidedPasswordResult {
  if (password.length === 0) return refused('empty');
  if (LINE_BREAK.test(password)) return refused('multiline');
  if (CONTROL_CHARACTERS.test(password)) return refused('control_characters');
  const weak = validatePasswordStrength(password);
  if (weak !== null) return { ok: false, code: 'weak', message: weak };
  return { ok: true, password };
}

/** The password in `bytes` (strict UTF-8, one trailing newline stripped), or a refusal. */
export function parseProvidedPassword(bytes: Uint8Array): ProvidedPasswordResult {
  let text: string;
  try {
    // fatal: malformed UTF-8 is refused, never replaced; ignoreBOM: a leading
    // U+FEFF stays in the text (refused as a control character), not dropped.
    text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes);
  } catch {
    return refused('invalid_utf8');
  }
  return checkProvidedPassword(stripOneTrailingNewline(text));
}

/**
 * {@link readBoundedSource} then {@link parseProvidedPassword}: what the CLI
 * calls with `process.stdin`. A failing source (EISDIR, EIO, …) is `unreadable`;
 * its error is dropped, so nothing from it reaches a message.
 */
export async function readProvidedPassword(
  source: AsyncIterable<Uint8Array | string>,
  maxBytes: number = PASSWORD_STDIN_MAX_BYTES,
): Promise<ProvidedPasswordResult> {
  let read: BoundedRead;
  try {
    read = await readBoundedSource(source, maxBytes);
  } catch {
    return refused('unreadable');
  }
  return read.ok ? parseProvidedPassword(read.bytes) : refused(read.code);
}
