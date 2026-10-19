import { ArrowUpRightFromSquare } from 'lucide-react';

import { buttonVariants } from '@/components/ui/button';

/** The icon button that opens the GA4 property's home report in a new tab. */
export function GoogleAnalyticsLink({ propertyId }: { propertyId: string }) {
  const label = 'Open in Google Analytics';
  return (
    <a
      href={`https://analytics.google.com/analytics/web/#/p${propertyId}/reports/intelligenthome`}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={label}
      title={label}
      className={buttonVariants({ variant: 'outline', size: 'icon-sm' })}
    >
      <ArrowUpRightFromSquare aria-hidden="true" />
    </a>
  );
}
