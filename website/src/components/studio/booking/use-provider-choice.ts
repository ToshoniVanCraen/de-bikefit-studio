import { useState } from 'react';
import { resolveProviderStep, type ProviderChoice } from './provider-choice';
import type { BookingProviderOption } from './types';

/**
 * The visitor's answer to "Bij wie?", kept out of the (already long) widget
 * (27 Oct 2026). What the answer means, and whether the step is shown at all,
 * is `resolveProviderStep()`. `reopened` is "Wijzigen": the step must stay
 * while the visitor chooses again, even for a service only one provider offers.
 */
export function useProviderChoice({
  providers,
  showChoice,
  serviceId,
}: {
  providers: readonly BookingProviderOption[];
  showChoice: boolean;
  /** The chosen service, `null` while there is none. */
  serviceId: string | null;
}) {
  const [choice, setChoice] = useState<ProviderChoice | undefined>(undefined);
  const [reopened, setReopened] = useState(false);

  return {
    ...resolveProviderStep({ providers, showChoice, serviceId, choice, reopened }),
    /** `undefined` while nothing has been chosen yet; `null` is "Iedereen". */
    choice,
    select(next: ProviderChoice) {
      setChoice(next);
      setReopened(false);
    },
    /** "Wijzigen": back to the question. */
    edit() {
      setChoice(undefined);
      setReopened(true);
    },
    /** "Opnieuw": as on arrival. */
    reset() {
      setChoice(undefined);
      setReopened(false);
    },
  };
}
