'use client';

import { useEffect, useRef, useState } from 'react';
import { bookAction } from '@/lib/booking/public-actions';
import { formatDuration, formatPrice } from '@/lib/booking/format';
import { AddonStep } from './addon-step';
import { Confirmation } from './confirmation';
import {
  addDays,
  addMonths,
  instantToTime,
  instantToYmd,
  monthOf,
  shortDate,
  type Ym,
  type Ymd,
} from './dates';
import {
  EMPTY_DETAILS,
  fieldOrder,
  formFieldFor,
  toBookInput,
  validateDetails,
  type DetailsField,
  type DetailsMode,
  type DetailsValues,
} from './details';
import { DetailsForm } from './details-form';
import {
  filterSlotsByLocation,
  locationsForService,
  normalizeLocationSelection,
} from './location-choice';
import { ProviderPicker, type ProviderChoice } from './provider-picker';
import { narrowChoices, serviceSummary } from './service-choice';
import { ServicePicker } from './service-picker';
import { groupDaySlots, slotLocationIds } from './slot-grouping';
import { StepItem, type BookingStep as Step, type StepState } from './step-item';
import { useBookingAddons } from './use-booking-addons';
import { useMonthAvailability } from './use-month-availability';
import { useServiceChoice } from './use-service-choice';
import { WhenPanel } from './when-panel';
import {
  PENDING_PROVIDER_TEXT,
  type BookActionResult,
  type BookingLocationOption,
  type BookingProviderOption,
  type BookingServiceOption,
  type BookingSlot,
  type BookingWidgetProps,
} from './types';

/**
 * The public booking flow:
 *
 *   (aanbieder of "Iedereen") → dienst → (extra's) → dag in de maandkalender →
 *   uur → gegevens → bevestiging
 *
 * The current step is *derived* from what has been chosen, never stored, so
 * "Wijzigen" on an earlier step is just clearing that choice. Availability is
 * fetched per (service, extras, provider, month) through `availabilityAction`
 * (`use-month-availability.ts`) and kept in a small in-memory cache.
 *
 * Bij wie (17 Oct 2026): a specific provider narrows the services to what
 * they offer and the calendar to their agenda. "Iedereen" shows every free
 * moment, one per time and location, without names: the beheerder assigns
 * the booking afterwards and the customer hears by e-mail.
 *
 * Extra's (20 Oct 2026, `use-booking-addons.ts`): when the chosen service has
 * extras (Beheer → Aanbod, "Extra's bij dit aanbod") a step lets the visitor
 * tick them; the duration and the price shown add up, the free moments are
 * computed for the longer appointment, and the server books the extras it
 * offered (never what the client says they cost). `initialAddonSlugs` (from
 * `?extra=`) ticks an extra in advance.
 *
 * Where (20 Oct 2026, `location-choice.ts`): "Kies een dag en uur" names the
 * place the visitor books for, with its address from Beheer → Locaties; with
 * several places a row of toggles narrows the free moments to the chosen
 * ones. A slot still carries its own location, which decides whether the
 * form asks for an address.
 *
 * `initialServiceId` preselects a service (from `/afspraak?dienst=…`, resolved
 * on the server); `context` names the offer the visitor came from. `choices`
 * puts the services an offer links to under that offer (Volwassene / Jeugd
 * under "Bikefit – huidige fiets"); `serviceId` stays the one thing booked.
 *
 * Accessibility: every choice is a real `<button>` with `aria-pressed`; each
 * step heading takes focus when that step opens (only after the visitor has
 * interacted, so a page load never jumps); status lines are `role="status"`
 * and errors `role="alert"`.
 */

type Confirmed = {
  serviceName: string;
  addons: string[];
  durationMinutes: number;
  providerName: string;
  startsAt: string;
  endsAt: string;
  where: string;
  email: string;
};

const GENERIC_ERROR = 'Er ging iets mis bij het boeken. Probeer het opnieuw.';
const SLOT_TAKEN = 'Dit moment is net geboekt. Kies een ander moment.';

function offersService(provider: BookingProviderOption, serviceId: string): boolean {
  return provider.services.some((entry) => entry.serviceId === serviceId);
}

export function BookingWidget({
  services,
  locations,
  choices: givenChoices,
  providers,
  rules,
  copy,
  todayYmd,
  initialServiceId = null,
  initialAddonSlugs = [],
  context = null,
  notice: introNotice = '',
}: BookingWidgetProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const interacted = useRef(false);
  /** Where the widget lived before the confirmation URL replaced it. */
  const returnPath = useRef<string | null>(null);

  const choice = useServiceChoice({
    services,
    choices: givenChoices,
    initialServiceId,
    onChange: () => {
      interacted.current = true;
      addons.reset();
      resetWhen();
    },
  });
  const { serviceId } = choice;
  const [providerChoice, setProviderChoice] = useState<ProviderChoice | undefined>(undefined);
  const [locationSelection, setLocationSelection] = useState<string[] | null>(null);
  const [month, setMonth] = useState<Ym>(monthOf(todayYmd));
  const [day, setDay] = useState<Ymd | null>(null);
  const [slot, setSlot] = useState<BookingSlot | null>(null);
  const [values, setValues] = useState<DetailsValues>(EMPTY_DETAILS);
  const [errors, setErrors] = useState<Partial<Record<DetailsField, string>>>({});
  const [formError, setFormError] = useState('');
  const [notice, setNotice] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [confirmed, setConfirmed] = useState<Confirmed | null>(null);

  const tz = rules.timezone;
  const firstMonth = monthOf(todayYmd);
  const lastYmd = addDays(todayYmd, rules.horizonDays);
  const lastMonth = monthOf(lastYmd);

  // --- who --------------------------------------------------------------------
  const providerStep = rules.showProviderChoice && providers.length > 1;
  const providerId: string | null = providerStep ? (providerChoice ?? null) : null;
  const chosenProvider = providerId
    ? (providers.find((provider) => provider.id === providerId) ?? null)
    : null;
  const providerNames = Object.fromEntries(
    providers.map((provider) => [provider.id, provider.name]),
  );
  /** Admin sort order (the order `listPublicProviders` returns). */
  const providerRank = new Map(providers.map((provider, index) => [provider.id, index]));

  // --- what -------------------------------------------------------------------
  const visibleServices = chosenProvider
    ? services.filter((service) => offersService(chosenProvider, service.id))
    : services;
  const visibleIds = new Set(visibleServices.map((service) => service.id));
  const visibleChoices = narrowChoices(choice.choices, visibleIds);
  const service = services.find((item) => item.id === serviceId && visibleIds.has(item.id)) ?? null;
  // Back on "Bij wie?" with a service already chosen: only who offers it.
  const providersForPicker = service
    ? providers.filter((provider) => offersService(provider, service.id))
    : providers;
  const providersForService = service
    ? providers.filter((provider) => offersService(provider, service.id))
    : [];
  // "Iedereen" with several providers: one button per time and location.
  const onePerStart = providerId === null && providersForService.length > 1;

  // --- extras -------------------------------------------------------------------
  const addons = useBookingAddons({
    service,
    initialSlugs: initialAddonSlugs,
    onChange: resetWhen,
  });

  const step: Step = confirmed
    ? 'done'
    : providerStep && providerChoice === undefined
      ? 'provider'
      : !service
        ? 'service'
        : addons.hasStep && !addons.confirmed
          ? 'addons'
          : !slot
            ? 'when'
            : 'details';

  // --- when -------------------------------------------------------------------
  const availability = useMonthAvailability({
    serviceId: service?.id ?? null,
    addonIds: addons.chosenIds,
    providerId,
    month,
    active: step === 'when',
    todayYmd,
    lastYmd,
  });
  const { monthState, loading } = availability;
  const monthSlots = monthState?.status === 'ready' ? monthState.slots : [];

  // --- where --------------------------------------------------------------------
  const locationsById = new Map(locations.map((location) => [location.id, location]));
  const locationLabels = Object.fromEntries(
    locations.map((location) => [location.id, location.label]),
  );
  const placesForService = locationsForService({ service, providers, providerId, locations });
  const selectedPlaces = normalizeLocationSelection(locationSelection, placesForService);
  const shownSlots = filterSlotsByLocation(monthSlots, selectedPlaces);
  const slotsByDay = groupDaySlots(shownSlots, {
    timezone: tz,
    todayYmd,
    lastYmd,
    providerRank,
    onePerStart,
  });
  const availableDays = new Set(slotsByDay.keys());
  const daySlots = day ? (slotsByDay.get(day) ?? []) : [];
  const canPrev = month > firstMonth;
  const canNext = month < lastMonth;
  const showLocation = slotLocationIds(shownSlots).size > 1;
  // The slot knows where it is; a slot without a location falls back to the
  // provider's resolved entry, then the service's own location (as before).
  function locationFor(
    option: BookingServiceOption,
    chosen: BookingSlot | null,
  ): BookingLocationOption | null {
    if (chosen?.locationId) return locationsById.get(chosen.locationId) ?? null;
    const provider = chosen ? providers.find((item) => item.id === chosen.providerId) : null;
    const entry = provider?.services.find((item) => item.serviceId === option.id);
    return entry?.location ?? option.location;
  }
  const location = service && slot ? locationFor(service, slot) : null;
  const mode: DetailsMode = {
    guardian: service?.requiresGuardian ?? false,
    address: location?.kind === 'customer',
  };

  // --- focus management --------------------------------------------------------
  useEffect(() => {
    if (!interacted.current) return;
    rootRef.current?.querySelector<HTMLElement>(`[data-step-heading="${step}"]`)?.focus();
  }, [step]);

  function focusField(field: DetailsField) {
    rootRef.current?.querySelector<HTMLElement>(`[name="${field}"]`)?.focus();
  }

  // --- handlers -----------------------------------------------------------------
  function resetWhen() {
    setMonth(firstMonth);
    setDay(null);
    setSlot(null);
    setNotice('');
  }

  function touch<T extends unknown[]>(run: (...args: T) => void) {
    return (...args: T) => {
      interacted.current = true;
      run(...args);
    };
  }

  function chooseProvider(next: ProviderChoice) {
    interacted.current = true;
    setProviderChoice(next);
    const provider = next ? providers.find((item) => item.id === next) : null;
    const offered = provider
      ? services.filter((item) => offersService(provider, item.id))
      : services;
    if (serviceId && !offered.some((item) => item.id === serviceId)) {
      choice.clear();
    } else if (!serviceId && offered.length === 1) {
      choice.choose(offered[0].id);
    } else {
      resetWhen();
    }
  }

  function goMonth(delta: number) {
    interacted.current = true;
    setMonth((current) => addMonths(current, delta));
    setDay(null);
  }

  function chooseDay(ymd: Ymd) {
    interacted.current = true;
    setDay(ymd);
    setNotice('');
  }

  function chooseSlot(next: BookingSlot) {
    interacted.current = true;
    setSlot(next);
    setErrors({});
    setFormError('');
  }

  function choosePlaces(next: string[] | null) {
    interacted.current = true;
    setLocationSelection(next);
    setDay(null);
    setSlot(null);
  }

  function editProvider() {
    interacted.current = true;
    setProviderChoice(undefined);
    resetWhen();
  }

  function editWhen() {
    interacted.current = true;
    setSlot(null);
  }

  function changeValue(field: DetailsField, value: string) {
    setValues((previous) => ({ ...previous, [field]: value }));
    if (errors[field]) setErrors((previous) => ({ ...previous, [field]: undefined }));
  }

  function startOver() {
    interacted.current = true;
    if (returnPath.current) {
      window.history.replaceState(null, '', returnPath.current);
      returnPath.current = null;
    }
    setConfirmed(null);
    availability.clear();
    choice.reset();
    setProviderChoice(undefined);
    addons.reset();
    resetWhen();
    setValues((previous) => ({ ...previous, notes: '', bikeType: '', bikeModel: '' }));
  }

  async function submit() {
    if (!service || !slot) return;

    const found = validateDetails(values, mode);
    const firstInvalid = fieldOrder(mode).find((field) => found[field]);
    setErrors(found);
    setFormError('');
    if (firstInvalid) {
      focusField(firstInvalid);
      return;
    }

    setSubmitting(true);
    const input = toBookInput(values, mode);
    let result: BookActionResult;
    try {
      result = await bookAction({
        serviceId: service.id,
        addonIds: addons.chosenIds,
        // "Iedereen" sends no provider: the server picks who holds the slot
        // and the beheerder assigns. A chosen provider is sent as such.
        providerId,
        locationId: slot.locationId,
        startsAt: slot.startsAt,
        ...input,
      });
    } catch {
      result = { ok: false, code: 'error', message: GENERIC_ERROR, fieldErrors: {} };
    }
    setSubmitting(false);

    if (result.ok) {
      // Put the signed confirmation URL in the address bar (no navigation): a
      // refresh then shows this booking on /afspraak/bevestigd instead of an
      // empty form that invites booking twice.
      if (result.confirmationPath) {
        returnPath.current = `${window.location.pathname}${window.location.search}`;
        window.history.replaceState(null, '', result.confirmationPath);
      }
      // The server's summary is the truth (provider, times, location label);
      // the customer's own address is only echoed back from this form.
      const booked = result.booking;
      setConfirmed({
        // The booked catalogue service as the server stored it (e.g. "Jeugdfit").
        serviceName: booked.serviceName || service.name,
        addons: (booked.addons.length ? booked.addons : addons.chosen).map((addon) => addon.title),
        durationMinutes: addons.totals?.minutes ?? service.durationMinutes,
        providerName: booked.assignmentPending
          ? PENDING_PROVIDER_TEXT
          : booked.providerName || (providerNames[slot.providerId] ?? ''),
        startsAt: booked.startsAt || slot.startsAt,
        endsAt: booked.endsAt || slot.endsAt,
        where: mode.address
          ? `Bij jou thuis: ${input.address}`
          : booked.locationLabel || (location?.label ?? ''),
        email: input.email,
      });
      return;
    }

    if (result.code === 'slot_taken') {
      availability.retry();
      setSlot(null);
      setNotice(SLOT_TAKEN);
      return;
    }

    const mapped: Partial<Record<DetailsField, string>> = {};
    for (const [inputKey, message] of Object.entries(result.fieldErrors)) {
      const field = formFieldFor(inputKey, mode);
      if (field) mapped[field] = message;
    }
    setErrors(mapped);
    setFormError(result.message || GENERIC_ERROR);
    const firstServerInvalid = fieldOrder(mode).find((field) => mapped[field]);
    if (firstServerInvalid) focusField(firstServerInvalid);
  }

  // --- render -------------------------------------------------------------------
  if (confirmed) {
    return (
      <div className="studio-booking" ref={rootRef}>
        <Confirmation
          title={copy.successTitle || 'Je afspraak staat vast'}
          text={copy.successText}
          serviceName={confirmed.serviceName}
          addons={confirmed.addons}
          durationMinutes={confirmed.durationMinutes}
          providerName={confirmed.providerName}
          startsAt={confirmed.startsAt}
          endsAt={confirmed.endsAt}
          timezone={tz}
          where={confirmed.where}
          email={confirmed.email}
          cancelUntilHours={rules.cancelUntilHours}
          phoneLabel={copy.phoneLabel}
          phoneHref={copy.phoneHref}
          onReset={startOver}
        />
      </div>
    );
  }

  const order: Step[] = [
    ...(providerStep ? (['provider'] as Step[]) : []),
    'service',
    ...(addons.hasStep ? (['addons'] as Step[]) : []),
    'when',
    'details',
  ];
  const stateOf = (id: Step): StepState => {
    const at = order.indexOf(step);
    const index = order.indexOf(id);
    return index < at ? 'done' : index === at ? 'active' : 'upcoming';
  };
  const numberOf = (id: Step) => order.indexOf(id) + 1;

  const addonSummary =
    addons.chosen.length === 0
      ? 'Geen extra’s'
      : `${addons.chosen.map((addon) => addon.title).join(' + ')} · samen ${formatDuration(
          addons.totals?.minutes ?? 0,
        )}${addons.totals?.priceCents != null ? ` · ${formatPrice(addons.totals.priceCents)}` : ''}`;

  const slotWhere =
    slot && slot.locationId && (showLocation || placesForService.length > 1)
      ? (locationLabels[slot.locationId] ?? '')
      : '';
  const whenSummary = slot
    ? `${shortDate(instantToYmd(slot.startsAt, tz))}, ${instantToTime(slot.startsAt, tz)}${
        slotWhere ? ` · ${slotWhere}` : ''
      }`
    : '';

  return (
    <div className="studio-booking" ref={rootRef}>
      {context ? (
        <p className="studio-booking__context">
          Je boekt voor <strong>{context.label}</strong>.{' '}
          <a href={context.href}>Meer over deze dienst</a>
        </p>
      ) : null}
      {introNotice ? (
        <p className="studio-booking__context" role="status">
          {introNotice}
        </p>
      ) : null}
      <ol className="studio-booking__steps">
        {providerStep ? (
          <StepItem
            id="provider"
            number={numberOf('provider')}
            title="Bij wie?"
            state={stateOf('provider')}
            summary={
              providerChoice === null
                ? 'Iedereen'
                : providerChoice
                  ? (providerNames[providerChoice] ?? '')
                  : ''
            }
            onEdit={editProvider}
          >
            <ProviderPicker
              providers={providersForPicker}
              selected={providerChoice}
              onSelect={chooseProvider}
            />
          </StepItem>
        ) : null}

        <StepItem
          id="service"
          number={numberOf('service')}
          title="Kies je fit"
          state={stateOf('service')}
          summary={serviceSummary(service, choice.offer)}
          onEdit={visibleServices.length > 1 ? choice.clear : undefined}
        >
          <ServicePicker
            services={visibleServices}
            choices={visibleChoices}
            selectedId={serviceId}
            openOffer={choice.openOffer}
            onSelect={choice.choose}
            onOpenOffer={touch(choice.open)}
          />
        </StepItem>

        {addons.hasStep && service ? (
          <StepItem
            id="addons"
            number={numberOf('addons')}
            title="Iets extra erbij?"
            state={stateOf('addons')}
            summary={addonSummary}
            onEdit={touch(addons.edit)}
          >
            <AddonStep
              options={addons.options}
              selectedIds={addons.addonIds}
              base={{
                name: service.name,
                durationMinutes: service.durationMinutes,
                priceCents: service.priceCents,
              }}
              onToggle={touch(addons.toggle)}
              onConfirm={touch(addons.confirm)}
            />
          </StepItem>
        ) : null}

        <StepItem
          id="when"
          number={numberOf('when')}
          title="Kies een dag en uur"
          state={stateOf('when')}
          summary={whenSummary}
          onEdit={editWhen}
        >
          <WhenPanel
            where={{
              locations: placesForService,
              selected: selectedPlaces,
              onSelect: choosePlaces,
            }}
            calendar={{
              month,
              todayYmd,
              lastYmd,
              canPrev,
              canNext,
              onPrev: () => goMonth(-1),
              onNext: () => goMonth(1),
              onSelectDay: chooseDay,
            }}
            monthState={monthState}
            loading={loading}
            notice={notice}
            availableDays={availableDays}
            day={day}
            daySlots={daySlots}
            timezone={tz}
            locationLabels={locationLabels}
            showLocation={showLocation}
            slot={slot}
            onSelectSlot={chooseSlot}
            onRetry={availability.retry}
            phone={{ label: copy.phoneLabel, href: copy.phoneHref }}
          />
        </StepItem>

        <StepItem
          id="details"
          number={numberOf('details')}
          title="Jouw gegevens"
          state={stateOf('details')}
          summary=""
        >
          <DetailsForm
            mode={mode}
            values={values}
            errors={errors}
            formError={formError}
            submitting={submitting}
            cancelUntilHours={rules.cancelUntilHours}
            onChange={changeValue}
            onSubmit={() => void submit()}
          />
          {formError && copy.phoneHref ? (
            <p className="studio-booking__hint">
              Lukt het niet? Bel ons op <a href={copy.phoneHref}>{copy.phoneLabel}</a>.
            </p>
          ) : null}
        </StepItem>
      </ol>
    </div>
  );
}
