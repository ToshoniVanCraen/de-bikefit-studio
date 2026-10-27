import { JUNIOR_TEXT } from './copy';
import { CONTACT_REDIRECT, OTHER_QUESTION_HTML, RETIRED_CONTACT_SLUG } from './appointment';
import { BOOKING_PATH, CONTACT_EMAIL, EMAIL_TOKEN, PHONE_HREF, PHONE_HREF_TOKEN } from './shared';

/**
 * Toshoni's site review of 13 Oct 2026 as exact, guarded edits — the pure
 * half of `npm run cms:patch-page-cleanup` (I/O: `scripts/lib/page-cleanup-patch.mts`).
 * The seeds (`aanbod.ts`, `appointment.ts`, `navigation.ts`) already hold the
 * target state; this module brings a database that holds the previous seed
 * (staging since the aanbod rollout) to it, and nothing else.
 *
 * Every field edit names the value it expects to find. A field that already
 * holds the new value is done (idempotent); any other value is a conflict and
 * the patch refuses, so an editor's change is never overwritten silently.
 * Removals take only blocks that match their selector; a missing block counts
 * as already removed. Plain data and functions, no I/O.
 *
 * Since 27 Oct 2026 the same engine carries that day's copy corrections
 * (`corrections-2026-10-27.ts`), which needed three more kinds of edit, each
 * guarded like `set` (the old value, or the new one already there, or a
 * conflict): `replace` swaps the exact old text inside a text field,
 * `replaceItem` swaps the one list entry equal to the old value, and
 * `replaceAll` swaps an exact string in every field of every block of a page
 * (nothing to guard: the old string is either there or it is not). A `set`
 * may also name exact texts an editor wrote that it leaves as they are
 * (`keep`): no write, no conflict, reported in `kept`.
 */

export type CleanupBlock = { type: string; data: Record<string, unknown> };

export type Selector = {
  label: string;
  type: string;
  where?: (data: Record<string, unknown>) => boolean;
};

export type CleanupEdit =
  | {
      kind: 'set';
      select: Selector;
      field: string;
      from: unknown;
      to: unknown;
      /**
       * Exact values an editor wrote that this edit leaves as they are (no write, no
       * conflict; listed in `kept`), each named where it is defined with who wrote it and
       * when (27 Oct 2026: Toshoni's own /aanbod subtitle on production). Never `from` or
       * `to`; any value that is none of the three is still a conflict.
       */
      keep?: readonly unknown[];
    }
  | { kind: 'remove'; select: Selector }
  | { kind: 'append'; select: Selector; field: string; marker: string; value: string }
  | { kind: 'replace'; select: Selector; field: string; from: string; to: string }
  | { kind: 'replaceItem'; select: Selector; field: string; from: unknown; to: unknown }
  | { kind: 'replaceAll'; from: string; to: string };

/**
 * A guarded text of the page itself (its meta description or meta title): `to` is
 * the target, `from` the text the page was rolled out with. `alsoFrom` lists other
 * exact texts a seed is known to have left in the field, each named where it is
 * defined with where it came from (27 Oct 2026: the first seed of `/afspraak`,
 * which `cms:seed -- --refresh-slug` never overwrites); they move to `to` like
 * `from`. Any other text is an editor's own: a conflict.
 */
export type PageTextGuard = {
  from: string;
  alsoFrom?: readonly string[];
  to: string;
};

/** True when `text` is a state `guard` moves to its target: its `from`, or one of its `alsoFrom`. */
export function isOldPageText(guard: PageTextGuard, text: string | null): boolean {
  return text !== null && (text === guard.from || (guard.alsoFrom ?? []).includes(text));
}

export type PageCleanupSpec = {
  slug: string;
  edits: CleanupEdit[];
  metaDescription?: PageTextGuard;
  /**
   * The page's own title for the browser tab and search results, guarded like
   * `metaDescription` (27 Oct 2026: the dash clean-up changes four of them).
   */
  metaTitle?: PageTextGuard;
};

/** Before the review; the target values come from the seeds. */
const OLD_JUNIOR_TEXT =
  'Jonge fietsers groeien. Hun fiets groeit niet vanzelf mee. Daarom besteden we extra aandacht aan junioren, met betaalbare begeleiding en opvolging op maat. Zo blijft er ruimte om te groeien, bij te leren en vooral graag te fietsen.';

export const pageHead: Selector = {
  label: 'hero (page head)',
  type: 'hero',
  where: (data) => data.variant === 'pageHead',
};

export function titled(type: string, title: string): Selector {
  return { label: `${type} "${title}"`, type, where: (data) => data.title === title };
}

/** `from` → `to` in one field; `keep`: exact values that stay as they are (see `CleanupEdit`). */
export function set(
  select: Selector,
  field: string,
  from: unknown,
  to: unknown,
  keep?: readonly unknown[],
): CleanupEdit {
  return { kind: 'set', select, field, from, to, ...(keep ? { keep } : {}) };
}

export const PAGE_CLEANUP_SPECS: PageCleanupSpec[] = [
  {
    slug: 'aanbod',
    edits: [set(pageHead, 'eyebrow', 'Aanbod · Ninove', 'Aanbod')],
  },
  {
    slug: 'voor-wie',
    edits: [
      set(pageHead, 'eyebrow', 'Voor wie · Ninove', 'Voor wie'),
      set({ label: 'audience', type: 'audience' }, 'eyebrow', 'Voor wie', ''),
      set({ label: 'audience', type: 'audience' }, 'title', 'Waar je ook staat', ''),
      set(
        { label: 'audience', type: 'audience' },
        'lede',
        'Van je eerste kilometers tot een nieuw sportief doel: we vertrekken van jouw verhaal.',
        '',
      ),
      set(titled('imageText', 'Jonge fietsers groeien'), 'eyebrow', 'Junioren', 'Jeugd'),
      set(
        titled('imageText', 'Jonge fietsers groeien'),
        'paragraphs',
        [OLD_JUNIOR_TEXT],
        [JUNIOR_TEXT],
      ),
    ],
    metaDescription: {
      from: 'Voor jong en minder jong, beginners en ervaren fietsers, recreatief en competitief, koers, gravel en mountainbike, woon-werk en e-bike. Extra aandacht voor junioren.',
      to: 'Voor jong en minder jong, beginners en ervaren fietsers, recreatief en competitief, koers, gravel en mountainbike, woon-werk en e-bike. Extra aandacht voor de jeugd.',
    },
  },
  {
    slug: 'ons-team',
    edits: [
      set(pageHead, 'eyebrow', 'Ons team · Ninove', 'Ons team'),
      set({ label: 'team', type: 'team' }, 'eyebrow', 'Het team', ''),
      set({ label: 'team', type: 'team' }, 'title', 'Wie je ontmoet', ''),
    ],
  },
  {
    slug: BOOKING_PATH.slice(1),
    edits: [
      { kind: 'remove', select: pageHead },
      { kind: 'remove', select: titled('services', 'Vier manieren om te boeken') },
      { kind: 'remove', select: titled('contact', 'Boek je bikefit') },
      {
        kind: 'remove',
        select: {
          label: 'cta "Boek je bikefit"',
          type: 'cta',
          where: (data) => labelOf(data.primaryCta).startsWith('Boek je bikefit'),
        },
      },
      set({ label: 'booking', type: 'booking' }, 'eyebrow', 'Online boeken', ''),
      {
        kind: 'append',
        select: titled('richText', 'Voor je komt'),
        field: 'html',
        marker: 'Andere vraag?',
        value: OTHER_QUESTION_HTML,
      },
    ],
  },
];

function labelOf(link: unknown): string {
  return link && typeof link === 'object' && typeof (link as { label?: unknown }).label === 'string'
    ? (link as { label: string }).label
    : '';
}

/** JSON with sorted object keys: Postgres `jsonb` does not keep key order. */
function canonical(value: unknown): string {
  return JSON.stringify(value, (_key, entry: unknown) =>
    entry && typeof entry === 'object' && !Array.isArray(entry)
      ? Object.fromEntries(
          Object.entries(entry as Record<string, unknown>).sort(([a], [b]) => (a < b ? -1 : 1)),
        )
      : entry,
  );
}

function same(a: unknown, b: unknown): boolean {
  return canonical(a) === canonical(b);
}

function show(value: unknown): string {
  const text = typeof value === 'string' ? value : JSON.stringify(value);
  return JSON.stringify(text.length > 60 ? `${text.slice(0, 57)}...` : text);
}

/** `"a" → "b"`; for long values only the part that differs, so the log stays readable. */
function describe(from: unknown, to: unknown): string {
  const a = typeof from === 'string' ? from : JSON.stringify(from);
  const b = typeof to === 'string' ? to : JSON.stringify(to);
  if (a.length <= 60 || b.length <= 60) return `${show(from)} → ${show(to)}`;
  let start = 0;
  while (start < a.length && a[start] === b[start]) start += 1;
  let end = 0;
  while (end < a.length - start && end < b.length - start && a.at(-1 - end) === b.at(-1 - end)) {
    end += 1;
  }
  const cut = (text: string) =>
    JSON.stringify(`…${text.slice(Math.max(0, start - 12), text.length - end + 12)}…`);
  return `${cut(a)} → ${cut(b)}`;
}

/**
 * The text after a `replace` edit: `from` swapped for `to` (everywhere it
 * occurs), the text itself when the edit is already done, `null` when neither
 * is there. When `to` contains `from` (text was added) the edit is done as
 * soon as `to` is there; swapping again would add the text twice.
 */
function replaceText(current: string, from: string, to: string): string | null {
  if (current.includes(to) && to.includes(from)) return current;
  if (current.includes(from)) return current.split(from).join(to);
  return current.includes(to) ? current : null;
}

type StringSwap = { value: unknown; touched: number };

/** `value` with `from` swapped for `to` in every string inside it, and how many strings changed. */
function replaceInStrings(value: unknown, from: string, to: string): StringSwap {
  if (typeof value === 'string') {
    return value.includes(from)
      ? { value: value.split(from).join(to), touched: 1 }
      : { value, touched: 0 };
  }
  if (Array.isArray(value)) {
    const parts = value.map((entry) => replaceInStrings(entry, from, to));
    return {
      value: parts.map((part) => part.value),
      touched: parts.reduce((sum, part) => sum + part.touched, 0),
    };
  }
  if (value && typeof value === 'object') {
    const parts = Object.entries(value as Record<string, unknown>).map(
      ([key, entry]) => [key, replaceInStrings(entry, from, to)] as const,
    );
    return {
      value: Object.fromEntries(parts.map(([key, part]) => [key, part.value])),
      touched: parts.reduce((sum, [, part]) => sum + part.touched, 0),
    };
  }
  return { value, touched: 0 };
}

export type CleanupResult<T extends CleanupBlock> = {
  /** Blocks to write, with their new data. */
  updated: { block: T; data: Record<string, unknown> }[];
  removed: T[];
  /** The page as it will be, in order. */
  next: CleanupBlock[];
  changes: string[];
  conflicts: string[];
  /** Fields left as they are because they hold a value their `set` keeps: `label.field "value"`. */
  kept: string[];
};

/** Applies one page's edits to its blocks (the caller's objects are not mutated). */
export function cleanupBlocks<T extends CleanupBlock>(
  spec: PageCleanupSpec,
  blocks: readonly T[],
): CleanupResult<T> {
  const data = blocks.map((block) => structuredClone(block.data));
  const removed = new Set<number>();
  const changes: string[] = [];
  const conflicts: string[] = [];
  const kept: string[] = [];

  for (const edit of spec.edits) {
    // Keeping its own old or new value would never correct anything: a programmer error.
    if (edit.kind === 'set' && edit.keep?.some((v) => same(v, edit.from) || same(v, edit.to))) {
      throw new Error(`set ${edit.select.label}.${edit.field}: a kept value is "from" or "to"`);
    }
    if (edit.kind === 'replaceAll') {
      const { from, to } = edit;
      if (from === '') throw new Error('replaceAll: "from" must not be empty');
      let touched = 0;
      data.forEach((blockData, index) => {
        if (removed.has(index)) return;
        const swapped = replaceInStrings(blockData, from, to);
        data[index] = swapped.value as Record<string, unknown>;
        touched += swapped.touched;
      });
      if (touched > 0) changes.push(`${touched} field(s): ${describe(from, to)}`);
      continue;
    }
    const { label, type, where } = edit.select;
    const hits = blocks
      .map((block, index) => index)
      .filter(
        (index) =>
          !removed.has(index) && blocks[index].type === type && (!where || where(data[index])),
      );

    if (edit.kind === 'remove') {
      for (const index of hits) {
        removed.add(index);
        changes.push(`remove ${label}`);
      }
      continue;
    }
    if (hits.length !== 1) {
      conflicts.push(`${label}: expected one such block, found ${hits.length}`);
      continue;
    }
    const target = data[hits[0]];
    const current = target[edit.field];

    if (edit.kind === 'append') {
      if (typeof current !== 'string') {
        conflicts.push(`${label}.${edit.field}: not text`);
      } else if (!current.includes(edit.marker)) {
        target[edit.field] = `${current}${edit.value}`;
        changes.push(`${label}.${edit.field}: append "${edit.marker}"`);
      }
      continue;
    }
    if (edit.kind === 'replace') {
      if (typeof current !== 'string') {
        conflicts.push(`${label}.${edit.field}: not text`);
        continue;
      }
      const replaced = replaceText(current, edit.from, edit.to);
      if (replaced === null) {
        conflicts.push(
          `${label}.${edit.field}: expected the text ${show(edit.from)} (edited since the rollout?)`,
        );
      } else if (replaced !== current) {
        target[edit.field] = replaced;
        changes.push(`${label}.${edit.field}: ${describe(edit.from, edit.to)}`);
      }
      continue;
    }
    if (edit.kind === 'replaceItem') {
      if (!Array.isArray(current)) {
        conflicts.push(`${label}.${edit.field}: not a list`);
        continue;
      }
      const matches = current.flatMap((entry, position) =>
        same(entry, edit.from) ? [position] : [],
      );
      if (matches.length === 1) {
        target[edit.field] = current.map((entry, position) =>
          position === matches[0] ? structuredClone(edit.to) : entry,
        );
        changes.push(`${label}.${edit.field}: ${describe(edit.from, edit.to)}`);
      } else if (matches.length > 1) {
        conflicts.push(
          `${label}.${edit.field}: ${matches.length} entries equal ${show(edit.from)}`,
        );
      } else if (!current.some((entry) => same(entry, edit.to))) {
        conflicts.push(
          `${label}.${edit.field}: no entry equals ${show(edit.from)} (edited since the rollout?)`,
        );
      }
      continue;
    }
    if (same(current, edit.to)) continue;
    if (edit.keep?.some((value) => same(current, value))) {
      kept.push(`${label}.${edit.field} ${show(current)}`);
    } else if (same(current, edit.from)) {
      target[edit.field] = structuredClone(edit.to);
      changes.push(`${label}.${edit.field}: ${describe(edit.from, edit.to)}`);
    } else {
      conflicts.push(
        `${label}.${edit.field}: expected ${show(edit.from)}, found ${show(current)} (edited since the rollout?)`,
      );
    }
  }

  const updated = blocks
    .map((block, index) => ({ block, data: data[index], index }))
    .filter(({ index, block }) => !removed.has(index) && !same(block.data, data[index]))
    .map(({ block, data: next }) => ({ block, data: next }));
  const next = blocks
    .map((block, index) => ({ type: block.type, data: data[index] }))
    .filter((_, index) => !removed.has(index));
  return {
    updated,
    removed: blocks.filter((_, index) => removed.has(index)),
    next,
    changes,
    conflicts,
    kept,
  };
}

/** `''`: nothing to do; `'set'`: fill in; otherwise a conflict message. */
export function contactEmailAction(current: string): '' | 'set' | string {
  const value = current.trim();
  if (value === CONTACT_EMAIL) return '';
  if (value === '') return 'set';
  return `settings contact.email is "${value}", not empty; leave it or change it in /admin first`;
}

export type CleanupNavItem = {
  label: string;
  href: string;
  external?: boolean;
  group?: string;
  children?: CleanupNavItem[];
};

function isContactHref(href: string): boolean {
  const path = href.split(/[?#]/)[0].replace(/\/+$/, '');
  return path === CONTACT_REDIRECT.fromPath;
}

/** Menu links to `/contact` point at `/afspraak` (query and hash kept); labels unchanged. */
export function retargetContactLinks<T extends CleanupNavItem>(
  items: readonly T[],
): { items: T[]; changed: string[] } {
  const changed: string[] = [];
  const retarget = <I extends CleanupNavItem>(item: I): I => {
    let next = item;
    if (!item.external && isContactHref(item.href)) {
      const rest = item.href.slice(item.href.search(/[?#]|$/));
      next = { ...item, href: `${BOOKING_PATH}${rest}` };
      changed.push(`"${item.label}" ${item.href} → ${next.href}`);
    }
    return item.children ? { ...next, children: item.children.map(retarget) } : next;
  };
  return { items: items.map(retarget), changed };
}

/**
 * What must hold on a page after the cleanup (checked on the published
 * snapshot after an apply, and in the tests); returns the violations.
 */
export function pageCleanupProblems(slug: string, blocks: readonly CleanupBlock[]): string[] {
  const problems: string[] = [];
  const text = JSON.stringify(blocks);
  const heads = blocks.filter(
    (block) => block.type === 'hero' && block.data.variant === 'pageHead',
  );
  if (slug === BOOKING_PATH.slice(1)) {
    if (blocks[0]?.type !== 'booking' || blocks[0].data.title !== 'Kies je moment') {
      problems.push('does not start with the booking block "Kies je moment"');
    }
    if (heads.length > 0) problems.push('still has a page head');
    for (const gone of ['Vier manieren om te boeken', 'Boek je bikefit']) {
      if (text.includes(gone)) problems.push(`still shows "${gone}"`);
    }
    const info = blocks.find(
      (block) => block.type === 'richText' && block.data.title === 'Voor je komt',
    );
    const html = typeof info?.data.html === 'string' ? info.data.html : '';
    // The e-mail address and the phone link are the literal master values or, since
    // 27 Oct 2026, their copy tokens (`{{e-mail}}`, `{{telefoon-href}}`).
    const mailLinks = [`href="mailto:${CONTACT_EMAIL}"`, `href="mailto:${EMAIL_TOKEN}"`];
    const phoneLinks = [`href="${PHONE_HREF}"`, `href="${PHONE_HREF_TOKEN}"`];
    if (!html.includes('Andere vraag?') || !mailLinks.some((link) => html.includes(link))) {
      problems.push('"Voor je komt" lacks "Andere vraag?" with the e-mail link');
    }
    if (!phoneLinks.some((link) => html.includes(link))) {
      problems.push('"Voor je komt" lost the phone link');
    }
    return problems;
  }
  if (heads.some((block) => String(block.data.eyebrow).includes('Ninove'))) {
    problems.push('page head still names Ninove');
  }
  if (slug === 'voor-wie') {
    if (/junioren/i.test(text)) problems.push('still says "junioren"');
    if (!text.includes('miniem, aspirant, nieuweling of junior')) {
      problems.push('junior text lacks the four categories');
    }
    if (blocks.some((block) => block.type === 'audience' && block.data.title)) {
      problems.push('audience block still has a heading');
    }
  }
  if (slug === 'ons-team' && blocks.some((block) => block.type === 'team' && block.data.title)) {
    problems.push('team block still has a heading');
  }
  return problems;
}

export { CONTACT_REDIRECT, RETIRED_CONTACT_SLUG };
