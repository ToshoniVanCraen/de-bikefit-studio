import { useEffect, useRef, useState } from 'react';
import {
  addonTotals,
  preselectAddonIds,
  toggleAddonId,
  type AddonTotals,
  type BookingAddonOption,
} from '@/lib/offers/addons';
import type { BookingServiceOption } from './types';

/**
 * The extras step's state (20 Oct 2026), kept out of the (already long)
 * widget: which options are ticked (one choice per extra), whether the step
 * was confirmed, the totals, and `?extra=` ticking an extra once for the
 * first chosen service that offers it. `onChange` runs when a *confirmed*
 * choice changes, so the widget clears the day and time (another duration
 * means other free moments).
 */
export function useBookingAddons({
  service,
  initialSlugs,
  onChange,
}: {
  service: BookingServiceOption | null;
  /** Extras (slugs) to tick in advance, from `?extra=`. */
  initialSlugs: string[];
  onChange: () => void;
}) {
  const pending = useRef<string[]>(initialSlugs);
  const confirmedKey = useRef<string | null>(null);
  const [addonIds, setAddonIds] = useState<string[]>([]);
  const [confirmed, setConfirmed] = useState(false);

  const options: BookingAddonOption[] = service?.addons ?? [];
  const chosen = options.filter((option) => addonIds.includes(option.id));
  const chosenIds = chosen.map((option) => option.id);
  const totals: AddonTotals | null = service
    ? addonTotals(
        { durationMinutes: service.durationMinutes, priceCents: service.priceCents },
        chosen,
      )
    : null;

  // `?extra=` applies to the first chosen service that offers that extra.
  useEffect(() => {
    if (!service || pending.current.length === 0) return;
    const ids = preselectAddonIds(service.addons, pending.current);
    if (ids.length === 0) return;
    pending.current = [];
    setAddonIds(ids);
  }, [service]);

  return {
    options,
    addonIds,
    chosen,
    chosenIds,
    confirmed,
    totals,
    /** The step exists only when the chosen service has extras. */
    hasStep: options.length > 0,
    toggle(id: string) {
      setAddonIds((current) => toggleAddonId(options, current, id));
    },
    confirm() {
      const key = [...chosenIds].sort().join(',');
      if (confirmedKey.current !== null && confirmedKey.current !== key) onChange();
      confirmedKey.current = key;
      setConfirmed(true);
    },
    edit() {
      setConfirmed(false);
    },
    reset() {
      setAddonIds([]);
      setConfirmed(false);
      confirmedKey.current = null;
    },
  };
}
