import { nlNumber, share } from '@/lib/analytics/deep-dive-shape';

import { ChartCard } from './chart-card';

/**
 * A ranked list with a horizontal bar per row: the bar is scaled to the
 * largest row, the number and its share of the total are printed beside the
 * label, so nothing is read from colour or length alone. The row's `title`
 * carries the same text as a hover tooltip. Server component.
 */

export function BarList({
  id,
  title,
  description,
  rows,
  valueLabel,
  total,
  empty,
  mono = false,
  sublabel,
}: {
  id: string;
  title: string;
  description?: string;
  rows: ReadonlyArray<{ label: string; value: number; detail?: string }>;
  /** Lower case, e.g. "sessies"; used in the tooltip. */
  valueLabel: string;
  /** The denominator of the share; defaults to the sum of the rows. */
  total?: number;
  empty: string;
  mono?: boolean;
  /** Shown under the title when there are rows, e.g. "Aandeel van alle sessies". */
  sublabel?: string;
}) {
  const sum = total ?? rows.reduce((acc, row) => acc + row.value, 0);
  const max = Math.max(1, ...rows.map((row) => row.value));

  return (
    <ChartCard id={id} title={title} description={description}>
      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">{empty}</p>
      ) : (
        <>
          {sublabel ? <p className="mb-2 text-xs text-muted-foreground">{sublabel}</p> : null}
          <ol className="flex flex-col divide-y divide-border">
            {rows.map((row, index) => {
              const percent = share(row.value, sum);
              const percentText = `${nlNumber.format(Math.round(percent))} %`;
              return (
                <li
                  key={`${row.label}-${index}`}
                  className="grid grid-cols-[minmax(0,1fr)_auto] items-end gap-x-3 gap-y-1 py-2"
                  title={`${row.label}: ${nlNumber.format(row.value)} ${valueLabel} (${percentText})`}
                >
                  <span className={`truncate text-sm ${mono ? 'font-mono text-[13px]' : ''}`}>
                    {row.label}
                  </span>
                  <span className="text-sm tabular-nums">
                    {nlNumber.format(row.value)}{' '}
                    <span className="text-muted-foreground">({percentText})</span>
                  </span>
                  <div className="col-span-2 h-2 w-full bg-ds-bone-200" aria-hidden="true">
                    <div
                      className="h-full rounded-r-[4px] bg-primary"
                      style={{ width: `${Math.max(1, (row.value / max) * 100)}%` }}
                    />
                  </div>
                  {row.detail ? (
                    <span className="col-span-2 text-xs text-muted-foreground">{row.detail}</span>
                  ) : null}
                </li>
              );
            })}
          </ol>
        </>
      )}
    </ChartCard>
  );
}
