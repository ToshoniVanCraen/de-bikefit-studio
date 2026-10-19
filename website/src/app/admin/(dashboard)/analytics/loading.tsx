/**
 * Instant loading state of the analytics deep dive: the shape of the page
 * (heading, six KPI tiles, the line chart, the lists) while Google answers.
 */
export default function AnalyticsLoading() {
  return (
    <div role="status" aria-live="polite" className="flex flex-col gap-6">
      <span className="sr-only">Analytics laden…</span>
      <div aria-hidden="true" className="mb-2 flex flex-col gap-3 border-b border-border pb-5">
        <div className="h-9 w-48 max-w-full animate-pulse bg-muted" />
        <div className="h-4 w-96 max-w-full animate-pulse bg-muted" />
      </div>
      <div aria-hidden="true" className="h-4 w-80 max-w-full animate-pulse bg-muted" />
      <div
        aria-hidden="true"
        className="grid gap-px border border-border bg-border sm:grid-cols-2 lg:grid-cols-3"
      >
        {Array.from({ length: 6 }, (_, index) => (
          <div key={index} className="h-28 animate-pulse bg-card" />
        ))}
      </div>
      <div aria-hidden="true" className="h-80 animate-pulse border border-border bg-card" />
      <div aria-hidden="true" className="grid gap-6 lg:grid-cols-2">
        {Array.from({ length: 4 }, (_, index) => (
          <div key={index} className="h-64 animate-pulse border border-border bg-card" />
        ))}
      </div>
    </div>
  );
}
