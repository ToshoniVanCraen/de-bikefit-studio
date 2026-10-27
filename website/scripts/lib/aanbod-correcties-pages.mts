/**
 * What `npm run cms:patch-aanbod-correcties` does to the PAGES of an existing
 * database: pure (no database, no I/O, no Next), so it runs on plain block
 * lists and is pinned by `aanbod-correcties-pages.test.ts` against the seeds.
 *
 * Per page, in this order (`transformBlocks`):
 *
 *   1. the page edits of the day, `CORRECTION_PAGE_SPECS` (every spec of the
 *      slug, in array order: terms, FAQ, `/afspraak`, team and studio texts,
 *      "inspanningstest", copy tokens ...), through the guarded engine of
 *      `page-cleanup.ts`;
 *   2. the contact details in every string of every block (`phoneSpec`), on
 *      EVERY page: the old phone number to `+32 473 95 26 33`, then the phone
 *      number, the e-mail address and the company identity to their copy
 *      tokens (`{{telefoon}}`, `{{e-mail}}`, `{{bedrijf}}` ...: the settings
 *      keep the facts, the pages follow them). After step 1, because the old
 *      texts of step 1 may still carry the old number;
 *   3. `/afspraak` gets the `location` block after its last block, unless it
 *      has one (`location-section.ts`);
 *   4. the gift voucher promotion (`cadeaubon-promo.ts`): the home section after
 *      the first offer catalogue, the voucher block's text edits and the fields
 *      it does not have yet, the card on `/aanbod`.
 *
 * The page's own texts (title, meta title, meta and share texts) follow the same
 * rule (`transformPageTexts`): the guarded meta title and description of the
 * spec, then the contact details swapped for their tokens
 * (`replaceContactText`). Every edit names the value it expects (a page text
 * also the earlier seed texts its guard lists in `alsoFrom`, such as the first
 * seed's `/afspraak` description); a field that holds neither an old nor the new
 * value is a conflict and blocks the patch (an editor's change is never
 * overwritten). One exact editor's text is accepted as it is: the `keep` of a `set`
 * (production's /aanbod subtitle, Toshoni, 21 Oct 2026), no write, no conflict,
 * listed in `kept` for the dry run. Idempotent: a second run on the result finds
 * nothing. Runbook: `docs/staging-runbook.md` §24.
 */
import { sanitizeBlockData } from '@/lib/cms/actions/sanitize';
import { validateBlock, validateBlocks } from '@/lib/cms/blocks';
import { AFSPRAAK_PAGE } from '@/lib/studio/seed-content/appointment';
import { CADEAUBON_PROMO, type CadeaubonPromo } from '@/lib/studio/seed-content/cadeaubon-promo';
import {
  CORRECTION_PAGE_SPECS,
  phoneSpec,
  replaceContactText,
} from '@/lib/studio/seed-content/corrections-2026-10-27';
import { LOCATION_BLOCK } from '@/lib/studio/seed-content/location-section';
import {
  cleanupBlocks,
  isOldPageText,
  type PageCleanupSpec,
  type PageTextGuard,
} from '@/lib/studio/seed-content/page-cleanup';
import type { SeedBlock } from '@/lib/studio/seed-content/shared';
import { sameValue, shortText } from './aanbod-correcties-targets.mjs';

/** A block of a page: `id` is null for one the patch adds. */
export type WorkBlock = { id: string | null; type: string; data: Record<string, unknown> };

/** Everything the page rules are made of, so a test can hand in its own. */
export type PageSources = {
  specs: readonly PageCleanupSpec[];
  promo: CadeaubonPromo;
  location: SeedBlock;
  locationSlug: string;
};

export const PAGE_SOURCES: PageSources = {
  specs: CORRECTION_PAGE_SPECS,
  promo: CADEAUBON_PROMO,
  location: LOCATION_BLOCK,
  locationSlug: AFSPRAAK_PAGE.slug,
};

/** The pages that must exist (and be published) for the patch to do its work. */
export function requiredPageSlugs(sources: PageSources = PAGE_SOURCES): string[] {
  return [
    ...new Set([
      ...sources.specs.map((spec) => spec.slug),
      sources.promo.home.slug,
      sources.promo.voucherPage.slug,
      sources.promo.aanbodCard.slug,
      sources.locationSlug,
    ]),
  ];
}

export type PageWork = {
  /** The page as it will be, in order. */
  next: WorkBlock[];
  changes: string[];
  conflicts: string[];
  /** Fields left as they are because they hold a text their edit keeps (`keep` of a `set`). */
  kept: string[];
};

type Data = Record<string, unknown>;

/** `edits` on one block's data, guarded by the value each expects. */
function guardedSet(
  data: Data,
  edits: ReadonlyArray<{ field: string; from: unknown; to: unknown }>,
  label: string,
  work: Pick<PageWork, 'changes' | 'conflicts'>,
): Data {
  const next = { ...data };
  for (const edit of edits) {
    if (sameValue(next[edit.field], edit.to)) continue;
    if (sameValue(next[edit.field], edit.from)) {
      next[edit.field] = structuredClone(edit.to);
      work.changes.push(`${label}.${edit.field}: ${shortText(edit.from)} → ${shortText(edit.to)}`);
    } else {
      work.conflicts.push(
        `${label}.${edit.field}: expected ${shortText(edit.from)}, found ${shortText(next[edit.field])} (edited since the rollout?)`,
      );
    }
  }
  return next;
}

function replaceBlock(blocks: WorkBlock[], block: WorkBlock, data: Data): WorkBlock[] {
  return blocks.map((entry) => (entry === block ? { ...entry, data } : entry));
}

export function transformBlocks(
  slug: string,
  blocks: readonly WorkBlock[],
  sources: PageSources = PAGE_SOURCES,
): PageWork {
  let work: WorkBlock[] = blocks.map((block) => ({ ...block, data: structuredClone(block.data) }));
  const result: PageWork = { next: work, changes: [], conflicts: [], kept: [] };

  // 1 + 2: the engine of page-cleanup.ts; the specs of the slug first, the phone number last.
  const run = (spec: PageCleanupSpec) => {
    const done = cleanupBlocks<WorkBlock>(spec, work);
    result.changes.push(...done.changes);
    result.conflicts.push(...done.conflicts);
    result.kept.push(...done.kept);
    const removed = new Set<WorkBlock>(done.removed);
    const rewritten = new Map<WorkBlock, Data>(
      done.updated.map(({ block, data }): [WorkBlock, Data] => [block, data]),
    );
    work = work
      .filter((block) => !removed.has(block))
      .map((block) => {
        const data = rewritten.get(block);
        return data ? { ...block, data } : block;
      });
  };
  for (const spec of sources.specs.filter((entry) => entry.slug === slug)) run(spec);
  run(phoneSpec(slug));

  // 3: the location section at the end of /afspraak.
  if (
    slug === sources.locationSlug &&
    !work.some((block) => block.type === sources.location.type)
  ) {
    work = [
      ...work,
      { id: null, type: sources.location.type, data: structuredClone(sources.location.data) },
    ];
    result.changes.push(`append the "${sources.location.type}" block (Waar vind je ons?)`);
  }

  // 4: the gift voucher promotion.
  const { home, voucherPage, aanbodCard } = sources.promo;
  if (slug === home.slug) {
    const there = work.some(
      (block) => block.type === home.block.type && block.data.title === home.block.data.title,
    );
    if (!there) {
      const index = work.findIndex((block) => block.type === home.after);
      const at = index < 0 ? work.length : index + 1;
      work = [
        ...work.slice(0, at),
        { id: null, type: home.block.type, data: structuredClone(home.block.data) },
        ...work.slice(at),
      ];
      result.changes.push(
        `insert the section "${String(home.block.data.title)}" ${index < 0 ? 'at the end' : `after the ${home.after} block`}`,
      );
    }
  }
  if (slug === voucherPage.slug) {
    const hits = work.filter((block) => block.type === voucherPage.blockType);
    if (hits.length !== 1) {
      result.conflicts.push(
        `${voucherPage.blockType}: expected one such block, found ${hits.length}`,
      );
    } else {
      const [block] = hits;
      let data = guardedSet(block.data, voucherPage.blockEdits, voucherPage.blockType, result);
      for (const [field, value] of Object.entries(voucherPage.blockAdditions)) {
        if (field in data) continue;
        data = { ...data, [field]: structuredClone(value) };
        result.changes.push(`${voucherPage.blockType}.${field}: add ${shortText(value, 40)}`);
      }
      work = replaceBlock(work, block, data);
    }
  }
  if (slug === aanbodCard.slug) {
    for (const block of work.filter((entry) => entry.type === aanbodCard.blockType)) {
      const cards = Array.isArray(block.data.extraCards) ? (block.data.extraCards as Data[]) : [];
      const index = cards.findIndex((card) => card.href === aanbodCard.cardHref);
      if (index < 0) continue; // no such card (taken away in Beheer): nothing to correct
      const label = `${aanbodCard.blockType} card ${aanbodCard.cardHref}`;
      const card = guardedSet(cards[index], aanbodCard.edits, label, result);
      if (!sameValue(card, cards[index])) {
        const extraCards = cards.map((entry, position) => (position === index ? card : entry));
        work = replaceBlock(work, block, { ...block.data, extraCards });
      }
    }
  }

  result.next = work;
  return result;
}

// ---------------------------------------------------------------------------
// The page's own texts
// ---------------------------------------------------------------------------

export type PageTexts = {
  title: string;
  metaTitle: string | null;
  metaDescription: string | null;
  ogTitle: string | null;
  ogDescription: string | null;
};

export type TextsWork = {
  /** Only the fields that change. */
  fields: Partial<PageTexts>;
  changes: string[];
  conflicts: string[];
};

const TEXT_KEYS = ['title', 'metaTitle', 'metaDescription', 'ogTitle', 'ogDescription'] as const;

/**
 * One guarded text of the page: `to` is done, `from` (or a seed text of
 * `alsoFrom`, `isOldPageText`) becomes `to`, anything else is the editor's own (a
 * conflict). Returns the text after the guards.
 */
function guardedText(
  current: string | null,
  guards: readonly PageTextGuard[],
  field: string,
  noun: string,
  result: Pick<TextsWork, 'changes' | 'conflicts'>,
): { text: string | null; guarded: boolean } {
  let text = current;
  let guarded = false;
  for (const guard of guards) {
    if (text === guard.to) continue;
    if (isOldPageText(guard, text)) {
      result.changes.push(`${field}: ${shortText(text)} → ${shortText(guard.to)}`);
      text = guard.to;
      guarded = true;
    } else {
      result.conflicts.push(`${noun} is ${shortText(text)}, not the text it was rolled out with`);
    }
  }
  return { text, guarded };
}

/**
 * The guarded meta title and meta description (`spec.metaTitle`,
 * `spec.metaDescription`, and the voucher page's description), then the
 * contact details swapped for their tokens in every text of the page
 * (`replaceContactText`: the old phone number, then the number, the e-mail
 * address and the company identity).
 */
export function transformPageTexts(
  slug: string,
  texts: PageTexts,
  sources: PageSources = PAGE_SOURCES,
): TextsWork {
  const result: TextsWork = { fields: {}, changes: [], conflicts: [] };
  const own = sources.specs.filter((spec) => spec.slug === slug);
  const titleGuards = own.flatMap((spec) => (spec.metaTitle ? [spec.metaTitle] : []));
  const metaGuards = [
    ...own.flatMap((spec) => (spec.metaDescription ? [spec.metaDescription] : [])),
    ...(slug === sources.promo.voucherPage.slug ? [sources.promo.voucherPage.metaDescription] : []),
  ];
  const metaTitle = guardedText(texts.metaTitle, titleGuards, 'metaTitle', 'meta title', result);
  const metaDescription = guardedText(
    texts.metaDescription,
    metaGuards,
    'metaDescription',
    'meta description',
    result,
  );

  const swap = (value: string | null) => (value === null ? null : replaceContactText(value));
  const next: PageTexts = {
    title: replaceContactText(texts.title),
    metaTitle: swap(metaTitle.text),
    metaDescription: swap(metaDescription.text),
    ogTitle: swap(texts.ogTitle),
    ogDescription: swap(texts.ogDescription),
  };
  const guarded: Partial<Record<keyof PageTexts, string | null>> = {
    metaTitle: metaTitle.text,
    metaDescription: metaDescription.text,
  };
  for (const key of TEXT_KEYS) {
    if (next[key] === texts[key]) continue;
    (result.fields as Record<string, unknown>)[key] = next[key];
    // A guard has told this change already, unless the contact details changed the text further.
    const told =
      (key === 'metaTitle' && metaTitle.guarded) ||
      (key === 'metaDescription' && metaDescription.guarded);
    if (!told || next[key] !== guarded[key]) {
      result.changes.push(`${key}: contact details → tokens`);
    }
  }
  return result;
}

// ---------------------------------------------------------------------------
// What the apply writes, and whether the repo will take it
// ---------------------------------------------------------------------------

export type BlockOps = {
  /** Draft blocks that go. */
  deletes: WorkBlock[];
  /** Draft blocks whose data changes (`block` is the original). */
  updates: Array<{ block: WorkBlock; data: Data }>;
  /** New blocks, at their place in the final list. */
  inserts: Array<{ index: number; type: string; data: Data }>;
};

export function diffBlocks(original: readonly WorkBlock[], next: readonly WorkBlock[]): BlockOps {
  const kept = new Set(next.flatMap((block) => (block.id === null ? [] : [block.id])));
  return {
    deletes: original.filter((block) => block.id !== null && !kept.has(block.id)),
    updates: next.flatMap((block) => {
      const before =
        block.id === null ? undefined : original.find((entry) => entry.id === block.id);
      return before && !sameValue(before.data, block.data)
        ? [{ block: before, data: block.data }]
        : [];
    }),
    inserts: next.flatMap((block, index) =>
      block.id === null ? [{ index, type: block.type, data: block.data }] : [],
    ),
  };
}

export function hasOps(ops: BlockOps): boolean {
  return ops.deletes.length + ops.updates.length + ops.inserts.length > 0;
}

/**
 * The problems the repo would hit: each written block goes through
 * `sanitizeBlockData` and its schema (`updateBlock`), and a page that is
 * published is validated as a whole (`publishPage`). Found here, they are a
 * blocker instead of a failure halfway through the apply.
 */
export function opsProblems(ops: BlockOps, next: readonly WorkBlock[], publish: boolean): string[] {
  const problems: string[] = [];
  const written = [
    ...ops.updates.map((update) => ({ type: update.block.type, data: update.data })),
    ...ops.inserts,
  ];
  for (const block of written) {
    const sanitized = sanitizeBlockData(block.data);
    const checked = sanitized.ok
      ? validateBlock(block.type, sanitized.data)
      : { ok: false as const, message: sanitized.message };
    if (!checked.ok) problems.push(`block ${block.type} would be refused: ${checked.message}`);
  }
  if (publish && problems.length === 0) {
    const validated = validateBlocks(
      next.map((block) => ({ id: block.id, type: block.type, data: block.data })),
    );
    if (!validated.ok) {
      for (const issue of validated.issues) {
        problems.push(
          `publishing would be refused: block ${issue.index + 1} (${issue.type}): ${issue.message}`,
        );
      }
    }
  }
  return problems;
}
