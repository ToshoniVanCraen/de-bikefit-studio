'use client';

import { useEffect, useId, useRef, useState } from 'react';

import { formatDay, formatLongDay } from '@/lib/analytics/dates';
import {
  axisTicks,
  compactNumber,
  labelIndices,
  linePath,
  nearestIndex,
  niceMax,
  nlNumber,
  xAt,
  yAt,
  type ChartBox,
  type DayPoint,
} from '@/lib/analytics/deep-dive-shape';

/**
 * Daily line chart, one or more series over the same number of days (the
 * previous period lines up with the current one by index). Inline SVG sized
 * to its container, 2px lines, a recessive grid, a legend, a crosshair with a
 * tooltip on hover (and on the arrow keys), and a table view as the
 * accessible twin. The only client component of the deep dive.
 */

export type LineSeries = {
  id: string;
  label: string;
  points: DayPoint[];
  /** A CSS colour (a `var(--color-ds-…)` token). */
  color: string;
  dashed?: boolean;
};

const HEIGHT = 240;
const MARGIN = { top: 16, right: 16, bottom: 28, left: 44 };
const DEFAULT_WIDTH = 640;
const TOOLTIP_WIDTH = 220;

export function LineChart({
  title,
  series,
  valueLabel,
  empty,
}: {
  /** Names the chart for assistive technology; the visible heading is the card's. */
  title: string;
  series: LineSeries[];
  /** Lower case, e.g. "sessies". */
  valueLabel: string;
  empty: string;
}) {
  const tableId = useId();
  const containerRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(DEFAULT_WIDTH);
  const [hover, setHover] = useState<number | null>(null);
  const [view, setView] = useState<'chart' | 'table'>('chart');

  useEffect(() => {
    const node = containerRef.current;
    if (!node) return;
    const observer = new ResizeObserver((entries) => {
      const next = Math.round(entries[0]?.contentRect.width ?? 0);
      if (next > 0) setWidth(next);
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const primary = series[0];
  const count = primary?.points.length ?? 0;
  const box: ChartBox = { width, height: HEIGHT, ...MARGIN };
  const max = niceMax(Math.max(0, ...series.flatMap((line) => line.points.map((p) => p.value))));
  const ticks = axisTicks(max);
  const total = series.reduce(
    (sum, line) => sum + line.points.reduce((acc, point) => acc + point.value, 0),
    0,
  );

  if (!primary || count === 0) {
    return <p className="text-sm text-muted-foreground">{empty}</p>;
  }

  const onPointerMove = (event: React.PointerEvent<SVGSVGElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    setHover(nearestIndex(event.clientX - rect.left, count, box));
  };

  const onKeyDown = (event: React.KeyboardEvent<SVGSVGElement>) => {
    if (event.key === 'ArrowRight') {
      event.preventDefault();
      setHover((index) => Math.min(count - 1, (index ?? -1) + 1));
    } else if (event.key === 'ArrowLeft') {
      event.preventDefault();
      setHover((index) => Math.max(0, (index ?? count) - 1));
    } else if (event.key === 'Escape') {
      setHover(null);
    }
  };

  const hoverX = hover === null ? null : xAt(hover, count, box);
  const tooltipLeft = hoverX !== null && hoverX > width / 2;

  return (
    <div className="flex min-w-0 flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs" aria-label="Legenda">
          {series.map((line) => (
            <li key={line.id} className="flex items-center gap-2">
              <svg aria-hidden="true" width="20" height="8" className="shrink-0">
                <line
                  x1="1"
                  y1="4"
                  x2="19"
                  y2="4"
                  stroke={line.color}
                  strokeWidth={2}
                  strokeLinecap="round"
                  strokeDasharray={line.dashed ? '4 3' : undefined}
                />
              </svg>
              {line.label}
            </li>
          ))}
        </ul>
        <div
          className="inline-flex border border-border text-xs"
          role="group"
          aria-label="Weergave"
        >
          {(['chart', 'table'] as const).map((option) => (
            <button
              key={option}
              type="button"
              aria-pressed={view === option}
              onClick={() => setView(option)}
              className={
                view === option
                  ? 'bg-primary px-2.5 py-1 text-primary-foreground'
                  : 'px-2.5 py-1 hover:bg-muted'
              }
            >
              {option === 'chart' ? 'Grafiek' : 'Tabel'}
            </button>
          ))}
        </div>
      </div>

      {total === 0 ? <p className="text-sm text-muted-foreground">{empty}</p> : null}

      {view === 'chart' ? (
        <div ref={containerRef} className="relative w-full">
          <svg
            role="img"
            aria-label={`${title}: ${series.map((line) => line.label).join(' en ')}, per dag`}
            aria-describedby={tableId}
            tabIndex={0}
            width={width}
            height={HEIGHT}
            viewBox={`0 0 ${width} ${HEIGHT}`}
            className="block w-full touch-none outline-none select-none focus-visible:ring-3 focus-visible:ring-ring/50"
            onPointerMove={onPointerMove}
            onPointerLeave={() => setHover(null)}
            onKeyDown={onKeyDown}
          >
            {ticks.map((tick, index) => {
              const y = yAt(tick, max, box);
              return (
                <g key={tick}>
                  <line
                    x1={box.left}
                    x2={width - box.right}
                    y1={y}
                    y2={y}
                    stroke={index === 0 ? 'var(--input)' : 'var(--border)'}
                    strokeWidth={1}
                  />
                  <text
                    x={box.left - 8}
                    y={y + 4}
                    textAnchor="end"
                    fontSize={11}
                    fill="var(--muted-foreground)"
                  >
                    {compactNumber(tick)}
                  </text>
                </g>
              );
            })}

            {labelIndices(count).map((index) => (
              <text
                key={index}
                x={xAt(index, count, box)}
                y={HEIGHT - 8}
                textAnchor={index === 0 ? 'start' : index === count - 1 ? 'end' : 'middle'}
                fontSize={11}
                fill="var(--muted-foreground)"
              >
                {formatDay(primary.points[index].date)}
              </text>
            ))}

            {series.map((line) => (
              <path
                key={line.id}
                d={linePath(
                  line.points.map((point) => point.value),
                  max,
                  box,
                )}
                fill="none"
                stroke={line.color}
                strokeWidth={2}
                strokeLinejoin="round"
                strokeLinecap="round"
                strokeDasharray={line.dashed ? '4 3' : undefined}
              />
            ))}

            {hover !== null && hoverX !== null ? (
              <g aria-hidden="true">
                <line
                  x1={hoverX}
                  x2={hoverX}
                  y1={box.top}
                  y2={HEIGHT - box.bottom}
                  stroke="var(--input)"
                  strokeWidth={1}
                />
                {series.map((line) => {
                  const point = line.points[hover];
                  if (!point) return null;
                  return (
                    <circle
                      key={line.id}
                      cx={hoverX}
                      cy={yAt(point.value, max, box)}
                      r={4}
                      fill={line.color}
                      stroke="var(--card)"
                      strokeWidth={2}
                    />
                  );
                })}
              </g>
            ) : null}
          </svg>

          {hover !== null && hoverX !== null ? (
            <div
              role="tooltip"
              className="pointer-events-none absolute top-0 border border-border bg-popover px-3 py-2 text-xs shadow-sm"
              style={{
                width: TOOLTIP_WIDTH,
                left: tooltipLeft ? hoverX - TOOLTIP_WIDTH - 12 : hoverX + 12,
              }}
            >
              <p className="font-medium">{formatLongDay(primary.points[hover].date)}</p>
              <ul className="mt-1 flex flex-col gap-0.5">
                {series.map((line) => {
                  const point = line.points[hover];
                  if (!point) return null;
                  return (
                    <li key={line.id} className="flex items-center gap-2">
                      <span
                        aria-hidden="true"
                        className="inline-block size-2 shrink-0 rounded-full"
                        style={{ background: line.color }}
                      />
                      <span className="min-w-0 flex-1 truncate text-muted-foreground">
                        {line.label}
                        {line.id !== primary.id ? ` (${formatDay(point.date)})` : ''}
                      </span>
                      <span className="tabular-nums">
                        {nlNumber.format(point.value)} {valueLabel}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </div>
          ) : null}
        </div>
      ) : null}

      <div className={view === 'table' ? '' : 'sr-only'}>
        <table id={tableId} className="w-full border border-border text-xs">
          <thead className="bg-muted">
            <tr className="border-b border-border text-left text-muted-foreground">
              <th scope="col" className="py-2 pr-3 pl-3">
                Dag
              </th>
              {series.map((line) => (
                <th key={line.id} scope="col" className="py-2 pr-3 text-right">
                  {line.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {primary.points.map((point, index) => (
              <tr key={point.date} className="border-b border-border last:border-0">
                <td className="py-1.5 pr-3 pl-3">{formatLongDay(point.date)}</td>
                {series.map((line) => {
                  const cell = line.points[index];
                  return (
                    <td key={line.id} className="py-1.5 pr-3 text-right tabular-nums">
                      {cell ? nlNumber.format(cell.value) : '—'}
                      {cell && line.id !== primary.id ? (
                        <span className="text-muted-foreground"> ({formatDay(cell.date)})</span>
                      ) : null}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
