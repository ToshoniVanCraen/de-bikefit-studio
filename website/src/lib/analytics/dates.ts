/**
 * Date and time formatting shared by the analytics panel, the deep dive and
 * its charts: nl-BE, calendar days as `YYYY-MM-DD`, clock times in Brussels.
 * Pure, no `server-only`, so the client-side chart can use it too.
 */

const day = new Intl.DateTimeFormat('nl-BE', { day: 'numeric', month: 'short', timeZone: 'UTC' });
const dayYear = new Intl.DateTimeFormat('nl-BE', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  timeZone: 'UTC',
});
const longDay = new Intl.DateTimeFormat('nl-BE', {
  weekday: 'short',
  day: 'numeric',
  month: 'short',
  timeZone: 'UTC',
});
const clock = new Intl.DateTimeFormat('nl-BE', {
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'Europe/Brussels',
});

function at(ymd: string): Date {
  return new Date(`${ymd}T00:00:00Z`);
}

/** `2026-10-19` → "19 okt". */
export function formatDay(ymd: string): string {
  return day.format(at(ymd));
}

/** `2026-10-19` → "ma 19 okt". */
export function formatLongDay(ymd: string): string {
  return longDay.format(at(ymd));
}

/** "22 sep – 19 okt 2026". */
export function formatDayRange(start: string, end: string): string {
  return `${day.format(at(start))} – ${dayYear.format(at(end))}`;
}

/** An ISO instant → "14:05" in Brussels. */
export function formatClock(iso: string): string {
  return clock.format(new Date(iso));
}
