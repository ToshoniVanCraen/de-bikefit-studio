import 'server-only';

import { unstable_cache } from 'next/cache';

import {
  accountFingerprint,
  analyticsConfig,
  ANALYTICS_CACHE_TAG,
  CACHE_SECONDS,
  dimension,
  getAccessToken,
  lastFullDays,
  metric,
  readFailure,
  runReport,
  type AnalyticsNotConnected,
  type RunReportRow,
  type ServiceAccount,
} from './ga4';
import { toGa4ReadError } from './ga4-errors';
import {
  fillDays,
  ga4DateToYmd,
  previousRange,
  type DayPoint,
  type DeepDivePeriod,
} from './deep-dive-shape';

/**
 * GA4 Data API reader for the analytics deep dive (`/admin/analytics`).
 *
 * Same credentials, property and error handling as the overview in `ga4.ts`;
 * this module only asks more. For a period of 7, 28 or 90 full days
 * (Brussels calendar) and the period of the same length right before it,
 * eight `runReport` calls in parallel (the API allows ten per property):
 *  - totals for both periods: users, new users, sessions, page views,
 *    engagement rate, average session duration;
 *  - sessions, users and page views per day, both periods;
 *  - the booking funnel: views and users of `/afspraak` and
 *    `/afspraak/bevestigd`, both periods;
 *  - top pages, channels, sources, devices and cities, current period only.
 *
 * Cached for an hour per period (tag {@link ANALYTICS_CACHE_TAG}); a failure
 * is not cached. Never throws. The shaping is pure and lives in
 * `deep-dive-shape.ts`.
 */

export const FUNNEL_PATHS = {
  appointment: '/afspraak',
  confirmation: '/afspraak/bevestigd',
} as const;

const PAGE_LIMIT = 12;
const BREAKDOWN_LIMIT = 8;

export type DeepDiveTotals = {
  activeUsers: number;
  newUsers: number;
  sessions: number;
  screenPageViews: number;
  /** Fraction 0–1 of sessions that were engaged. */
  engagementRate: number;
  /** Seconds. */
  averageSessionDuration: number;
};

export type DeepDiveRow = { label: string; value: number };

export type DeepDivePage = { path: string; views: number; users: number };

export type FunnelStep = { views: number; users: number };

export type DeepDiveFunnel = { appointment: FunnelStep; confirmation: FunnelStep };

export type DeepDiveDaily = { current: DayPoint[]; previous: DayPoint[] };

export type AnalyticsDeepDiveConnected = {
  connected: true;
  propertyId: string;
  period: DeepDivePeriod;
  /** Inclusive calendar dates, `YYYY-MM-DD`. */
  range: { start: string; end: string };
  previous: { start: string; end: string };
  totals: { current: DeepDiveTotals; previous: DeepDiveTotals };
  daily: { sessions: DeepDiveDaily; activeUsers: DeepDiveDaily; screenPageViews: DeepDiveDaily };
  pages: DeepDivePage[];
  channels: DeepDiveRow[];
  sources: DeepDiveRow[];
  devices: DeepDiveRow[];
  cities: DeepDiveRow[];
  funnel: { current: DeepDiveFunnel; previous: DeepDiveFunnel };
  /** ISO instant the numbers were fetched from Google (cache age). */
  fetchedAt: string;
};

export type AnalyticsDeepDive = AnalyticsDeepDiveConnected | AnalyticsNotConnected;

// ---------------------------------------------------------------------------
// Row helpers
// ---------------------------------------------------------------------------

type Period = 'current' | 'previous';

/**
 * Which of the two requested date ranges a row belongs to. With more than one
 * `dateRanges` entry GA4 adds a `dateRange` dimension value (`date_range_0`,
 * `date_range_1`) to every row; a single-range report has none.
 */
function periodOf(row: RunReportRow): Period {
  for (const value of row.dimensionValues ?? []) {
    if (value.value === 'date_range_1') return 'previous';
  }
  return 'current';
}

function rowsOf(rows: RunReportRow[] | undefined, period: Period): RunReportRow[] {
  return (rows ?? []).filter((row) => periodOf(row) === period);
}

function totalsOf(row: RunReportRow | undefined): DeepDiveTotals {
  return {
    activeUsers: metric(row, 0),
    newUsers: metric(row, 1),
    sessions: metric(row, 2),
    screenPageViews: metric(row, 3),
    engagementRate: metric(row, 4),
    averageSessionDuration: metric(row, 5),
  };
}

function dailyOf(
  rows: RunReportRow[],
  range: { start: string; end: string },
  metricIndex: number,
): DayPoint[] {
  const byDay = new Map<string, number>();
  for (const row of rows) {
    byDay.set(ga4DateToYmd(dimension(row, 0)), metric(row, metricIndex));
  }
  return fillDays(range, byDay);
}

function breakdownOf(rows: RunReportRow[] | undefined): DeepDiveRow[] {
  return (rows ?? []).map((row) => ({ label: dimension(row, 0), value: metric(row, 0) }));
}

function funnelOf(rows: RunReportRow[]): DeepDiveFunnel {
  const empty = (): FunnelStep => ({ views: 0, users: 0 });
  const funnel: DeepDiveFunnel = { appointment: empty(), confirmation: empty() };
  for (const row of rows) {
    const step = { views: metric(row, 0), users: metric(row, 1) };
    const path = dimension(row, 0);
    if (path === FUNNEL_PATHS.appointment) funnel.appointment = step;
    else if (path === FUNNEL_PATHS.confirmation) funnel.confirmation = step;
  }
  return funnel;
}

// ---------------------------------------------------------------------------
// Fetch
// ---------------------------------------------------------------------------

async function fetchDeepDive(
  propertyId: string,
  account: ServiceAccount,
  period: DeepDivePeriod,
): Promise<AnalyticsDeepDiveConnected> {
  const token = await getAccessToken(account);

  const range = lastFullDays(period);
  const previous = previousRange(range);
  const bothRanges = [
    { startDate: range.start, endDate: range.end },
    { startDate: previous.start, endDate: previous.end },
  ];
  const currentRange = [bothRanges[0]];
  const bySessions = [{ metric: { metricName: 'sessions' }, desc: true }];

  const [totals, daily, funnel, pages, channels, sources, devices, cities] = await Promise.all([
    runReport(token, propertyId, {
      dateRanges: bothRanges,
      metrics: [
        { name: 'activeUsers' },
        { name: 'newUsers' },
        { name: 'sessions' },
        { name: 'screenPageViews' },
        { name: 'engagementRate' },
        { name: 'averageSessionDuration' },
      ],
    }),
    runReport(token, propertyId, {
      dateRanges: bothRanges,
      dimensions: [{ name: 'date' }],
      metrics: [{ name: 'sessions' }, { name: 'activeUsers' }, { name: 'screenPageViews' }],
      limit: 400,
    }),
    runReport(token, propertyId, {
      dateRanges: bothRanges,
      dimensions: [{ name: 'pagePath' }],
      metrics: [{ name: 'screenPageViews' }, { name: 'activeUsers' }],
      dimensionFilter: {
        filter: {
          fieldName: 'pagePath',
          inListFilter: { values: [FUNNEL_PATHS.appointment, FUNNEL_PATHS.confirmation] },
        },
      },
    }),
    runReport(token, propertyId, {
      dateRanges: currentRange,
      dimensions: [{ name: 'pagePath' }],
      metrics: [{ name: 'screenPageViews' }, { name: 'activeUsers' }],
      orderBys: [{ metric: { metricName: 'screenPageViews' }, desc: true }],
      limit: PAGE_LIMIT,
    }),
    runReport(token, propertyId, {
      dateRanges: currentRange,
      dimensions: [{ name: 'sessionDefaultChannelGroup' }],
      metrics: [{ name: 'sessions' }],
      orderBys: bySessions,
      limit: BREAKDOWN_LIMIT,
    }),
    runReport(token, propertyId, {
      dateRanges: currentRange,
      dimensions: [{ name: 'sessionSource' }],
      metrics: [{ name: 'sessions' }],
      orderBys: bySessions,
      limit: BREAKDOWN_LIMIT,
    }),
    runReport(token, propertyId, {
      dateRanges: currentRange,
      dimensions: [{ name: 'deviceCategory' }],
      metrics: [{ name: 'sessions' }],
      orderBys: bySessions,
      limit: BREAKDOWN_LIMIT,
    }),
    runReport(token, propertyId, {
      dateRanges: currentRange,
      dimensions: [{ name: 'city' }],
      metrics: [{ name: 'sessions' }],
      orderBys: bySessions,
      limit: BREAKDOWN_LIMIT,
    }),
  ]);

  const dailyCurrent = rowsOf(daily.rows, 'current');
  const dailyPrevious = rowsOf(daily.rows, 'previous');

  return {
    connected: true,
    propertyId,
    period,
    range,
    previous,
    totals: {
      current: totalsOf(rowsOf(totals.rows, 'current')[0]),
      previous: totalsOf(rowsOf(totals.rows, 'previous')[0]),
    },
    daily: {
      sessions: {
        current: dailyOf(dailyCurrent, range, 0),
        previous: dailyOf(dailyPrevious, previous, 0),
      },
      activeUsers: {
        current: dailyOf(dailyCurrent, range, 1),
        previous: dailyOf(dailyPrevious, previous, 1),
      },
      screenPageViews: {
        current: dailyOf(dailyCurrent, range, 2),
        previous: dailyOf(dailyPrevious, previous, 2),
      },
    },
    pages: (pages.rows ?? []).map((row) => ({
      path: dimension(row, 0) || '/',
      views: metric(row, 0),
      users: metric(row, 1),
    })),
    channels: breakdownOf(channels.rows),
    sources: breakdownOf(sources.rows),
    devices: breakdownOf(devices.rows),
    cities: breakdownOf(cities.rows),
    funnel: {
      current: funnelOf(rowsOf(funnel.rows, 'current')),
      previous: funnelOf(rowsOf(funnel.rows, 'previous')),
    },
    fetchedAt: new Date().toISOString(),
  };
}

/** {@link fetchDeepDive}, but a failure leaves only as a `Ga4ReadError` (see `loadOverview` in `ga4.ts`). */
async function loadDeepDive(
  propertyId: string,
  account: ServiceAccount,
  period: DeepDivePeriod,
): Promise<AnalyticsDeepDiveConnected> {
  try {
    return await fetchDeepDive(propertyId, account, period);
  } catch (error) {
    throw toGa4ReadError(error, propertyId);
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * The deep dive for the last `period` full days, compared with the period
 * before it. Cached for an hour per period (tag `analytics`). Never throws.
 */
export async function getAnalyticsDeepDive(period: DeepDivePeriod): Promise<AnalyticsDeepDive> {
  const config = await analyticsConfig();
  if (!config.ok) {
    return { connected: false, reason: config.reason, message: config.message };
  }
  const { propertyId, account } = config;
  const range = lastFullDays(period);

  try {
    const load = unstable_cache(
      () => loadDeepDive(propertyId, account, period),
      // The end date rolls the cache over at Brussels midnight; the account
      // fingerprint makes a swapped service account take effect immediately.
      ['analytics-deep-dive', propertyId, String(period), range.end, accountFingerprint(account)],
      { revalidate: CACHE_SECONDS, tags: [ANALYTICS_CACHE_TAG] },
    );
    return await load();
  } catch (error) {
    return readFailure(error, propertyId);
  }
}
