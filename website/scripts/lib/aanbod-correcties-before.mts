/**
 * TEST SUPPORT for `cms:patch-aanbod-correcties`, not part of the CLI: the
 * pages of an existing database as they were before 27 Oct 2026, derived from
 * today's seeds and the page specs themselves, and what the patch turns them
 * into. Used by `aanbod-correcties-pages.test.ts` (plain block lists) and by
 * self-test section 17d (`scripts/selftest/aanbod-correcties-fixture.mts`, which
 * writes them into the throwaway database).
 *
 * How the old content is made: the seed page as the database stores it (the
 * seeds, and for the legal pages and the FAQ the texts of `scripts/cms-seed.mts`:
 * `corrections-test-kit.ts` reads them), with the edits of the day undone, the
 * contact tokens turned back into the old phone number, and the sections the
 * seeds gained removed (the location block, the voucher section, the voucher
 * block's new fields, the new card text).
 */
import { CADEAUBON_PAGE } from '@/lib/studio/seed-content/cadeaubon';
import { CONTACT_EDITS } from '@/lib/studio/seed-content/corrections-2026-10-27';
import { inverse, seedBlocks, stored } from '@/lib/studio/seed-content/corrections-test-kit';
import {
  cleanupBlocks,
  type CleanupBlock,
  type PageCleanupSpec,
} from '@/lib/studio/seed-content/page-cleanup';
import { PAGE_SOURCES, type WorkBlock } from './aanbod-correcties-pages.mjs';

const { promo, locationSlug, specs } = PAGE_SOURCES;

/** What undoes the contact edits: the tokens back to the facts, the international number back to the old one. */
export const CONTACT_BACK: PageCleanupSpec = {
  slug: '',
  edits: [...CONTACT_EDITS]
    .reverse()
    .map((edit) => (edit.kind === 'replaceAll' ? { ...edit, from: edit.to, to: edit.from } : edit)),
};

const without = (data: Record<string, unknown>, ...keys: string[]) =>
  Object.fromEntries(Object.entries(data).filter(([key]) => !keys.includes(key)));

export type PageFixture = {
  /** What an existing database holds before the patch (ids are made up). */
  old: WorkBlock[];
  /** What the patch must turn it into. */
  target: CleanupBlock[];
};

/** One page of an existing database before 27 Oct 2026, and what it becomes. */
export function pageFixture(slug: string): PageFixture {
  const target = slug === promo.voucherPage.slug ? stored(CADEAUBON_PAGE.blocks) : seedBlocks(slug);

  let old = target;
  for (const pageSpec of specs.filter((entry) => entry.slug === slug).reverse()) {
    old = cleanupBlocks(inverse(pageSpec), old).next;
  }
  old = cleanupBlocks(CONTACT_BACK, old).next;
  if (slug === locationSlug) old = old.filter((block) => block.type !== 'location');
  if (slug === promo.home.slug) {
    old = old.filter((block) => block.data.title !== promo.home.block.data.title);
  }
  if (slug === promo.voucherPage.slug) {
    // As `cms:seed` wrote it on 13 Oct 2026: no suggested amounts, no validity line.
    old = old.map((block) => ({
      type: block.type,
      data: {
        ...without(block.data, 'amounts', 'validityNote'),
        summary: promo.voucherPage.blockEdits[0].from,
      },
    }));
  }
  if (slug === promo.aanbodCard.slug) {
    old = old.map((block) =>
      block.type === promo.aanbodCard.blockType
        ? {
            type: block.type,
            data: {
              ...block.data,
              extraCards: (block.data.extraCards as Record<string, unknown>[]).map((card) =>
                card.href === promo.aanbodCard.cardHref
                  ? { ...card, summary: promo.aanbodCard.edits[0].from }
                  : card,
              ),
            },
          }
        : block,
    );
  }
  return {
    old: old.map((block, index) => ({ id: `${slug || 'home'}-${index}`, ...block })),
    target,
  };
}

/** The meta title and description the page had, from the guards of its spec (null: it had no guard). */
export function oldPageTexts(slug: string): {
  metaTitle: string | null;
  metaDescription: string | null;
} {
  const own = specs.find((entry) => entry.slug === slug);
  return {
    metaTitle: own?.metaTitle?.from ?? null,
    metaDescription: own?.metaDescription?.from ?? null,
  };
}
