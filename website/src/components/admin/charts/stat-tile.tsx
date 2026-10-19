import {
  formatDelta,
  linePath,
  niceMax,
  type ChartBox,
  type Delta,
} from '@/lib/analytics/deep-dive-shape';

import { SERIES_COLOR } from './chart-card';

/**
 * One KPI: label, the number, the change against the previous period (arrow
 * plus text, never colour alone) and an optional sparkline of the daily
 * values. Server component.
 */

const SPARK: ChartBox = { width: 120, height: 28, top: 3, right: 2, bottom: 3, left: 2 };

const ARROW: Record<Delta['direction'], string> = { up: '↑', down: '↓', flat: '→' };

export function StatTile({
  label,
  value,
  delta,
  hint,
  sparkline,
}: {
  label: string;
  value: string;
  delta?: Delta;
  hint?: string;
  sparkline?: readonly number[];
}) {
  return (
    <div className="flex min-w-0 flex-col gap-2 bg-background p-4">
      <p className="admin-label text-xs text-muted-foreground">{label}</p>
      <p className="font-ds-display text-4xl leading-none font-semibold tabular-nums">{value}</p>
      {delta ? (
        <p className="text-xs text-muted-foreground">
          <span className="font-medium text-foreground tabular-nums">
            <span aria-hidden="true">{ARROW[delta.direction]} </span>
            {formatDelta(delta)}
          </span>{' '}
          t.o.v. vorige periode
        </p>
      ) : null}
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
      {sparkline && sparkline.length > 1 ? <Sparkline values={sparkline} /> : null}
    </div>
  );
}

function Sparkline({ values }: { values: readonly number[] }) {
  const max = niceMax(Math.max(...values));
  return (
    <svg
      aria-hidden="true"
      viewBox={`0 0 ${SPARK.width} ${SPARK.height}`}
      preserveAspectRatio="none"
      className="mt-auto h-7 w-full"
    >
      <path
        d={linePath(values, max, SPARK)}
        fill="none"
        stroke={SERIES_COLOR.current}
        strokeWidth={2}
        strokeLinejoin="round"
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}
