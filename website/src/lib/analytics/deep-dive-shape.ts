/**
 * The pure half of the analytics deep dive (`/admin/analytics`): shaping GA4
 * rows into the series, deltas and chart geometry the page draws. No I/O, no
 * Next, tested in `deep-dive-shape.test.ts`. `ga4-deep-dive.ts` fetches and
 * feeds it; the components only format.
 */

export type DeepDivePeriod = 7 | 28 | 90;

export const DEEP_DIVE_PERIODS: readonly DeepDivePeriod[] = [7, 28, 90];

/** `?periode=` → a supported period; anything else → 28. */
export function parsePeriod(value: string | string[] | undefined): DeepDivePeriod {
  const raw = Array.isArray(value) ? value[0] : value;
  const days = Number(raw);
  return DEEP_DIVE_PERIODS.includes(days as DeepDivePeriod) ? (days as DeepDivePeriod) : 28;
}

export type DayPoint = { date: string; value: number };

/** `20261019` (GA4's `date` dimension) → `2026-10-19`; already dashed stays. */
export function ga4DateToYmd(value: string): string {
  const digits = value.replace(/-/g, '');
  if (!/^\d{8}$/.test(digits)) return value;
  return `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6, 8)}`;
}

function addDaysYmd(ymd: string, days: number): string {
  const date = new Date(`${ymd}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/** Every day from `start` to `end` inclusive, in order. */
export function eachDay(start: string, end: string): string[] {
  const days: string[] = [];
  for (let day = start; day <= end && days.length < 400; day = addDaysYmd(day, 1)) days.push(day);
  return days;
}

/**
 * A complete daily series for a range: days GA4 did not report (no traffic)
 * become 0, so a line never skips a day and the previous period lines up by
 * index with the current one.
 */
export function fillDays(
  range: { start: string; end: string },
  values: ReadonlyMap<string, number> | Record<string, number>,
): DayPoint[] {
  const get = (day: string) =>
    values instanceof Map ? values.get(day) : (values as Record<string, number>)[day];
  return eachDay(range.start, range.end).map((date) => ({ date, value: get(date) ?? 0 }));
}

/** The period of the same length right before `range`. */
export function previousRange(range: { start: string; end: string }): {
  start: string;
  end: string;
} {
  const days = eachDay(range.start, range.end).length;
  return { start: addDaysYmd(range.start, -days), end: addDaysYmd(range.start, -1) };
}

export type Delta = {
  /** Signed change in percent against the previous period; null when it had nothing. */
  percent: number | null;
  direction: 'up' | 'down' | 'flat';
};

export function delta(current: number, previous: number): Delta {
  if (previous <= 0) return { percent: null, direction: current > 0 ? 'up' : 'flat' };
  const percent = ((current - previous) / previous) * 100;
  const rounded = Math.round(percent * 10) / 10;
  return {
    percent: rounded,
    direction: rounded > 0 ? 'up' : rounded < 0 ? 'down' : 'flat',
  };
}

export const nlNumber = new Intl.NumberFormat('nl-BE');

/** `1284` → "1.284", `12900` → "12,9K", `4200000` → "4,2M" (nl-BE). */
export function compactNumber(value: number): string {
  if (Math.abs(value) < 10_000) return nlNumber.format(Math.round(value));
  return new Intl.NumberFormat('nl-BE', { notation: 'compact', maximumFractionDigits: 1 }).format(
    value,
  );
}

/** `+12,5 %`, `−3 %`, `0 %`; null → "—". */
export function formatDelta(change: Delta): string {
  if (change.percent === null) return '—';
  const sign = change.percent > 0 ? '+' : change.percent < 0 ? '−' : '';
  return `${sign}${nlNumber.format(Math.abs(change.percent))} %`;
}

/** `0.6234` → "62 %". */
export function formatRate(fraction: number): string {
  return `${nlNumber.format(Math.round(fraction * 100))} %`;
}

/** Seconds → "1 min 32 s" / "45 s". */
export function formatSeconds(seconds: number): string {
  const whole = Math.round(seconds);
  const minutes = Math.floor(whole / 60);
  const rest = whole % 60;
  return minutes > 0 ? `${minutes} min ${rest} s` : `${rest} s`;
}

/** Share of a part in a total, in percent (0 when the total is 0). */
export function share(part: number, total: number): number {
  return total > 0 ? (part / total) * 100 : 0;
}

// ---------------------------------------------------------------------------
// Chart geometry (SVG user units)
// ---------------------------------------------------------------------------

export type ChartBox = {
  width: number;
  height: number;
  top: number;
  right: number;
  bottom: number;
  left: number;
};

/** A "nice" axis maximum (1, 2, 5 × 10ⁿ) at or above `max`; 1 for an empty series. */
export function niceMax(max: number): number {
  if (!(max > 0)) return 1;
  const exponent = Math.floor(Math.log10(max));
  const base = 10 ** exponent;
  for (const step of [1, 2, 5, 10]) {
    if (max <= step * base) return step * base;
  }
  return 10 * base;
}

/** Evenly spaced tick values from 0 to `max` (4 steps). */
export function axisTicks(max: number, steps = 4): number[] {
  return Array.from({ length: steps + 1 }, (_, index) => (max / steps) * index);
}

export function xAt(index: number, count: number, box: ChartBox): number {
  const inner = box.width - box.left - box.right;
  if (count <= 1) return box.left + inner / 2;
  return box.left + (inner * index) / (count - 1);
}

export function yAt(value: number, max: number, box: ChartBox): number {
  const inner = box.height - box.top - box.bottom;
  return box.top + inner - (inner * value) / max;
}

/** The SVG path of a series, `M x y L x y …`, or '' for fewer than two points. */
export function linePath(values: readonly number[], max: number, box: ChartBox): string {
  if (values.length < 2) return '';
  return values
    .map(
      (value, index) =>
        `${index === 0 ? 'M' : 'L'}${xAt(index, values.length, box).toFixed(1)} ${yAt(value, max, box).toFixed(1)}`,
    )
    .join(' ');
}

/**
 * Which day indices get an x-axis label: every day up to `maxLabels`, else
 * about that many evenly spaced ones, the last day always (a neighbour that
 * would collide with it is dropped).
 */
export function labelIndices(count: number, maxLabels = 7): number[] {
  if (count <= 0) return [];
  if (count <= maxLabels) return Array.from({ length: count }, (_, index) => index);
  const step = Math.ceil((count - 1) / (maxLabels - 1));
  const indices: number[] = [];
  for (let index = 0; index < count - 1; index += step) indices.push(index);
  if (count - 1 - indices[indices.length - 1] < step / 2) indices.pop();
  indices.push(count - 1);
  return indices;
}

/** Index of the point whose x is nearest to `x` (for the hover crosshair). */
export function nearestIndex(x: number, count: number, box: ChartBox): number {
  if (count <= 1) return 0;
  const inner = box.width - box.left - box.right;
  const ratio = (x - box.left) / inner;
  return Math.min(count - 1, Math.max(0, Math.round(ratio * (count - 1))));
}
