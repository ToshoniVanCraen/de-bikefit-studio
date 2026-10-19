import type { MetadataRoute } from 'next';
import { getSiteSettings } from '@/lib/cms/content';
import { defaultLocale } from '@/lib/studio/locale';
import { robotsRules } from '@/lib/studio/robots-rules';
import { absoluteUrl } from '@/lib/studio/site';

/**
 * `/robots.txt`, driven by the `seo.allowIndexing` site setting.
 *
 * `allowIndexing` defaults to **false**, so a staging deployment tells every
 * crawler `Disallow: /` until someone deliberately turns indexing on in the
 * admin. That is the one switch standing between a staging URL and Google.
 *
 * When it is on, everything of the studio site is allowed; the areas that
 * must never be crawled stay disallowed — the CMS admin, the API surface and
 * the whole legacy webshop (`NEVER_CRAWLED` in `robots-rules.ts`, 19 Oct 2026;
 * until then only checkout and account were listed, so flipping the switch
 * would have opened the Qarakter demo shop to Google).
 *
 * The `Sitemap:` line is emitted in both states — a disallowed sitemap simply
 * is not fetched, and leaving it in means flipping the switch needs no second
 * change.
 *
 * Rendered per request rather than at build time: `allowIndexing` is a database
 * setting an admin can flip, and a `robots.txt` baked into a deployment would
 * keep saying `Disallow: /` until the next deploy. The underlying read is still
 * cached by `getSiteSettings()` and busted the moment the setting changes.
 * (It also keeps `next build` free of any database requirement.)
 */
export const dynamic = 'force-dynamic';

export default async function robots(): Promise<MetadataRoute.Robots> {
  const settings = await getSiteSettings(defaultLocale);
  return robotsRules({
    allowIndexing: settings.seo.allowIndexing,
    sitemapUrl: absoluteUrl('/sitemap.xml'),
    host: absoluteUrl('/').replace(/\/+$/, ''),
  });
}
