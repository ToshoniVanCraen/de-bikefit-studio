import type { BookingProviderOption, BookingServiceOption } from './types';

/**
 * "Bij wie?" as plain data (27 Oct 2026, Toshoni): who can take the chosen
 * service, whether the step is worth showing and which provider the free
 * moments and the booking are for. Pure; tested in `provider-choice.test.ts`.
 * The visitor's answer lives in `use-provider-choice.ts`.
 *
 * The step exists to choose between providers. When one provider offers the
 * chosen service, or the studio has only one, there is nothing to choose: the
 * step is left out and everything is for that provider, so the visitor goes
 * from the service (and its extras) straight to the moment. A visitor who has
 * answered keeps the step, whatever service follows.
 */

/** `null` is "Iedereen": whoever is free; the beheerder assigns afterwards. */
export type ProviderChoice = string | null;

export function offersService(provider: BookingProviderOption, serviceId: string): boolean {
  return provider.services.some((entry) => entry.serviceId === serviceId);
}

export function providerById(
  providers: readonly BookingProviderOption[],
  id: string | null | undefined,
): BookingProviderOption | null {
  return id ? (providers.find((provider) => provider.id === id) ?? null) : null;
}

/** The providers who offer the service; every provider while none is chosen. */
export function providersFor(
  providers: readonly BookingProviderOption[],
  serviceId: string | null,
): BookingProviderOption[] {
  return serviceId
    ? providers.filter((provider) => offersService(provider, serviceId))
    : [...providers];
}

/** The services a provider offers; every service for "Iedereen" (no provider). */
export function servicesOf(
  services: readonly BookingServiceOption[],
  provider: BookingProviderOption | null,
): BookingServiceOption[] {
  return provider
    ? services.filter((service) => offersService(provider, service.id))
    : [...services];
}

export type ProviderStep = {
  /** The options of the step: who can take the chosen service (everyone while none is chosen). */
  candidates: BookingProviderOption[];
  /** "Bij wie?" is a step of the flow. */
  hasStep: boolean;
  /** … and it waits for the visitor's answer. */
  open: boolean;
  /** The provider the visitor picked (who also narrows the services); `null` = "Iedereen" or no answer. */
  picked: BookingProviderOption | null;
  /**
   * Who the free moments and the booking are for: the pick, else the only
   * provider who can take the service; `null` = "Iedereen" (several can).
   */
  providerId: string | null;
};

export function resolveProviderStep(input: {
  providers: readonly BookingProviderOption[];
  /** The block and Beheer → Instellingen both allow the choice. */
  showChoice: boolean;
  /** The chosen service, `null` while there is none. */
  serviceId: string | null;
  /** The visitor's answer; `undefined` = not asked yet, or "Wijzigen" cleared it. */
  choice: ProviderChoice | undefined;
  /** "Wijzigen" was pressed and the step is not answered again yet: it stays open. */
  reopened: boolean;
}): ProviderStep {
  const { providers, showChoice, serviceId, choice, reopened } = input;
  const candidates = providersFor(providers, serviceId);
  const answered = choice !== undefined || reopened;
  const hasStep = showChoice && (answered || candidates.length > 1);
  const picked = providerById(providers, choice);
  const only = candidates.length === 1 ? candidates[0].id : null;
  return {
    candidates,
    hasStep,
    open: hasStep && choice === undefined,
    picked,
    providerId: picked?.id ?? only,
  };
}

/** The done-state line of "Bij wie?". */
export function providerSummary(
  choice: ProviderChoice | undefined,
  providers: readonly BookingProviderOption[],
): string {
  return choice === null ? 'Iedereen' : (providerById(providers, choice)?.name ?? '');
}
