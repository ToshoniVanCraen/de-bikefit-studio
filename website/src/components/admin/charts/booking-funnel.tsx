import { formatRate, nlNumber, share } from '@/lib/analytics/deep-dive-shape';
import type { DeepDiveFunnel } from '@/lib/analytics/ga4-deep-dive';

import { ChartCard } from './chart-card';

/**
 * From the appointment page to the confirmation page: two steps as bars
 * scaled to the first, the conversion as the headline number with the
 * previous period beside it. Users rather than views, so a reload does not
 * count twice. Server component.
 */

export function BookingFunnel({
  id,
  current,
  previous,
}: {
  id: string;
  current: DeepDiveFunnel;
  previous: DeepDiveFunnel;
}) {
  const conversion = share(current.confirmation.users, current.appointment.users) / 100;
  const previousConversion = share(previous.confirmation.users, previous.appointment.users) / 100;
  const steps = [
    { label: 'Afspraakpagina bekeken', step: current.appointment },
    { label: 'Bevestiging gezien', step: current.confirmation },
  ];
  const max = Math.max(1, current.appointment.users);

  return (
    <ChartCard
      id={id}
      title="Van afspraakpagina naar bevestiging"
      description="Bezoekers die /afspraak openden en bezoekers die daarna de bevestigingspagina zagen."
    >
      {current.appointment.users === 0 ? (
        <p className="text-sm text-muted-foreground">
          Nog geen bezoekers op de afspraakpagina in deze periode.
        </p>
      ) : (
        <div className="flex flex-col gap-5">
          <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
            <p className="font-ds-display text-4xl leading-none font-semibold tabular-nums">
              {formatRate(conversion)}
            </p>
            <p className="text-sm text-muted-foreground">
              van de bezoekers zag de bevestiging
              {previous.appointment.users > 0 ? (
                <>
                  {' '}
                  · vorige periode{' '}
                  <span className="tabular-nums">{formatRate(previousConversion)}</span>
                </>
              ) : null}
            </p>
          </div>
          <ol className="flex flex-col gap-3">
            {steps.map(({ label, step }) => (
              <li
                key={label}
                className="grid grid-cols-[minmax(0,1fr)_auto] items-end gap-x-3 gap-y-1"
                title={`${label}: ${nlNumber.format(step.users)} bezoekers, ${nlNumber.format(step.views)} weergaven`}
              >
                <span className="truncate text-sm">{label}</span>
                <span className="text-sm tabular-nums">
                  {nlNumber.format(step.users)}{' '}
                  <span className="text-muted-foreground">
                    bezoekers · {nlNumber.format(step.views)} weergaven
                  </span>
                </span>
                <div className="col-span-2 h-2 w-full bg-ds-bone-200" aria-hidden="true">
                  <div
                    className="h-full rounded-r-[4px] bg-primary"
                    style={{ width: `${Math.max(1, (step.users / max) * 100)}%` }}
                  />
                </div>
              </li>
            ))}
          </ol>
        </div>
      )}
    </ChartCard>
  );
}
