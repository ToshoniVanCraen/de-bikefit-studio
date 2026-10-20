import { addMonths, longDate, monthTitle, type Ym, type Ymd } from './dates';
import { LocationPicker } from './location-picker';
import { MonthCalendar } from './month-calendar';
import { SlotList, slotKey } from './slot-list';
import type { BookingLocationOption, BookingSlot } from './types';
import type { MonthState } from './use-month-availability';

/**
 * The body of "Kies een dag en uur": where (the location choice), the month
 * calendar, the day's free times and the status line between them. Pure
 * markup split out of `booking-widget.tsx`; every decision (which slots,
 * which month, what is selected) is the widget's.
 */
export function WhenPanel({
  where,
  calendar,
  monthState,
  loading,
  notice,
  availableDays,
  day,
  daySlots,
  timezone,
  locationLabels,
  showLocation,
  slot,
  onSelectSlot,
  onRetry,
  phone,
}: {
  where: {
    locations: BookingLocationOption[];
    selected: string[] | null;
    onSelect: (next: string[] | null) => void;
  };
  calendar: {
    month: Ym;
    todayYmd: Ymd;
    lastYmd: Ymd;
    canPrev: boolean;
    canNext: boolean;
    onPrev: () => void;
    onNext: () => void;
    onSelectDay: (ymd: Ymd) => void;
  };
  monthState: MonthState | undefined;
  loading: boolean;
  notice: string;
  availableDays: Set<Ymd>;
  day: Ymd | null;
  daySlots: BookingSlot[];
  timezone: string;
  locationLabels: Record<string, string>;
  showLocation: boolean;
  slot: BookingSlot | null;
  onSelectSlot: (slot: BookingSlot) => void;
  onRetry: () => void;
  phone: { label: string; href: string };
}) {
  const { month, canNext } = calendar;
  let status = '';
  if (loading) status = 'Vrije momenten laden…';
  else if (monthState?.status === 'error') status = monthState.message;
  else if (availableDays.size === 0) status = `Geen vrije momenten meer in ${monthTitle(month)}.`;
  else if (!day) status = 'Kies een dag met vrije momenten.';
  else if (daySlots.length === 0)
    status = `Geen vrije momenten meer op ${longDate(day)}. Kies een andere dag.`;
  else
    status = `${daySlots.length} ${daySlots.length === 1 ? 'vrij moment' : 'vrije momenten'} op ${longDate(day)}.`;

  const ready = monthState?.status === 'ready';

  return (
    <>
      <LocationPicker
        locations={where.locations}
        selected={where.selected}
        onSelect={where.onSelect}
      />
      <div className="studio-booking__when">
        <MonthCalendar
          month={month}
          todayYmd={calendar.todayYmd}
          lastYmd={calendar.lastYmd}
          availableDays={availableDays}
          selectedYmd={day}
          loading={loading}
          canPrev={calendar.canPrev}
          canNext={canNext}
          onPrev={calendar.onPrev}
          onNext={calendar.onNext}
          onSelectDay={calendar.onSelectDay}
        />

        <div className="studio-booking__day-panel">
          {notice ? (
            <p className="studio-booking__alert" role="alert">
              {notice}
            </p>
          ) : null}
          <p className="studio-booking__status" role="status">
            {status}
          </p>

          {monthState?.status === 'error' ? (
            <p>
              <button type="button" className="studio-btn studio-btn--outline" onClick={onRetry}>
                Opnieuw proberen
              </button>
            </p>
          ) : null}

          {ready && availableDays.size === 0 && canNext ? (
            <p>
              <button
                type="button"
                className="studio-btn studio-btn--outline"
                onClick={calendar.onNext}
              >
                Bekijk {monthTitle(addMonths(month, 1))}
              </button>
            </p>
          ) : null}

          {ready && availableDays.size === 0 && !canNext && phone.href ? (
            <p className="studio-booking__hint">
              Niets gevonden dat past? Bel ons op <a href={phone.href}>{phone.label}</a> en we
              zoeken samen een moment.
            </p>
          ) : null}

          {day && daySlots.length > 0 ? (
            <SlotList
              slots={daySlots}
              timezone={timezone}
              locationLabels={locationLabels}
              showLocation={showLocation}
              selectedKey={slot ? slotKey(slot) : null}
              onSelect={onSelectSlot}
            />
          ) : null}
        </div>
      </div>
    </>
  );
}
