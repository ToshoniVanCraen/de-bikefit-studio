/**
 * Read-only half of `npm run cms:patch-site-redesign`, part two: the plan. A pure function of the
 * rows ({@link RedesignWorld}): per page what the redesign does to its draft blocks, per offering
 * whether its photograph changes, what blocks the apply, and the row counts after it. The rules
 * are `src/lib/studio/seed-content/site-redesign.ts` (derived from the frozen pages and the
 * seeds) and the engine of `page-restructure.ts` / `page-cleanup.ts`; the block diff and the
 * repo check are the ones of the 27 Oct patch (`aanbod-correcties-pages.mts`).
 *
 * Rules that keep an editor's work safe (as in every patch of this family):
 *
 *  - every page the redesign touches must exist and be published;
 *  - a block or field that holds neither the old nor the new value is an editor's change: a
 *    blocker (`!`), never overwritten;
 *  - a published page whose saved draft differs from what is live has unpublished editor work:
 *    the patch refuses to touch it (it would publish it);
 *  - anything the repo would refuse is a blocker found here, not a failure halfway;
 *  - an offering photograph an editor chose stays as it is (`=`), only a generated default or
 *    an empty image is replaced.
 */
import { parsePublishedSnapshot } from '@/lib/cms/blocks';
import { restructureBlocks } from '@/lib/studio/seed-content/page-restructure';
import {
  decideOfferingImage,
  normalizeBlock,
  OFFERING_IMAGE_TARGETS,
  REDESIGN_SLUGS,
  redesignSpec,
} from '@/lib/studio/seed-content/site-redesign';
import {
  diffBlocks,
  hasOps,
  opsProblems,
  type BlockOps,
  type WorkBlock,
} from './aanbod-correcties-pages.mjs';
import { statusOf, type Planned } from './aanbod-correcties-status.mjs';
import { sameValue } from './aanbod-correcties-targets.mjs';
import { pagePath } from './aanbod-rollout.mjs';
import type {
  BlockRow,
  OfferingRow,
  PageRow,
  RedesignCounts,
  RedesignWorld,
} from './site-redesign-world.mjs';

export type RedesignPagePlan = Planned & {
  slug: string;
  path: string;
  /** `null` for a page the database lacks. */
  row: PageRow | null;
  blocks: BlockRow[];
  next: WorkBlock[];
  ops: BlockOps;
  publish: boolean;
  unpublishedDraft: boolean;
};

export type OfferingImagePlan = Planned & {
  slug: string;
  row: OfferingRow | null;
  /** The image to write (`update`), else null. */
  image: (typeof OFFERING_IMAGE_TARGETS)[number]['image'] | null;
  /** Why a photo stays (an editor's choice), for the `=` line. */
  note: string;
};

export type RedesignPlan = {
  locale: string;
  pages: RedesignPagePlan[];
  offerings: OfferingImagePlan[];
  /** Row counts now, and what the apply must leave. */
  guards: RedesignCounts;
  expected: RedesignCounts;
};

const NO_OPS: BlockOps = { deletes: [], updates: [], inserts: [] };

/** The blocks as the schema returns them, or the 1-based positions of those that do not validate. */
function normalized(blocks: ReadonlyArray<{ id: string | null; type: string; data: unknown }>): {
  blocks: WorkBlock[];
  invalid: string[];
} {
  const out: WorkBlock[] = [];
  const invalid: string[] = [];
  blocks.forEach((block, index) => {
    const result = normalizeBlock(block);
    if (result) out.push({ id: block.id, type: result.type, data: result.data });
    else invalid.push(`${index + 1} (${block.type})`);
  });
  return { blocks: out, invalid };
}

const plain = (blocks: readonly WorkBlock[]) =>
  blocks.map((block) => ({ type: block.type, data: block.data }));

function missingPage(slug: string): RedesignPagePlan {
  const blockers = [`page ${pagePath(slug)}: missing`];
  return {
    slug,
    path: pagePath(slug),
    row: null,
    blocks: [],
    next: [],
    ops: NO_OPS,
    publish: false,
    unpublishedDraft: false,
    changes: [],
    blockers,
    action: 'blocked',
  };
}

function planPage(slug: string, entry: RedesignWorld['pages'][number]): RedesignPagePlan {
  const { row, blocks } = entry;
  const path = pagePath(slug);
  const spec = redesignSpec(slug);
  if (!spec) throw new Error(`site redesign: no spec for ${path}`);
  const blockers: string[] = [];
  if (row.status !== 'published') blockers.push(`page ${path}: not published`);

  const draft = normalized(blocks.map((block) => ({ ...block, data: block.data ?? {} })));
  for (const position of draft.invalid) {
    blockers.push(`page ${path}: draft block ${position} does not validate`);
  }
  const snapshot = parsePublishedSnapshot(row.publishedSnapshot);
  const live = snapshot
    ? normalized(snapshot.blocks.map((block) => ({ ...block, id: null })))
    : null;

  const result = restructureBlocks(spec, draft.blocks);
  for (const conflict of result.conflicts) blockers.push(`page ${path}: ${conflict}`);
  const next: WorkBlock[] = result.next.map((item) => ({
    id: item.block?.id ?? null,
    type: item.type,
    data: item.data,
  }));
  const ops = diffBlocks(draft.blocks, next);
  const unpublishedDraft =
    row.status === 'published' &&
    (live === null ||
      live.invalid.length > 0 ||
      !sameValue(plain(draft.blocks), plain(live.blocks)));
  if (unpublishedDraft && hasOps(ops)) {
    blockers.push(
      `page ${path}: has unpublished draft edits; publish or discard them in /admin first (this tool never publishes an editor's draft)`,
    );
  }
  if (hasOps(ops) && draft.invalid.length === 0) {
    for (const problem of opsProblems(ops, next, true)) blockers.push(`page ${path}: ${problem}`);
  }
  const changes = result.conflicts.length > 0 ? [] : result.changes;
  return {
    slug,
    path,
    row,
    blocks,
    next,
    ops: blockers.length > 0 ? NO_OPS : ops,
    publish: blockers.length === 0 && hasOps(ops),
    unpublishedDraft,
    changes,
    blockers,
    action: statusOf(blockers, changes),
  };
}

function planOffering(
  world: RedesignWorld,
  target: (typeof OFFERING_IMAGE_TARGETS)[number],
): OfferingImagePlan {
  const row = world.offerings.find((entry) => entry.slug === target.slug) ?? null;
  if (!row) {
    const blockers = [`offering ${target.slug}: missing (run cms:patch-aanbod-prijzen first)`];
    return {
      slug: target.slug,
      row,
      image: null,
      note: '',
      changes: [],
      blockers,
      action: 'blocked',
    };
  }
  const decision = decideOfferingImage(row.image, target.image);
  if (decision.action === 'set') {
    const changes = [`image: ${decision.from} → ${target.image.url}`];
    return {
      slug: target.slug,
      row,
      image: target.image,
      note: '',
      changes,
      blockers: [],
      action: 'update',
    };
  }
  const note =
    decision.action === 'keep' ? `kept as it is: ${decision.reason} (an editor's choice)` : '';
  return { slug: target.slug, row, image: null, note, changes: [], blockers: [], action: 'none' };
}

export function planRedesign(world: RedesignWorld): RedesignPlan {
  const pages = REDESIGN_SLUGS.map((slug) => {
    const entry = world.pages.find((page) => page.row.slug === slug);
    return entry ? planPage(slug, entry) : missingPage(slug);
  });
  const offerings = OFFERING_IMAGE_TARGETS.map((target) => planOffering(world, target));
  const added = pages.reduce((sum, page) => sum + page.ops.inserts.length, 0);
  const removed = pages.reduce((sum, page) => sum + page.ops.deletes.length, 0);
  return {
    locale: world.locale,
    pages,
    offerings,
    guards: world.counts,
    expected: { ...world.counts, blocks: world.counts.blocks + added - removed },
  };
}

const entries = (plan: RedesignPlan): Planned[] => [...plan.pages, ...plan.offerings];

export function redesignBlockers(plan: RedesignPlan): string[] {
  return entries(plan).flatMap((entry) => entry.blockers);
}

export function redesignHasChanges(plan: RedesignPlan): boolean {
  return entries(plan).some((entry) => entry.action === 'update');
}

/** A value for a change line: an image by its url, a link by its label, a list by its length. */
function showValue(value: unknown): string {
  if (value === null || value === undefined) return 'none';
  if (Array.isArray(value)) return `${value.length} item(s)`;
  if (typeof value === 'object') {
    const entry = value as { url?: unknown; mediaId?: unknown; label?: unknown };
    if ('url' in entry) return String(entry.url ?? entry.mediaId ?? 'no image');
    if ('label' in entry) return JSON.stringify(entry.label);
  }
  const text = String(value);
  return JSON.stringify(text.length > 60 ? `${text.slice(0, 59)}…` : text);
}

/**
 * A field change in a few words (the engine's own line shows the differing middle of the JSON,
 * unreadable for an image or a list): `"old" → "new"`, an image by its url, a list as
 * "6 → 6 item(s), 6 changed".
 */
export function describeFieldChange(slug: string, change: string): string {
  const edit = redesignSpec(slug)?.edits.find(
    (entry) => entry.kind === 'set' && change.startsWith(`${entry.select.label}.${entry.field}: `),
  );
  if (!edit || edit.kind !== 'set') return change;
  const { from, to } = edit;
  if (Array.isArray(from) && Array.isArray(to)) {
    const changed = to.filter((item, index) => !sameValue(item, from[index])).length;
    return `${edit.select.label}.${edit.field}: ${from.length} → ${to.length} item(s), ${changed} changed`;
  }
  return `${edit.select.label}.${edit.field}: ${showValue(from)} → ${showValue(to)}`;
}

/** The dry-run printout: `~` planned, `=` as intended, then the guards line (blockers: the caller). */
export function printRedesignPlan(
  plan: RedesignPlan,
  log: (symbol: string, message: string) => void,
) {
  for (const page of plan.pages) {
    if (page.changes.length > 0) {
      const counts = `+${page.ops.inserts.length} −${page.ops.deletes.length} ~${page.ops.updates.length} block(s)`;
      log('~', `page ${page.path} — ${page.changes.length} change(s) (${counts}), then publish`);
      for (const change of page.changes) log(' ', `  ${describeFieldChange(page.slug, change)}`);
    } else if (page.action === 'none') {
      log('=', `page ${page.path} — as in the redesign`);
    }
  }
  for (const offering of plan.offerings) {
    if (offering.changes.length > 0) {
      log('~', `offering ${offering.slug} — ${offering.changes.join('; ')}`);
    } else if (offering.action === 'none') {
      log('=', `offering ${offering.slug} — ${offering.note || 'photograph as in the redesign'}`);
    }
  }
}
