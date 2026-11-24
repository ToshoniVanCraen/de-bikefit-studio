import { cleanupBlocks, type CleanupBlock, type CleanupEdit, type Selector } from './page-cleanup';

/**
 * The block-level half of the guarded page engine (`page-cleanup.ts` edits the FIELDS of blocks
 * that are there; this module adds and swaps whole blocks), for the redesign of 24 Nov 2026
 * (`site-redesign.ts`, `cms:patch-site-redesign`). Generic, pure, no I/O; kept apart because
 * `page-cleanup.ts` is at the size limit. Every operation is guarded the same way:
 *
 *   insertBlock   `block` goes in at its place (`after` a selector, or at the start). Done when a
 *                 block matching `done` is already there (idempotent); the anchor must match
 *                 exactly one block, else a conflict.
 *   replaceBlock  the ONE block matching `select` is swapped for `with` (one or more blocks, in
 *                 its place), but only when its data equals `from` exactly (every field: an
 *                 editor's change anywhere in it is a conflict, never overwritten). Done when the
 *                 old block is gone and every new one is there (matched by `done`, one selector
 *                 per new block).
 *
 * `restructureBlocks(spec, blocks)` runs the block operations in order, then the field edits of
 * `page-cleanup.ts` on the result (so a field edit may select a block an operation inserted).
 * Blocks keep their identity: `next` holds the caller's own objects for every block that stays
 * and plain `{ type, data }` objects for the new ones (`isNew`), so a caller can tell what to
 * insert, update and delete. Data is compared as canonical JSON (sorted keys); the caller hands in
 * normalised data (the block schema's output) so a default the schema adds is not a difference.
 */

export type Placement = { after: Selector } | 'start';

export type BlockEdit =
  | { kind: 'insertBlock'; block: CleanupBlock; at: Placement; done: Selector }
  | {
      kind: 'replaceBlock';
      select: Selector;
      from: Record<string, unknown>;
      with: CleanupBlock[];
      done: Selector[];
    };

export type RestructureSpec = {
  slug: string;
  blocks: BlockEdit[];
  /** Field edits of `page-cleanup.ts`, run after the block operations. */
  edits: CleanupEdit[];
};

export type RestructureResult<T extends CleanupBlock> = {
  /** The page as it will be, in order: the caller's blocks (data possibly changed) and new ones. */
  next: Array<{ block: T | null; type: string; data: Record<string, unknown> }>;
  /** Blocks of the caller that go (replaced). */
  removed: T[];
  changes: string[];
  conflicts: string[];
};

/** JSON with sorted object keys: Postgres `jsonb` does not keep key order. */
export function canonicalData(value: unknown): string {
  return JSON.stringify(value, (_key, entry: unknown) =>
    entry && typeof entry === 'object' && !Array.isArray(entry)
      ? Object.fromEntries(
          Object.entries(entry as Record<string, unknown>).sort(([a], [b]) => (a < b ? -1 : 1)),
        )
      : entry,
  );
}

type Slot<T> = { block: T | null; type: string; data: Record<string, unknown> };

function matches<T>(slots: readonly Slot<T>[], select: Selector): number[] {
  return slots.flatMap((slot, index) =>
    slot.type === select.type && (!select.where || select.where(slot.data)) ? [index] : [],
  );
}

/** The fields whose values differ, for a conflict message. */
function differingFields(a: Record<string, unknown>, b: Record<string, unknown>): string[] {
  const keys = [...new Set([...Object.keys(a), ...Object.keys(b)])].sort();
  return keys.filter((key) => canonicalData(a[key]) !== canonicalData(b[key]));
}

type Log<T> = { removed: T[]; changes: string[]; conflicts: string[] };

function applyBlockEdit<T>(edit: BlockEdit, slots: Slot<T>[], result: Log<T>) {
  if (edit.kind === 'insertBlock') {
    const there = matches(slots, edit.done);
    if (there.length === 1) return;
    if (there.length > 1) {
      result.conflicts.push(`${edit.done.label}: found ${there.length} times, expected once`);
      return;
    }
    let at = 0;
    if (edit.at !== 'start') {
      const anchors = matches(slots, edit.at.after);
      if (anchors.length !== 1) {
        result.conflicts.push(
          `${edit.done.label}: its place, after ${edit.at.after.label}, is not one block (found ${anchors.length})`,
        );
        return;
      }
      at = anchors[0] + 1;
    }
    slots.splice(at, 0, {
      block: null,
      type: edit.block.type,
      data: structuredClone(edit.block.data),
    });
    const place = edit.at === 'start' ? 'at the start' : `after ${edit.at.after.label}`;
    result.changes.push(`insert ${edit.done.label} ${place}`);
    return;
  }

  const old = matches(slots, edit.select);
  const present = edit.done.map((select) => matches(slots, select).length);
  if (old.length === 0 && present.every((count) => count === 1)) return;
  if (edit.done.length !== edit.with.length) {
    throw new Error(`replaceBlock ${edit.select.label}: one "done" selector per new block`);
  }
  if (old.length !== 1) {
    result.conflicts.push(
      old.length === 0
        ? `${edit.select.label}: neither the old block nor all its replacements are there`
        : `${edit.select.label}: expected one such block, found ${old.length}`,
    );
    return;
  }
  const current = slots[old[0]];
  if (canonicalData(current.data) !== canonicalData(edit.from)) {
    const fields = differingFields(current.data, edit.from);
    result.conflicts.push(
      `${edit.select.label}: edited since it was published (${fields.join(', ')}), not replaced`,
    );
    return;
  }
  if (present.some((count) => count > 0)) {
    result.conflicts.push(`${edit.select.label}: a replacement is already there next to it`);
    return;
  }
  if (current.block !== null) result.removed.push(current.block);
  slots.splice(
    old[0],
    1,
    ...edit.with.map((block) => ({
      block: null,
      type: block.type,
      data: structuredClone(block.data),
    })),
  );
  result.changes.push(
    `replace ${edit.select.label} with ${edit.done.map((select) => select.label).join(' + ')}`,
  );
}

/** Applies one page's block operations, then its field edits (the caller's objects are not mutated). */
export function restructureBlocks<T extends CleanupBlock>(
  spec: RestructureSpec,
  blocks: readonly T[],
): RestructureResult<T> {
  const slots: Slot<T>[] = blocks.map((block) => ({
    block,
    type: block.type,
    data: structuredClone(block.data),
  }));
  const result: RestructureResult<T> = { next: [], removed: [], changes: [], conflicts: [] };
  for (const edit of spec.blocks) applyBlockEdit(edit, slots, result);

  const fields = cleanupBlocks({ slug: spec.slug, edits: spec.edits }, slots);
  result.changes.push(...fields.changes);
  result.conflicts.push(...fields.conflicts);
  if (fields.removed.length > 0) {
    throw new Error(`restructure ${spec.slug}: a field edit removed a block; use replaceBlock`);
  }
  const rewritten = new Map(fields.updated.map((entry) => [entry.block, entry.data]));
  result.next = slots.map((slot) => ({
    block: slot.block,
    type: slot.type,
    data: rewritten.get(slot) ?? slot.data,
  }));
  return result;
}

/** True for a block `restructureBlocks` adds. */
export function isNew<T>(entry: { block: T | null }): boolean {
  return entry.block === null;
}
