/**
 * The frame every analytics figure sits in: the admin card, a heading the
 * figure is labelled by, an optional one-line description and optional
 * controls on the right. Server component; the charts inside decide for
 * themselves whether they need the client.
 */

export const CHART_CARD = 'border border-border bg-card p-5 sm:p-6';

/** Series colours: tokens only (CLAUDE.md §3). The previous period is a neutral ink, dashed. */
export const SERIES_COLOR = {
  current: 'var(--color-ds-burgundy-700)',
  previous: 'var(--color-ds-ink-500)',
} as const;

export function ChartCard({
  id,
  title,
  description,
  actions,
  children,
  className,
}: {
  id: string;
  title: string;
  description?: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      className={`${CHART_CARD} flex min-w-0 flex-col ${className ?? ''}`}
      aria-labelledby={id}
    >
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 id={id} className="text-xl leading-tight">
            {title}
          </h2>
          {description ? <p className="mt-1 text-sm text-muted-foreground">{description}</p> : null}
        </div>
        {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
      </div>
      {children}
    </section>
  );
}
