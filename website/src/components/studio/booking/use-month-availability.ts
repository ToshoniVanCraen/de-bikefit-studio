import { useEffect, useState } from 'react';
import { availabilityAction } from '@/lib/booking/public-actions';
import { firstDayOfMonth, lastDayOfMonth, maxYmd, minYmd, type Ym, type Ymd } from './dates';
import type { AvailabilityActionResult, BookingSlot } from './types';

export type MonthState =
  { status: 'ready'; slots: BookingSlot[] } | { status: 'error'; message: string };

const LOAD_ERROR = 'De agenda kon niet geladen worden. Probeer het opnieuw.';

/** The extras as one stable key: sorted ids, comma-separated ('' = none). */
export function addonKeyOf(addonIds: readonly string[]): string {
  return [...addonIds].sort().join(',');
}

export function monthKey(
  serviceId: string,
  providerId: string | null,
  month: Ym,
  addonKey = '',
): string {
  return `${serviceId}|${addonKey || '-'}|${providerId ?? '*'}|${month}`;
}

/**
 * Availability per (service, extras, provider or "Iedereen", month), fetched through
 * `availabilityAction` when the "when" step shows it and kept in a small
 * in-memory cache for the lifetime of the page. Split out of the widget.
 */
export function useMonthAvailability({
  serviceId,
  addonIds,
  providerId,
  month,
  active,
  todayYmd,
  lastYmd,
}: {
  serviceId: string | null;
  /** The extras ticked (offering ids): the slots must hold the service plus them. */
  addonIds: string[];
  providerId: string | null;
  month: Ym;
  /** Fetch only while the calendar step is the active one. */
  active: boolean;
  todayYmd: Ymd;
  lastYmd: Ymd;
}) {
  const [months, setMonths] = useState<Record<string, MonthState>>({});
  const addonKey = addonKeyOf(addonIds);
  const key = serviceId ? monthKey(serviceId, providerId, month, addonKey) : null;
  const monthState = key ? months[key] : undefined;
  const needsFetch = active && key !== null && monthState === undefined;

  useEffect(() => {
    if (!needsFetch || !key || !serviceId) return;
    const fromYmd = maxYmd(firstDayOfMonth(month), todayYmd);
    const toYmd = minYmd(lastDayOfMonth(month), lastYmd);
    const request =
      fromYmd > toYmd
        ? Promise.resolve<AvailabilityActionResult>({ ok: true, slots: [] })
        : availabilityAction({
            serviceId,
            providerId,
            fromYmd,
            toYmd,
            addonIds: addonKey ? addonKey.split(',') : [],
          }).catch((): AvailabilityActionResult => ({ ok: false, message: LOAD_ERROR }));
    void request.then((result) => {
      setMonths((previous) => ({
        ...previous,
        [key]: result.ok
          ? { status: 'ready', slots: result.slots }
          : { status: 'error', message: result.message || LOAD_ERROR },
      }));
    });
  }, [needsFetch, key, serviceId, addonKey, providerId, month, todayYmd, lastYmd]);

  const forget = (which: string | null) => {
    if (!which) return;
    setMonths((previous) => {
      const next = { ...previous };
      delete next[which];
      return next;
    });
  };

  return {
    key,
    monthState,
    loading: active && monthState === undefined,
    /** Drops the current month, so it is fetched again. */
    retry: () => forget(key),
    /** Drops every month (after a booking, or "opnieuw"). */
    clear: () => setMonths({}),
  };
}
