import type { MetadataRoute } from 'next';

/**
 * What `/robots.txt` says, as a function of the one switch an admin flips:
 * Instellingen → SEO → *Indexeren toestaan* (`seo.allowIndexing`). Plain
 * module, tested in `robots-rules.test.ts`; `src/app/robots.ts` reads the
 * setting and calls this.
 *
 * Off (the default, and staging for its whole life): `Disallow: /` for every
 * crawler. On: everything of the studio site is allowed; the areas that must
 * never be crawled stay disallowed — the CMS admin, the API surface, and the
 * whole legacy webshop (Qarakter: shop, checkout, account, blog, about,
 * policies, sign-in and sign-up), which is kept as code but is not the
 * studio's product. Those legacy pages also carry `noindex` in their own
 * metadata (`webshopMetadata`), so a link to one is never indexed either.
 *
 * The `Sitemap:` line is emitted in both states: a disallowed sitemap is
 * simply not fetched, and flipping the switch then needs no second change.
 */

/** Paths no crawler may enter, whatever the switch says. */
export const NEVER_CRAWLED = [
  '/admin',
  '/api',
  '/shop',
  '/webshop',
  '/checkout',
  '/account',
  '/blog',
  '/about',
  '/policies',
  '/sign-in',
  '/sign-up',
] as const;

export function robotsRules(input: {
  allowIndexing: boolean;
  sitemapUrl: string;
  host: string;
}): MetadataRoute.Robots {
  if (!input.allowIndexing) {
    return {
      rules: [{ userAgent: '*', disallow: '/' }],
      sitemap: input.sitemapUrl,
    };
  }
  return {
    rules: [{ userAgent: '*', allow: '/', disallow: [...NEVER_CRAWLED] }],
    sitemap: input.sitemapUrl,
    host: input.host,
  };
}
