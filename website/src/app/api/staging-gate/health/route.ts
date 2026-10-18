import { env } from '@/lib/env';
import { resolveStagingGate } from '@/lib/staging-gate/config';
import { decideHealthAccess, healthProbeResult } from '@/lib/staging-gate/health';
import { GATE_HEALTH_HEADER } from '@/lib/staging-gate/policy';
import { checkGateDatabase, createNeonExecutor } from '@/lib/staging-gate/store-edge';

/**
 * Machine health check for the staging host (Arend's `site-health`), token
 * only, never a cookie: `docs/staging-gate.md` §2 step 3. The middleware has
 * already checked the token; this handler re-verifies it on the Node side.
 * GET and HEAD only; Next answers 405 for any other method.
 */

// Every call must read this request's host and token and probe the database; never cached.
export const dynamic = 'force-dynamic';

const NO_STORE = { 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex, nofollow' };

function reply(status: number, body: unknown): Response {
  if (body === null) return new Response(null, { status, headers: NO_STORE });
  return Response.json(body, { status, headers: NO_STORE });
}

export async function GET(request: Request): Promise<Response> {
  const resolution = resolveStagingGate({
    hostname: request.headers.get('host'),
    vercelEnv: env.VERCEL_ENV,
    gitRef: env.VERCEL_GIT_COMMIT_REF,
    secret: env.STAGING_GATE_SECRET,
    healthToken: env.STAGING_GATE_HEALTH_TOKEN,
    databaseUrl: env.DATABASE_URL,
  });
  const access = decideHealthAccess(resolution, request.headers.get(GATE_HEALTH_HEADER));
  if (access.kind === 'respond') return reply(access.status, access.body);

  const databaseOk = await checkGateDatabase(createNeonExecutor(access.config.databaseUrl)).catch(
    () => false,
  );
  const result = healthProbeResult(databaseOk);
  return reply(result.status, result.body);
}

export async function HEAD(request: Request): Promise<Response> {
  const response = await GET(request);
  return new Response(null, { status: response.status, headers: response.headers });
}
