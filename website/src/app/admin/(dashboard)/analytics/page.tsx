import Link from 'next/link';

import { BarList } from '@/components/admin/charts/bar-list';
import { BookingFunnel } from '@/components/admin/charts/booking-funnel';
import { CHART_CARD, ChartCard, SERIES_COLOR } from '@/components/admin/charts/chart-card';
import { GoogleAnalyticsLink } from '@/components/admin/charts/google-analytics-link';
import { LineChart } from '@/components/admin/charts/line-chart';
import { PeriodSwitch } from '@/components/admin/charts/period-switch';
import { StatTile } from '@/components/admin/charts/stat-tile';
import { ForbiddenNotice } from '@/components/admin/forbidden';
import { PageHeading } from '@/components/admin/shell';
import { formatClock, formatDayRange } from '@/lib/analytics/dates';
import {
  channelLabel,
  deviceLabel,
  placeLabel,
  sourceLabel,
} from '@/lib/analytics/deep-dive-labels';
import {
  compactNumber,
  delta,
  formatRate,
  formatSeconds,
  parsePeriod,
  share,
  nlNumber,
} from '@/lib/analytics/deep-dive-shape';
import {
  getAnalyticsDeepDive,
  type AnalyticsDeepDiveConnected,
} from '@/lib/analytics/ga4-deep-dive';
import { requireCmsUser } from '@/lib/cms/auth';
import { can } from '@/lib/cms/permissions';

export const metadata = { title: 'Analytics' };

/**
 * `/admin/analytics`: the deep dive behind the dashboard's Google Analytics
 * panel. `?periode=7|28|90` picks the number of full days; every figure
 * compares with the period of the same length before it. Data from
 * `getAnalyticsDeepDive()` (cached an hour, never throws); the charts are
 * server-rendered SVG and HTML, only the line chart's hover layer is a
 * client component.
 */
export default async function AdminAnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<{ periode?: string | string[] }>;
}) {
  const user = await requireCmsUser();
  if (!can(user.role, 'analytics.read')) return <ForbiddenNotice what="de analytics" />;

  const period = parsePeriod((await searchParams).periode);
  const data = await getAnalyticsDeepDive(period);

  if (!data.connected) {
    return (
      <>
        <PageHeading
          title="Analytics"
          description="Google Analytics is nog niet verbonden."
          actions={<PeriodSwitch period={period} />}
        />
        <section className={CHART_CARD}>
          <p className="text-sm">{data.message}</p>
          <p className="mt-3 text-sm text-muted-foreground">
            De stappen om te verbinden staan op{' '}
            <Link href="/admin" className="underline underline-offset-4 hover:text-primary">
              het overzicht
            </Link>
            .
          </p>
        </section>
      </>
    );
  }

  return (
    <>
      <PageHeading
        title="Analytics"
        description="Bezoek op de studiosite volgens Google Analytics, in volledige dagen (Belgische tijd). Vandaag telt nog niet mee."
        actions={
          <>
            <PeriodSwitch period={period} />
            <GoogleAnalyticsLink propertyId={data.propertyId} />
          </>
        }
      />

      <div className="flex flex-col gap-6">
        <p className="text-sm text-muted-foreground">
          {formatDayRange(data.range.start, data.range.end)} vergeleken met{' '}
          {formatDayRange(data.previous.start, data.previous.end)} · bijgewerkt om{' '}
          {formatClock(data.fetchedAt)}
        </p>

        <Kpis data={data} />

        <ChartCard
          id="analytics-sessions"
          title="Sessies per dag"
          description="De huidige periode naast de vorige, dag voor dag."
        >
          <LineChart
            title="Sessies per dag"
            valueLabel="sessies"
            empty="Nog geen sessies in deze periode."
            series={[
              {
                id: 'current',
                label: 'Deze periode',
                points: data.daily.sessions.current,
                color: SERIES_COLOR.current,
              },
              {
                id: 'previous',
                label: 'Vorige periode',
                points: data.daily.sessions.previous,
                color: SERIES_COLOR.previous,
                dashed: true,
              },
            ]}
          />
        </ChartCard>

        <div className="grid gap-6 lg:grid-cols-2">
          <BarList
            id="analytics-pages"
            title="Populairste pagina’s"
            description="Op paginaweergaven; het aandeel is van alle weergaven in de periode."
            valueLabel="weergaven"
            total={data.totals.current.screenPageViews}
            empty="Nog geen paginaweergaven in deze periode."
            mono
            rows={data.pages.map((page) => ({
              label: page.path,
              value: page.views,
              detail: `${nlNumber.format(page.users)} bezoekers`,
            }))}
          />
          <BarList
            id="analytics-channels"
            title="Kanalen"
            description="Hoe sessies de site bereikten (standaardkanaalgroep van Google)."
            valueLabel="sessies"
            total={data.totals.current.sessions}
            empty="Nog geen sessies in deze periode."
            rows={data.channels.map((row) => ({
              label: channelLabel(row.label),
              value: row.value,
            }))}
          />
          <BarList
            id="analytics-sources"
            title="Bronnen"
            description="De site of app waar een sessie vandaan kwam."
            valueLabel="sessies"
            total={data.totals.current.sessions}
            empty="Nog geen sessies in deze periode."
            rows={data.sources.map((row) => ({ label: sourceLabel(row.label), value: row.value }))}
          />
          <BarList
            id="analytics-devices"
            title="Apparaten"
            valueLabel="sessies"
            total={data.totals.current.sessions}
            empty="Nog geen sessies in deze periode."
            rows={data.devices.map((row) => ({ label: deviceLabel(row.label), value: row.value }))}
          />
          <BarList
            id="analytics-cities"
            title="Steden"
            description="Volgens het IP-adres van de bezoeker; Google verbergt kleine plaatsen als “Onbekend”."
            valueLabel="sessies"
            total={data.totals.current.sessions}
            empty="Nog geen sessies in deze periode."
            rows={data.cities.map((row) => ({ label: placeLabel(row.label), value: row.value }))}
          />
          <BookingFunnel
            id="analytics-funnel"
            current={data.funnel.current}
            previous={data.funnel.previous}
          />
        </div>

        <p className="text-xs text-muted-foreground">
          Cijfers van Google Analytics, hoogstens een uur oud. Bezoekers die geen cookies accepteren
          worden niet gemeten, dus de echte aantallen liggen hoger.
        </p>
      </div>
    </>
  );
}

function Kpis({ data }: { data: AnalyticsDeepDiveConnected }) {
  const { current, previous } = data.totals;
  const newShare = share(current.newUsers, current.activeUsers);
  const tiles = [
    {
      label: 'Bezoekers',
      value: compactNumber(current.activeUsers),
      delta: delta(current.activeUsers, previous.activeUsers),
      sparkline: data.daily.activeUsers.current.map((point) => point.value),
    },
    {
      label: 'Nieuwe bezoekers',
      value: compactNumber(current.newUsers),
      delta: delta(current.newUsers, previous.newUsers),
      hint:
        current.activeUsers > 0
          ? `${nlNumber.format(Math.round(newShare))} % van alle bezoekers`
          : undefined,
    },
    {
      label: 'Sessies',
      value: compactNumber(current.sessions),
      delta: delta(current.sessions, previous.sessions),
      sparkline: data.daily.sessions.current.map((point) => point.value),
    },
    {
      label: 'Paginaweergaven',
      value: compactNumber(current.screenPageViews),
      delta: delta(current.screenPageViews, previous.screenPageViews),
      sparkline: data.daily.screenPageViews.current.map((point) => point.value),
    },
    {
      label: 'Betrokkenheid',
      value: formatRate(current.engagementRate),
      delta: delta(current.engagementRate, previous.engagementRate),
      hint: 'Sessies van 10 s of langer, met 2+ pagina’s of een conversie',
    },
    {
      label: 'Gem. sessieduur',
      value: formatSeconds(current.averageSessionDuration),
      delta: delta(current.averageSessionDuration, previous.averageSessionDuration),
    },
  ];

  return (
    <section
      aria-label="Kerncijfers"
      className="grid gap-px border border-border bg-border sm:grid-cols-2 lg:grid-cols-3"
    >
      {tiles.map((tile) => (
        <StatTile key={tile.label} {...tile} />
      ))}
    </section>
  );
}
