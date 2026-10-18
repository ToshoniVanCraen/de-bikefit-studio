import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { SubmitButton } from '@/components/admin/form';
import { gateLogoutAction } from '@/lib/staging-gate/actions';
import { currentGateResolution } from '@/lib/staging-gate/auth-server';
import { GATE_COPY } from '@/lib/staging-gate/form-state';

import { GateFrame } from '../gate-frame';

/**
 * The staging gate's logout page (`docs/staging-gate.md` §3). Not public: the
 * middleware only lets a visitor with a valid gate session reach it. Logging
 * out is a POST (a server action), never a GET, so a link, a prefetch or an
 * image tag cannot end anyone's session. 404 on every host without the gate.
 */

// Reads the host header on every request (is the gate active here?) behind a
// per-request session check; nothing about this page may be cached.
export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: GATE_COPY.title,
    robots: { index: false, follow: false },
  };
}

export default async function StagingGateLogoutPage() {
  const resolution = await currentGateResolution();
  if (resolution.kind !== 'active') notFound();

  return (
    <GateFrame title={GATE_COPY.title}>
      <form action={gateLogoutAction} className="mt-6">
        <SubmitButton size="lg" className="h-11 w-full text-base">
          {GATE_COPY.logout}
        </SubmitButton>
      </form>
      <p className="mt-6 text-sm">
        <Link href="/" className="underline underline-offset-4">
          Terug naar de website
        </Link>
      </p>
    </GateFrame>
  );
}
