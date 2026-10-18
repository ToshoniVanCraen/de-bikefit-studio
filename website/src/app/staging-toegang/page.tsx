import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';

import { FLASH_TONES } from '@/components/admin/tones';
import { gateReasonMessage } from '@/components/staging-gate/login-reason';
import { currentGateResolution, currentGateSessionValid } from '@/lib/staging-gate/auth-server';
import { GATE_COPY, gateLoginFailureMessage } from '@/lib/staging-gate/form-state';
import { safeReturnPath } from '@/lib/staging-gate/policy';

import { GateFrame } from './gate-frame';
import { GateLoginForm } from './login-form';

/**
 * The staging gate's sign-in page (`docs/staging-gate.md` §3). Public on the
 * staging host (the middleware lets this exact path through), 404 on every
 * other host. A visitor who still holds a valid gate session is sent on to
 * the return path instead of seeing the form again.
 */

// Every request reads the host header (is the gate active here?), the gate
// cookie and the database (is that session still valid?); nothing about this
// page may be prerendered or cached.
export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: GATE_COPY.title,
    robots: { index: false, follow: false },
  };
}

export default async function StagingGateLoginPage({
  searchParams,
}: {
  searchParams: Promise<{
    next?: string | string[];
    reden?: string | string[];
    fout?: string | string[];
  }>;
}) {
  const resolution = await currentGateResolution();
  if (resolution.kind !== 'active') notFound();

  const { next, reden, fout } = await searchParams;
  // Arrays (`?next=a&next=b`), off-origin, malformed and loop targets → `/`.
  const returnPath = safeReturnPath(next, '/');
  if (await currentGateSessionValid()) redirect(returnPath);

  const notice = gateReasonMessage(reden);

  return (
    <GateFrame title={GATE_COPY.title}>
      <p className="mt-3 mb-5 text-sm text-muted-foreground">{GATE_COPY.explanation}</p>

      {notice ? (
        <p role="status" className={`mb-5 px-3 py-2 text-sm ${FLASH_TONES.info}`}>
          {notice}
        </p>
      ) : null}

      <GateLoginForm next={returnPath} errorMessage={gateLoginFailureMessage(fout)} />

      <p className="mt-6 text-sm text-muted-foreground">{GATE_COPY.help}</p>
      <p className="mt-2 text-xs text-muted-foreground">{GATE_COPY.cmsDistinction}</p>
    </GateFrame>
  );
}
