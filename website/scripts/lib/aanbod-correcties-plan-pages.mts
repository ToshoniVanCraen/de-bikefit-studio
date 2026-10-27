/**
 * The pages section of the `cms:patch-aanbod-correcties` plan: per page what
 * the corrections of the day, the contact details, the location section and
 * the gift voucher promotion do to its draft blocks and its own texts, whether
 * it is published afterwards, and what blocks it. Pure: the rules are
 * `aanbod-correcties-pages.mts`, the rows come from `aanbod-correcties-world.mts`.
 *
 * Rules that keep an editor's work safe (the same as `cms:patch-page-cleanup`):
 *
 *  - a page the patch needs must exist and be published;
 *  - a published page whose saved draft differs from what is live has unpublished
 *    editor work: the patch refuses to touch it (it would publish it);
 *  - anything the repo would refuse (an unsafe link, a block the schema rejects)
 *    is a blocker found here, not a failure halfway through the apply;
 *  - a page nobody sees (a retired or unfinished draft) that the repo would
 *    refuse is left alone with a note, not a blocker.
 */
import { parsePublishedSnapshot, validateBlocks } from '@/lib/cms/blocks';
import {
  diffBlocks,
  hasOps,
  opsProblems,
  requiredPageSlugs,
  transformBlocks,
  transformPageTexts,
  type BlockOps,
  type PageSources,
  type PageTexts,
  type WorkBlock,
} from './aanbod-correcties-pages.mjs';
import { statusOf, type Planned } from './aanbod-correcties-status.mjs';
import type { BlockRowFull, PageRowFull, World } from './aanbod-correcties-world.mjs';
import { pagePath, stable } from './aanbod-rollout.mjs';

export type PagePlan = Planned & {
  slug: string;
  path: string;
  /** `null` for a page the patch needs and the database lacks. */
  row: PageRowFull | null;
  blocks: BlockRowFull[];
  required: boolean;
  next: WorkBlock[];
  ops: BlockOps;
  /** The page's own texts that change (`updatePage`). */
  fields: Partial<PageTexts>;
  /** A published page is published again after its blocks are written. */
  publish: boolean;
  liveChanges: number;
  unpublishedDraft: boolean;
  /** Why a page that is not required is left alone. */
  note: string;
};

/** The saved draft blocks as plain data. */
function draftOf(blocks: readonly BlockRowFull[]): WorkBlock[] {
  return blocks.map((block) => ({ id: block.id, type: block.type, data: block.data ?? {} }));
}

const normalizedBlocks = (
  blocks: ReadonlyArray<{ type: string; data: unknown }>,
): string | null => {
  const result = validateBlocks(blocks);
  return result.ok ? stable(result.blocks.map((block) => [block.type, block.data])) : null;
};

const NO_OPS: BlockOps = { deletes: [], updates: [], inserts: [] };

function planPage(
  entry: World['pages'][number],
  required: ReadonlySet<string>,
  sources: PageSources,
): PagePlan {
  const { row, blocks } = entry;
  const path = pagePath(row.slug);
  const published = row.status === 'published';
  const draft = draftOf(blocks);
  const snapshot = parsePublishedSnapshot(row.publishedSnapshot);
  const live: WorkBlock[] = (snapshot?.blocks ?? []).map((block) => ({
    id: null,
    type: block.type,
    data: block.data as Record<string, unknown>,
  }));

  const work = transformBlocks(row.slug, draft, sources);
  const texts = transformPageTexts(row.slug, row, sources);
  const ops = diffBlocks(draft, work.next);
  const hasWork = hasOps(ops) || Object.keys(texts.fields).length > 0;
  const liveChanges = transformBlocks(row.slug, live, sources).changes.length;
  const draftNormalized = normalizedBlocks(draft);
  const unpublishedDraft =
    published && (draftNormalized === null || draftNormalized !== normalizedBlocks(live));

  const blockers: string[] = [];
  const notes: string[] = [];
  if (required.has(row.slug) && !published) blockers.push(`page ${path}: not published`);
  for (const conflict of [...work.conflicts, ...texts.conflicts]) {
    blockers.push(`page ${path}: ${conflict}`);
  }
  if (unpublishedDraft && (hasWork || liveChanges > 0)) {
    blockers.push(
      `page ${path}: has unpublished draft edits; publish or discard them in /admin first (this tool never publishes an editor's draft)`,
    );
  }
  let usable = true;
  if (hasWork) {
    const problems = opsProblems(ops, work.next, published);
    if (problems.length > 0 && !published && !required.has(row.slug)) {
      usable = false;
      notes.push(`not published, left alone (${problems[0]})`);
    } else {
      for (const problem of problems) blockers.push(`page ${path}: ${problem}`);
    }
  }
  const changes = usable ? [...work.changes, ...texts.changes] : [];
  return {
    slug: row.slug,
    path,
    row,
    blocks,
    required: required.has(row.slug),
    next: work.next,
    ops: usable ? ops : NO_OPS,
    fields: usable ? texts.fields : {},
    publish: published && usable && hasWork,
    liveChanges,
    unpublishedDraft,
    note: notes.join('; '),
    changes,
    blockers,
    action: statusOf(blockers, changes),
  };
}

/** The home page first, then by path. */
const bySlug = (a: { slug: string }, b: { slug: string }) =>
  a.slug === b.slug ? 0 : a.slug === '' ? -1 : b.slug === '' ? 1 : a.slug < b.slug ? -1 : 1;

export function planPages(world: World, sources: PageSources): PagePlan[] {
  const required = new Set(requiredPageSlugs(sources));
  const plans = world.pages.map((entry) => planPage(entry, required, sources)).sort(bySlug);
  const present = new Set(plans.map((plan) => plan.slug));
  for (const slug of [...required].sort()) {
    if (present.has(slug)) continue;
    plans.push({
      slug,
      path: pagePath(slug),
      row: null,
      blocks: [],
      required: true,
      next: [],
      ops: NO_OPS,
      fields: {},
      publish: false,
      liveChanges: 0,
      unpublishedDraft: false,
      note: '',
      changes: [],
      blockers: [`page ${pagePath(slug)}: missing`],
      action: 'blocked',
    });
  }
  return plans;
}
