import { isStagingGateHost } from './config';

/**
 * Request validation for the dedicated anonymous login POST. Kept separate
 * from the Next route so both origin and body-size boundaries can be tested
 * without a database or the framework action runtime.
 */

// A 2048-character safe return URL and the bounded identifier/password can
// expand when URL-encoded (UTF-8 bytes become %HH triples). 32 KiB covers the
// valid maximum while still capping an unauthenticated request.
export const MAX_GATE_LOGIN_BODY_BYTES = 32 * 1024;

export function sameOriginGateLoginPost(request: Request): boolean {
  const origin = request.headers.get('origin');
  if (!origin || !isStagingGateHost(request.headers.get('host'))) return false;
  try {
    const parsed = new URL(origin);
    // Origin is scheme + host + port, not just hostname: a different port is
    // cross-origin even if it spells the same staging hostname.
    return parsed.origin === 'https://staging.debikefitstudio.be';
  } catch {
    return false;
  }
}

export async function boundedGateLoginForm(request: Request): Promise<URLSearchParams | null> {
  const type = request.headers.get('content-type')?.split(';', 1)[0].trim().toLowerCase();
  if (type !== 'application/x-www-form-urlencoded') return null;
  const declared = Number(request.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > MAX_GATE_LOGIN_BODY_BYTES) return null;
  if (!request.body) return new URLSearchParams();

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_GATE_LOGIN_BODY_BYTES) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return new URLSearchParams(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  } catch {
    return null;
  }
}
