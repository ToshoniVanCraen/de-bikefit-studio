import type { BlockInstance } from '@/lib/cms/blocks';
import { visibleBlocks } from '@/lib/studio/blocks';
import {
  breadcrumbJsonLd,
  faqJsonLd,
  jsonLdDocument,
  servicesJsonLd,
  webPageJsonLd,
  type BreadcrumbEntry,
} from '@/lib/studio/jsonld';
import { resolveCopy } from '@/lib/studio/copy-token-lookup';
import { absoluteUrl, type StudioPage } from '@/lib/studio/site';
import { BlockRenderer } from './blocks';
import { JsonLd } from './json-ld';
import { StudioBreadcrumb, type PageHeroCrumb } from './page-hero';

/**
 * Renders one published page: its structured data, its breadcrumb and its
 * blocks.
 *
 * The breadcrumb always goes out as `BreadcrumbList` JSON-LD. It is shown as
 * visible markup only on nested pages (`/aanbod/voetanalyse`), built from the
 * same array with the published ancestors in between, so the two can never
 * disagree (an offering's page, `/aanbod/<slug>`, is rendered by
 * `offer-detail.tsx` and does the same). On a top-level page "Home / Aanbod" only repeats the header
 * navigation, so it is left out there (Toshoni's review, 13 Oct 2026). Since
 * the 24 Nov 2026 redesign the trail sits inside the page hero, above its
 * eyebrow, when the page opens on a `hero` page head (`page.crumbs`); a nested
 * page that opens on anything else keeps it on its own bar.
 *
 * `requestedService` is the validated `?dienst=` value and `requestedExtra`
 * the validated `?extra=` value; only the booking block reads them.
 *
 * Copy tokens (`{{telefoon}}`, `{{prijs:…}}`, …): the structured data says what
 * the page says, so the FAQ answers, the service descriptions and the page
 * description are resolved here. `BlockRenderer` resolves the same blocks for
 * the markup itself, from the raw snapshot: a text is resolved once and never
 * again from what an earlier pass printed (the engine is single pass). The
 * stored snapshot keeps the tokens as typed.
 */
export async function StudioPageView({
  studio,
  requestedService = null,
  requestedExtra = null,
}: {
  studio: StudioPage;
  requestedService?: string | null;
  requestedExtra?: string | null;
}) {
  const { page, settings, canonical, locale, parents } = studio;
  const origin = absoluteUrl('/').replace(/\/+$/, '');
  const isHome = page.slug === '';
  const blocks = page.snapshot.blocks;
  const spoken = await resolveCopy(blocks, locale);

  const trail: BreadcrumbEntry[] = isHome
    ? []
    : [
        { name: 'Home', url: `${origin}/` },
        ...parents.map((parent) => ({ name: parent.title, url: absoluteUrl(parent.path) })),
        { name: page.title, url: canonical },
      ];

  // The visible trail: nested pages only, the page head prints it when the
  // page opens on one (design `.crumbs`), otherwise it gets its own bar.
  const crumbs: PageHeroCrumb[] | null =
    parents.length > 0
      ? [
          { label: 'Home', href: '/' },
          ...parents.map((parent) => ({ label: parent.title, href: parent.path })),
          { label: page.title },
        ]
      : null;
  const crumbsInHead = opensOnPageHead(blocks);

  const description = await resolveCopy(
    page.snapshot.seo.metaDescription?.trim() ||
      settings.seo.defaultMetaDescription.trim() ||
      undefined,
    locale,
  );

  const graph = jsonLdDocument([
    webPageJsonLd({
      origin,
      canonical,
      locale,
      title: page.title,
      description,
      datePublished: page.publishedAt,
      dateModified: page.updatedAt,
      structuredDataType: page.snapshot.seo.structuredDataType,
      hasBreadcrumb: trail.length > 0,
    }),
    trail.length > 0 ? breadcrumbJsonLd(canonical, trail) : null,
    faqJsonLd(spoken, canonical),
    ...servicesJsonLd(spoken, settings, origin),
  ]);

  return (
    <>
      <JsonLd data={graph} />

      {crumbs && !crumbsInHead ? (
        <StudioBreadcrumb crumbs={crumbs} className="studio-breadcrumb-bar" />
      ) : null}

      <BlockRenderer
        blocks={blocks}
        locale={locale}
        page={{
          slug: page.slug,
          requestedService,
          requestedExtra,
          ...(crumbs && crumbsInHead ? { crumbs } : {}),
        }}
      />
    </>
  );
}

/** True when the first block a visitor sees is a `hero` page head. */
function opensOnPageHead(blocks: readonly BlockInstance[]): boolean {
  const first = visibleBlocks(blocks)[0];
  return first?.type === 'hero' && first.data.variant === 'pageHead';
}
