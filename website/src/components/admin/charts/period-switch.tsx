import Link from 'next/link';

import { DEEP_DIVE_PERIODS, type DeepDivePeriod } from '@/lib/analytics/deep-dive-shape';

/** The 7 / 28 / 90-day switch of the deep dive: plain links, so it needs no client. */
export function PeriodSwitch({ period }: { period: DeepDivePeriod }) {
  return (
    <nav aria-label="Periode" className="inline-flex border border-border bg-background text-sm">
      {DEEP_DIVE_PERIODS.map((days) => {
        const active = days === period;
        return (
          <Link
            key={days}
            href={`/admin/analytics?periode=${days}`}
            aria-current={active ? 'page' : undefined}
            className={
              active
                ? 'bg-primary px-3 py-1.5 text-primary-foreground'
                : 'px-3 py-1.5 hover:bg-muted'
            }
          >
            {days} dagen
          </Link>
        );
      })}
    </nav>
  );
}
