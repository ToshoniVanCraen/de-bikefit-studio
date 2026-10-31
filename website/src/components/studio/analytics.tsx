import { resolveMeasurementId } from '@/lib/analytics/consent';
import { Ga4Tag } from '@/lib/analytics/ga4-tag';
import type { SiteSettings } from '@/lib/cms/blocks';
import { listPublishedPages } from '@/lib/cms/content';
import { env } from '@/lib/env';
import { defaultLocale, localePath } from '@/lib/studio/locale';

import { ConsentBanner } from './consent-banner';

/**
 * Site-wide consent for Google Maps and, when configured, Google Analytics 4.
 *
 * The banner always mounts on the public site because the appointment map
 * remains available even if GA4 is disabled. The GA4 tag mounts only when a
 * valid measurement id is configured and analytics.enabled is on. Neither
 * third party loads before the versioned consent; Maps also has a per-view
 * click option for visitors without banner consent.
 */

export function studioMeasurementId(settings: SiteSettings): string | null {
  return resolveMeasurementId(env.NEXT_PUBLIC_GA4_MEASUREMENT_ID, settings.analytics.enabled);
}

/** Published CMS pages that count as "the privacy page" for the banner link. */
const PRIVACY_SLUGS = ['privacy', 'privacybeleid', 'privacyverklaring'];

async function privacyHref(locale: string): Promise<string | null> {
  try {
    const pages = await listPublishedPages(locale);
    const match = PRIVACY_SLUGS.find((slug) => pages.some((page) => page.slug === slug));
    return match ? localePath(locale, match) : null;
  } catch {
    return null;
  }
}

export async function StudioAnalytics({
  settings,
  locale = defaultLocale,
}: {
  settings: SiteSettings;
  locale?: string;
}) {
  const measurementId = studioMeasurementId(settings);
  return (
    <>
      <ConsentBanner privacyHref={await privacyHref(locale)} analyticsEnabled={!!measurementId} />
      {measurementId ? <Ga4Tag measurementId={measurementId} /> : null}
    </>
  );
}
