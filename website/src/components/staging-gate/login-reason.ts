import { GATE_COPY } from '@/lib/staging-gate/form-state';
import { GATE_REASONS, type GateReason } from '@/lib/staging-gate/policy';

/**
 * The status line the gate's login page shows for `?reden=`. Pure and
 * client-safe. Only the two values the gate itself sets are understood
 * (`verlopen` from the middleware, `afgemeld` from the logout action);
 * anything else, a repeated parameter included, shows nothing, so the URL can
 * never put arbitrary text on the page. Design: `docs/staging-gate.md` §3.
 */
const REASON_MESSAGES: Record<GateReason, string> = {
  verlopen: GATE_COPY.expired,
  afgemeld: GATE_COPY.loggedOut,
};

function isGateReason(value: string): value is GateReason {
  return (GATE_REASONS as readonly string[]).includes(value);
}

export function gateReasonMessage(value: unknown): string | null {
  if (typeof value !== 'string' || !isGateReason(value)) return null;
  return REASON_MESSAGES[value];
}
