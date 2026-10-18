/**
 * Where and when the staging access gate is on — pure, runtime-neutral (no
 * `process.env`, no Next, no Node APIs), so the edge middleware, the Node side
 * (login action, health route, CLI) and the unit tests all ask the same
 * function. Design: `docs/staging-gate.md` §1.
 *
 * Three answers:
 *  - `inactive`: the request is not for {@link STAGING_GATE_HOST}. Nothing
 *    changes for that request, whatever the configuration says.
 *  - `misconfigured`: it IS the staging host, but the deployment is not the
 *    staging branch, or a secret or the database URL is missing or malformed.
 *    The caller fails closed (503) and logs the reason codes, never values.
 *  - `active`: the gate applies with the validated configuration.
 *
 * The caller passes the raw values; an empty string counts as unset, like
 * `src/lib/env.ts` treats `FOO=""`.
 */

export const STAGING_GATE_HOST = 'staging.debikefitstudio.be';

/** Both secrets must be at least this long (`openssl rand -base64 48` gives 64). */
export const GATE_MIN_SECRET_LENGTH = 32;

export type GateInput = {
  /** `req.nextUrl.hostname` (edge) or the `host` header (Node); port and case are ignored. */
  hostname: string | null | undefined;
  vercelEnv?: string | null;
  gitRef?: string | null;
  secret?: string | null;
  healthToken?: string | null;
  databaseUrl?: string | null;
};

export type GateMisconfigReason =
  'vercel_env' | 'git_ref' | 'secret' | 'health_token' | 'database_url';

export type GateConfig = {
  secret: string;
  healthToken: string;
  databaseUrl: string;
};

export type GateResolution =
  | { kind: 'inactive' }
  | { kind: 'misconfigured'; reasons: GateMisconfigReason[] }
  | { kind: 'active'; config: GateConfig };

/** `Staging.DeBikefitStudio.be:443.` → `staging.debikefitstudio.be`; null for nothing usable. */
export function normalizeHostname(value: string | null | undefined): string | null {
  if (typeof value !== 'string') return null;
  let host = value.trim().toLowerCase();
  if (host === '') return null;
  // `[::1]:3000` → `[::1]`, `example.com:443` → `example.com`.
  const bracketed = /^(\[[^\]]+\])(?::\d+)?$/.exec(host);
  if (bracketed) host = bracketed[1];
  else host = host.replace(/:\d+$/, '');
  if (host.endsWith('.')) host = host.slice(0, -1);
  return host === '' ? null : host;
}

/** True only for the one host the gate protects. */
export function isStagingGateHost(hostname: string | null | undefined): boolean {
  return normalizeHostname(hostname) === STAGING_GATE_HOST;
}

function present(value: string | null | undefined): string | null {
  return typeof value === 'string' && value !== '' ? value : null;
}

function isPostgresUrl(value: string): boolean {
  return /^postgres(ql)?:\/\/\S+$/i.test(value);
}

/**
 * The gate's decision for one request. Every condition is checked, so the log
 * line names everything that is wrong at once.
 */
export function resolveStagingGate(input: GateInput): GateResolution {
  if (!isStagingGateHost(input.hostname)) return { kind: 'inactive' };

  const reasons: GateMisconfigReason[] = [];
  if (present(input.vercelEnv) !== 'preview') reasons.push('vercel_env');
  if (present(input.gitRef) !== 'staging') reasons.push('git_ref');

  const secret = present(input.secret);
  const healthToken = present(input.healthToken);
  const databaseUrl = present(input.databaseUrl);

  if (!secret || secret.length < GATE_MIN_SECRET_LENGTH) reasons.push('secret');
  if (!healthToken || healthToken.length < GATE_MIN_SECRET_LENGTH || healthToken === secret) {
    reasons.push('health_token');
  }
  if (!databaseUrl || !isPostgresUrl(databaseUrl)) reasons.push('database_url');

  if (reasons.length > 0 || !secret || !healthToken || !databaseUrl) {
    return { kind: 'misconfigured', reasons };
  }
  return { kind: 'active', config: { secret, healthToken, databaseUrl } };
}
