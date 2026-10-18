'use client';

import { usePathname } from 'next/navigation';
import { useSyncExternalStore } from 'react';
import { useFormStatus } from 'react-dom';

import { gateLogoutAction } from '@/lib/staging-gate/actions';
import { GATE_COPY } from '@/lib/staging-gate/form-state';

import { shouldShowGateBanner } from './banner-policy';

/**
 * "Stagingomgeving · Uitloggen": a slim bar at the top of every page on the
 * staging host (`docs/staging-gate.md` §3). UI only; the gate itself is the
 * middleware.
 *
 * The hostname is read through `useSyncExternalStore` with a `null` server
 * snapshot: the server (and the hydration pass) render nothing, the client
 * then decides with `window.location.hostname`, so there is no hydration
 * mismatch and no other host ever sees it. `usePathname()` keeps the decision
 * current across client navigations (after logout the router lands on the
 * login page, where the bar must disappear).
 *
 * In the document flow, not fixed: the consent banner owns the bottom edge
 * and the Studio header is sticky at the top, so a fixed bar would cover one
 * of them. Outside `.studio-root`, hence the `@theme` utilities
 * (`bg-ds-*`, `text-ds-*`) rather than the `--ds-color-*` tier.
 */

const subscribeNever = () => () => {};
const clientHostname = () => window.location.hostname;
const serverHostname = () => null;

export function StagingGateBanner() {
  const hostname = useSyncExternalStore(subscribeNever, clientHostname, serverHostname);
  const pathname = usePathname();
  if (hostname === null || !shouldShowGateBanner(hostname, pathname ?? '')) return null;

  return (
    <div
      role="region"
      aria-label={GATE_COPY.title}
      className="border-b border-ds-burgundy-900 bg-ds-surface-inverse text-ds-fg-inverse print:hidden"
    >
      <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-3 px-4 py-1.5 font-ds-body text-sm">
        <p className="font-ds-display font-bold tracking-[0.08em] uppercase">{GATE_COPY.title}</p>
        <form action={gateLogoutAction}>
          <LogoutButton />
        </form>
      </div>
    </div>
  );
}

function LogoutButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      aria-disabled={pending}
      className="min-h-9 cursor-pointer border border-ds-fg-inverse px-3 py-1 font-semibold transition-colors hover:bg-ds-fg-inverse hover:text-ds-surface-inverse focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ds-fg-inverse disabled:cursor-wait disabled:opacity-70"
    >
      {GATE_COPY.logout}
    </button>
  );
}
