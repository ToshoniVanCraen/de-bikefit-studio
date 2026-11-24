/**
 * The database before the redesign of 24 Nov 2026, as staging and production hold it, written into
 * the throwaway PGlite for self-test section 17e (`site-redesign.mts`):
 *
 *  - the eight public pages exactly as the frozen definition says
 *    (`site-redesign-before.fixture.json`: the seeds after the patches of 27 to 31 Oct 2026),
 *    the rich text through the sanitiser as the repo stores it, the block data WITHOUT the fields
 *    the schemas gained since (as the rows written before the redesign are), published through
 *    the real `publishPage`;
 *  - the nine offerings with the generated default images they had, except `coaching` (a photo an
 *    editor chose, which must stay) and `bikefit-tweede-fiets` (no image at all).
 *
 * Starts from a clean slate for pages and offerings (`snapshotState` has the rest). Test data only.
 */
import * as orm from 'drizzle-orm';
import * as offeringSchema from '@/db/cms-offering-schema';
import { sanitizeRichTextHtml } from '@/lib/cms/actions/sanitize';
import before from '@/lib/studio/seed-content/site-redesign-before.fixture.json';
import { withAdminSession } from '../lib/aanbod-rollout-run.mjs';
import { ensureDefaultOfferings } from '../lib/offerings-bootstrap.mjs';
import type { CorrectiesKit, CorrectiesSectionContext } from './aanbod-correcties-kit.mjs';

const { and, eq } = orm;

type FrozenPage = {
  slug: string;
  title: string;
  metaTitle: string;
  metaDescription: string;
  blocks: Array<{ type: string; data: Record<string, unknown> }>;
};
export const FROZEN_PAGES = (before as unknown as { pages: FrozenPage[] }).pages;

/** An editor's own photo on the coaching offering: the patch must leave it. */
export const EDITOR_PHOTO = {
  mediaId: null,
  url: '/images/team/rutger-roelandts-v1.webp',
  alt: 'Eigen foto van de redactie',
  decorative: false,
};

/** The generated default each offering carried before the redesign (`null`: none). */
const OLD_IMAGES: Record<string, unknown> = {
  'bikefit-nieuwe-fiets': '/images/editorial/bikefit-studio-v1.webp',
  'bikefit-huidige-fiets': '/images/editorial/bikefit-studio-v1.webp',
  'bikefit-tweede-bezoek': '/images/editorial/bikefit-studio-v1.webp',
  'bikefit-tweede-fiets': null,
  voetanalyse: '/images/editorial/bikefit-studio-v1.webp',
  zadelanalyse: '/images/editorial/bikefit-studio-v1.webp',
  'afstellen-schoenplaatjes': '/images/editorial/bikefit-studio-v1.webp',
  lactaattest: '/images/editorial/flemish-cyclists-v1.webp',
  coaching: EDITOR_PHOTO,
};

function oldImage(slug: string) {
  const value = OLD_IMAGES[slug];
  if (value === null || typeof value === 'object') return value ?? null;
  return { mediaId: null, url: value, alt: 'Een gegenereerd sfeerbeeld', decorative: false };
}

const stored = (data: Record<string, unknown>) =>
  typeof data.html === 'string' ? { ...data, html: sanitizeRichTextHtml(data.html) } : data;

export async function seedRedesignBefore(
  kit: Pick<CorrectiesKit, 'db' | 'schema' | 'locale'>,
  ctx: Pick<CorrectiesSectionContext, 'cookieJar' | 'admin'>,
): Promise<Record<string, string>> {
  const { db, schema, locale } = kit;

  // --- the nine offerings, with the images they had ----------------------------------------
  await db.delete(offeringSchema.cmsOfferings);
  await ensureDefaultOfferings({
    db,
    orm,
    schema: { cmsServices: schema.cmsServices, DEFAULT_LOCALE: locale },
    offerings: offeringSchema,
    log: () => {},
  });
  for (const slug of Object.keys(OLD_IMAGES)) {
    await db
      .update(offeringSchema.cmsOfferings)
      .set({ image: oldImage(slug) as (typeof offeringSchema.cmsOfferings.$inferInsert)['image'] })
      .where(
        and(
          eq(offeringSchema.cmsOfferings.locale, locale),
          eq(offeringSchema.cmsOfferings.slug, slug),
        ),
      );
  }

  // --- the eight pages, published -------------------------------------------------------------
  await db.delete(schema.cmsPages);
  const pageIds: Record<string, string> = {};
  for (const page of FROZEN_PAGES) {
    const [row] = await db
      .insert(schema.cmsPages)
      .values({
        locale,
        slug: page.slug,
        translationGroup: page.slug || 'home',
        title: page.title,
        metaTitle: page.metaTitle,
        metaDescription: page.metaDescription,
      })
      .returning({ id: schema.cmsPages.id });
    await db.insert(schema.cmsBlocks).values(
      page.blocks.map((block, index) => ({
        pageId: row.id,
        sortOrder: index,
        type: block.type,
        data: stored(block.data),
      })),
    );
    pageIds[page.slug] = row.id;
  }
  await withAdminSession(
    { db, cookieJar: ctx.cookieJar },
    ctx.admin.id,
    'cms-selftest-17e',
    async () => {
      const repo = await import('@/lib/cms/repo');
      for (const [slug, id] of Object.entries(pageIds)) {
        const published = await repo.publishPage(id);
        if (!published.ok) throw new Error(`17e fixture: /${slug}: ${published.message}`);
      }
    },
  );
  return pageIds;
}
