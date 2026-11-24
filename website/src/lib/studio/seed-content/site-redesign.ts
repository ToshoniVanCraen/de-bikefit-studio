import { sanitizeBlockData } from '@/lib/cms/actions/sanitize';
import { validateBlock } from '@/lib/cms/blocks';
import { DEFAULT_OFFERS } from '@/lib/offers/defaults';
import { AANBOD_PAGES } from './aanbod';
import { AFSPRAAK_PAGE } from './appointment';
import { CADEAUBON_PAGE } from './cadeaubon';
import { FAQ_BEGINNERS_ANCHOR, FAQ_PAGE } from './faq';
import { set, type CleanupBlock, type CleanupEdit, type Selector } from './page-cleanup';
import { canonicalData, type BlockEdit, type RestructureSpec } from './page-restructure';
import type { SeedBlock, SeedPage } from './shared';
import before from './site-redesign-before.fixture.json';

/**
 * The redesign of 24 Nov 2026 as exact, guarded changes: the pure half of
 * `npm run cms:patch-site-redesign` (I/O: `scripts/lib/site-redesign-*.mts`). The seeds already
 * hold the target state (`aanbod.ts`, `faq.ts`, `cadeaubon.ts`, `appointment.ts`,
 * `redesign-sections.ts`); `site-redesign-before.fixture.json` is the frozen definition of the
 * eight pages as staging and production hold them (the seeds after the patches of 27 to 31 Oct
 * 2026, taken on the redesign branch before its seeds changed). The changes are DERIVED from the
 * two, page by page, so the patch and a fresh seed cannot disagree:
 *
 *   a block in both (same type and title)  every field that differs is a guarded `set` from its
 *                                          old value to the new one (`page-cleanup.ts`)
 *   a block only in the seed               `insertBlock` after the block before it
 *   a block that changes type              `replaceBlock` (`REPLACED`): the home team band
 *                                          becomes the team split, the first section of
 *                                          `/bikefit` its page hero and the prose under it,
 *                                          "Voor je komt" on `/afspraak` a split with a photo
 *
 * Both sides are compared as the block schema returns them (`normalizeBlock`: the sanitiser,
 * then zod with its defaults), which is also what the repo stores; a field the schema gained
 * since (an image on the cta, groups on the FAQ) reads as its default on either side. A field
 * that holds neither the old nor the new value is an editor's change: a conflict, never
 * overwritten. Fields the redesign does not change are never looked at (production's own
 * `/aanbod` subtitle of 21 Oct 2026 stays as it is).
 *
 * The offerings: each gets the photograph of its page (`DEFAULT_OFFERS`, the design's pairing)
 * when it still has a generated default image or none; an editor's photo stays.
 * Plain data and functions, no I/O.
 */

export const REDESIGN_DATE = '2026-11-24';

type FixturePage = Pick<SeedPage, 'slug' | 'title' | 'metaTitle' | 'metaDescription'> & {
  blocks: SeedBlock[];
};
const BEFORE_PAGES = (before as unknown as { pages: FixturePage[] }).pages;

/** The eight pages the redesign touches, as the seeds define them now. */
export const REDESIGN_PAGES: readonly SeedPage[] = [
  ...AANBOD_PAGES,
  FAQ_PAGE,
  CADEAUBON_PAGE,
  AFSPRAAK_PAGE,
];
export const REDESIGN_SLUGS: readonly string[] = REDESIGN_PAGES.map((page) => page.slug);

/** A block as the repo stores it: through the sanitiser and the block schema (defaults filled in); null when it does not validate. */
export function normalizeBlock(block: { type: string; data: unknown }): CleanupBlock | null {
  const clean = sanitizeBlockData(block.data);
  if (!clean.ok) return null;
  const valid = validateBlock(block.type, clean.data);
  return valid.ok ? { type: block.type, data: valid.data as Record<string, unknown> } : null;
}

function normalizeAll(slug: string, blocks: readonly SeedBlock[]): CleanupBlock[] {
  return blocks.map((block, index) => {
    const result = normalizeBlock(block);
    if (!result) throw new Error(`site redesign: /${slug} block ${index + 1} does not validate`);
    return result;
  });
}

/** The page before the redesign (staging and production), normalised. */
export function redesignBefore(slug: string): CleanupBlock[] {
  const page = BEFORE_PAGES.find((entry) => entry.slug === slug);
  if (!page) throw new Error(`site redesign: no frozen page "${slug}"`);
  return normalizeAll(slug, page.blocks);
}

/** The page after the redesign (the seed), normalised. */
export function redesignTarget(slug: string): CleanupBlock[] {
  const page = REDESIGN_PAGES.find((entry) => entry.slug === slug);
  if (!page) throw new Error(`site redesign: no seed page "${slug}"`);
  return normalizeAll(slug, page.blocks);
}

/** The frozen page texts (title, meta) before the redesign; the redesign changes none of them. */
export function redesignBeforePage(slug: string): FixturePage {
  const page = BEFORE_PAGES.find((entry) => entry.slug === slug);
  if (!page) throw new Error(`site redesign: no frozen page "${slug}"`);
  return page;
}

// ----------------------------------------------------------------- specs ----

const titleOf = (data: Record<string, unknown>) =>
  typeof data.title === 'string' ? data.title : '';

/** A block by its type and title (the title is what an editor sees in Beheer). */
export function identity(type: string, title: string): Selector {
  return {
    label: title ? `${type} "${title}"` : type,
    type,
    where: (data) => titleOf(data) === title,
  };
}

const identityOf = (block: CleanupBlock) => identity(block.type, titleOf(block.data));
const keyOf = (block: CleanupBlock) => `${block.type}\u0000${titleOf(block.data)}`;

/** The blocks that change type: the old one, and the type and title of each block that takes its place. */
const REPLACED: Record<string, ReadonlyArray<{ old: [string, string]; by: [string, string][] }>> = {
  '': [
    {
      old: ['cta', 'Goede begeleiding begint bij de juiste mensen.'],
      by: [['imageText', 'Goede begeleiding begint bij de juiste mensen.']],
    },
  ],
  bikefit: [
    {
      old: ['imageText', 'Waarom is een bikefit belangrijk?'],
      by: [
        ['hero', 'Waarom is een bikefit belangrijk?'],
        ['richText', ''],
      ],
    },
  ],
  afspraak: [{ old: ['richText', 'Voor je komt'], by: [['imageText', 'Voor je komt']] }],
};

function uniqueKeys(slug: string, side: string, blocks: readonly CleanupBlock[]): void {
  const keys = blocks.map(keyOf);
  if (new Set(keys).size !== keys.length) {
    throw new Error(`site redesign: /${slug} (${side}) has two blocks with one type and title`);
  }
}

/** The guarded changes of one page, derived from its frozen and its seeded blocks. */
export function deriveSpec(
  slug: string,
  old: readonly CleanupBlock[],
  next: readonly CleanupBlock[],
  replaced: (typeof REPLACED)[string] = REPLACED[slug] ?? [],
): RestructureSpec {
  uniqueKeys(slug, 'before', old);
  uniqueKeys(slug, 'after', next);
  const oldIndex = new Map(old.map((block, index) => [keyOf(block), index]));
  const groupOf = new Map<string, (typeof replaced)[number]>();
  for (const entry of replaced) {
    for (const [type, title] of entry.by) groupOf.set(`${type}\u0000${title}`, entry);
  }

  const blocks: BlockEdit[] = [];
  const edits: CleanupEdit[] = [];
  const kept = new Set<number>();
  let lastKept = -1;
  next.forEach((block, index) => {
    const key = keyOf(block);
    const group = groupOf.get(key);
    if (group) {
      if (`${group.by[0][0]}\u0000${group.by[0][1]}` !== key) return; // placed with the first
      const oldAt = oldIndex.get(`${group.old[0]}\u0000${group.old[1]}`);
      const members = next.slice(index, index + group.by.length);
      if (
        oldAt === undefined ||
        members.map(keyOf).join() !== group.by.map((by) => by.join('\u0000')).join()
      ) {
        throw new Error(
          `site redesign: /${slug} replacement of ${group.old.join(' ')} is not in place`,
        );
      }
      kept.add(oldAt);
      blocks.push({
        kind: 'replaceBlock',
        select: identity(...group.old),
        from: old[oldAt].data,
        with: members.map((member) => ({ type: member.type, data: member.data })),
        done: members.map(identityOf),
      });
      return;
    }
    const at = oldIndex.get(key);
    if (at === undefined) {
      blocks.push({
        kind: 'insertBlock',
        block: { type: block.type, data: block.data },
        at: index === 0 ? 'start' : { after: identityOf(next[index - 1]) },
        done: identityOf(block),
      });
      return;
    }
    if (at < lastKept) throw new Error(`site redesign: /${slug} moves ${key}: not supported`);
    lastKept = at;
    kept.add(at);
    const before = old[at].data;
    const fields = [...new Set([...Object.keys(before), ...Object.keys(block.data)])].sort();
    for (const field of fields) {
      if (canonicalData(before[field]) === canonicalData(block.data[field])) continue;
      edits.push(set(identityOf(block), field, before[field], block.data[field]));
    }
  });
  const dropped = old.filter((_, index) => !kept.has(index));
  if (dropped.length > 0) {
    throw new Error(
      `site redesign: /${slug} drops ${dropped.map(keyOf).join(', ')} without a replacement`,
    );
  }
  return { slug, blocks, edits };
}

/** One spec per page, in the order of {@link REDESIGN_SLUGS}. */
export const SITE_REDESIGN_SPECS: readonly RestructureSpec[] = REDESIGN_SLUGS.map((slug) =>
  deriveSpec(slug, redesignBefore(slug), redesignTarget(slug)),
);

export function redesignSpec(slug: string): RestructureSpec | undefined {
  return SITE_REDESIGN_SPECS.find((spec) => spec.slug === slug);
}

// ------------------------------------------------------------- offerings ----

/** The generated images the offerings carried by default before the redesign. */
export const OLD_OFFERING_IMAGE_URLS: readonly string[] = [
  '/images/editorial/bikefit-studio-v1.webp',
  '/images/editorial/junior-coaching-v1.webp',
  '/images/editorial/flemish-cyclists-v1.webp',
];

/** Each offering's photograph since the redesign: what `cms:bootstrap` writes for a new row. */
export const OFFERING_IMAGE_TARGETS: ReadonlyArray<{
  slug: string;
  image: { mediaId: null; url: string | null; alt: string; decorative: boolean };
}> = DEFAULT_OFFERS.map((offer) => ({
  slug: offer.content.slug,
  image: { ...offer.content.image, mediaId: null },
}));

export type OfferingImageDecision =
  { action: 'done' } | { action: 'set'; from: string } | { action: 'keep'; reason: string };

/**
 * The stored image of an offering against its target: done when it is the target already; set
 * when it is a generated default (no media id, one of the old urls) or empty; anything else is a
 * photo an editor chose, kept as it is.
 */
export function decideOfferingImage(
  stored: unknown,
  target: { url: string | null },
): OfferingImageDecision {
  const image = (stored && typeof stored === 'object' ? stored : {}) as {
    mediaId?: unknown;
    url?: unknown;
  };
  const mediaId = typeof image.mediaId === 'string' && image.mediaId !== '' ? image.mediaId : null;
  const url = typeof image.url === 'string' && image.url !== '' ? image.url : null;
  if (!mediaId && url === target.url) return { action: 'done' };
  if (!mediaId && url === null) return { action: 'set', from: 'no image' };
  if (!mediaId && url && OLD_OFFERING_IMAGE_URLS.includes(url)) return { action: 'set', from: url };
  return {
    action: 'keep',
    reason: mediaId ? 'an image from the media library' : `the image ${url}`,
  };
}

// ---------------------------------------------------------------- verify ----

/** What must hold on a published page after the redesign; returns the violations. */
export function redesignProblems(slug: string, blocks: readonly CleanupBlock[]): string[] {
  const problems: string[] = [];
  const target = redesignTarget(slug);
  const types = (list: readonly CleanupBlock[]) => list.map((block) => block.type).join(', ');
  if (types(blocks) !== types(target)) {
    problems.push(`blocks are [${types(blocks)}], expected [${types(target)}]`);
  }
  const opener = blocks[0]?.type;
  if (!opener || !['hero', 'booking', 'giftVoucher'].includes(opener)) {
    problems.push('does not open with a hero');
  }
  if (slug === 'veelgestelde-vragen') {
    const items = blocks.find((block) => block.type === 'faq')?.data.items;
    const anchors = Array.isArray(items)
      ? items.map((item) => (item as { groupAnchor?: unknown }).groupAnchor)
      : [];
    if (!anchors.includes(FAQ_BEGINNERS_ANCHOR)) {
      problems.push(`the FAQ has no "${FAQ_BEGINNERS_ANCHOR}" group`);
    }
  }
  return problems;
}
