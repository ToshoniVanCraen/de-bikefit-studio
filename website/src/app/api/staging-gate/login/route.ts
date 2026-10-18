import { NextResponse } from 'next/server';

import { PasswordHasherBusyError } from '@/lib/cms/password';
import { clientIpFromHeaders } from '@/lib/request-ip';
import { gateCookieOptions, parseGateLoginForm } from '@/lib/staging-gate/auth';
import { performGateLogin } from '@/lib/staging-gate/auth-repo';
import { currentGateResolution } from '@/lib/staging-gate/auth-server';
import { boundedGateLoginForm, sameOriginGateLoginPost } from '@/lib/staging-gate/login-request';
import {
  GATE_ABSOLUTE_LIFETIME_MS,
  GATE_LOGIN_PATH,
  safeReturnPath,
} from '@/lib/staging-gate/policy';
import { GATE_COOKIE_NAME } from '@/lib/staging-gate/token';

/**
 * The only anonymous write on the staging host. A dedicated Route Handler is
 * essential: an anonymous Server Action POST to a public page can forward and
 * execute a different page's action in Next 16. The middleware permits POST
 * here, but blocks every POST to `/staging-toegang` itself.
 */
export const dynamic = 'force-dynamic';

const RESPONSE_HEADERS = { 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex, nofollow' };

type Failure = 'ongeldig' | 'limiet' | 'ontbreekt' | 'druk' | 'mislukt';

function loginRedirect(failure: Failure, next: unknown): NextResponse {
  const params = new URLSearchParams({ fout: failure });
  const target = safeReturnPath(next, '');
  if (target) params.set('next', target);
  return new NextResponse(null, {
    status: 303,
    headers: { ...RESPONSE_HEADERS, Location: `${GATE_LOGIN_PATH}?${params}` },
  });
}

export async function POST(request: Request): Promise<Response> {
  const resolution = await currentGateResolution();
  if (resolution.kind !== 'active') {
    return NextResponse.json(
      { code: resolution.kind === 'inactive' ? 'not_found' : 'gate_misconfigured' },
      { status: resolution.kind === 'inactive' ? 404 : 503, headers: RESPONSE_HEADERS },
    );
  }
  // A Server Action request must never be accepted by this public endpoint.
  if (request.headers.has('next-action') || !sameOriginGateLoginPost(request)) {
    return NextResponse.json(
      { code: 'gate_auth_failed' },
      { status: 403, headers: RESPONSE_HEADERS },
    );
  }
  const form = await boundedGateLoginForm(request);
  if (!form) {
    return NextResponse.json(
      { code: 'gate_invalid_request' },
      { status: 413, headers: RESPONSE_HEADERS },
    );
  }
  const parsed = parseGateLoginForm(form);
  if (!parsed.ok) return loginRedirect('ontbreekt', form.get('next'));

  try {
    const outcome = await performGateLogin({
      input: parsed.input,
      ip: clientIpFromHeaders(request.headers),
      secret: resolution.config.secret,
    });
    if (outcome.kind === 'too_many') return loginRedirect('limiet', parsed.input.next);
    if (outcome.kind === 'invalid') return loginRedirect('ongeldig', parsed.input.next);

    const response = new NextResponse(null, {
      status: 303,
      headers: { ...RESPONSE_HEADERS, Location: parsed.input.next },
    });
    response.cookies.set(
      GATE_COOKIE_NAME,
      outcome.cookieValue,
      gateCookieOptions(GATE_ABSOLUTE_LIFETIME_MS / 1000),
    );
    return response;
  } catch (error) {
    if (error instanceof PasswordHasherBusyError) return loginRedirect('druk', parsed.input.next);
    // A query error may contain bound values; log a fixed code only.
    console.error('[staging-gate] login_failed');
    return loginRedirect('mislukt', parsed.input.next);
  }
}
