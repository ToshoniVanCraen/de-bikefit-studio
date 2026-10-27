/**
 * What `npm run cms:patch-aanbod-extras` wants on each offering, and what it
 * does about every state a database can be in. Pure (no database, no I/O, no
 * Next): `aanbod-extras-plan.mts` reads the rows and feeds them in,
 * `aanbod-extras-patch.mts` writes, `aanbod-extras-targets.test.ts` pins the
 * rules.
 *
 * The targets ARE the defaults (`src/lib/offers/defaults.ts`): *Bikefit –
 * tweede fiets* is the only extra of a bikefit (an extra only, with its two
 * choices) and both bikefits list only it. Toshoni, 27 Oct 2026: voetanalyse,
 * zadelanalyse and afstellen-schoenplaatjes are included in every bikefit, so
 * they are never a paid extra of one. They keep their pages, prices and
 * content and are still sold on their own. (The first version of this patch,
 * 20 Oct 2026, made them extras: a visitor paid for them twice.)
 *
 * Per offering the patch looks at three groups, each on its own: the extra
 * columns, the choices and the links to the extras it allows. A group is in
 * one of three states:
 *
 *   fresh   what migration 0015 leaves: no extra, sold alone, no minutes, no
 *           choices, no links
 *   20 Oct  what the first version of this patch wrote
 *           ({@link PREVIOUS_EXTRAS_TARGETS}); staging (20 Oct 2026) and
 *           production (21 Oct 2026) hold exactly this
 *   target  what the defaults say now
 *
 * Fresh and 20 Oct move to the target (`~`), the target is left alone (`=`),
 * anything else was changed in Beheer since and blocks the patch (`!`): an
 * admin's edit is never overwritten. Runbook: `docs/staging-runbook.md` §23.
 */
import { DEFAULT_OFFERS, type DefaultOffering } from '@/lib/offers/defaults';
import type { AddonChoice } from '@/lib/offers/offering';

/** The three extra columns of `cms_offerings` (migration 0015). */
export type ExtraColumns = {
  isAddon: boolean;
  soldAlone: boolean;
  addonMinutes: number | null;
};

/** What the patch sets on one offering: the extra columns, its choices and the linked extras (slugs). */
export type ExtrasTarget = ExtraColumns & {
  slug: string;
  addonOptions: AddonChoice[];
  /** The extras this offering allows, in order. */
  addonSlugs: string[];
};

/** What an offering holds, as far as the decision needs it (links by slug, in order). */
export type StoredExtraState = ExtraColumns & {
  addonOptions: AddonChoice[];
  addonSlugs: string[];
};

/** What the first version of this patch left on one offering. */
export type PreviousExtras = ExtraColumns & { slug: string; addonSlugs: string[] };

/** What migration 0015 leaves on every row. */
export const UNSET: ExtraColumns = { isAddon: false, soldAlone: true, addonMinutes: null };

const EXTRAS_OF_20_OCT: readonly string[] = [
  'bikefit-tweede-fiets',
  'voetanalyse',
  'zadelanalyse',
  'afstellen-schoenplaatjes',
];

/**
 * The extras of 20 Oct 2026, as the first version of this patch wrote them and
 * as staging (20 Oct) and production (21 Oct) hold them: the three analyses
 * were extras (+30 / +60 / +15 min, still sold alone) and both bikefits
 * allowed all four extras, in this order. *Bikefit – tweede fiets* is the same
 * then and now (an extra only, 30 min; its two choices came with the second
 * run, migration 0016). Kept so the correction of 27 Oct 2026 recognises this
 * state and moves it on; drop the entries once no database is left in it.
 */
export const PREVIOUS_EXTRAS_TARGETS: readonly PreviousExtras[] = [
  { slug: 'bikefit-nieuwe-fiets', ...UNSET, addonSlugs: [...EXTRAS_OF_20_OCT] },
  { slug: 'bikefit-huidige-fiets', ...UNSET, addonSlugs: [...EXTRAS_OF_20_OCT] },
  {
    slug: 'bikefit-tweede-fiets',
    isAddon: true,
    soldAlone: false,
    addonMinutes: 30,
    addonSlugs: [],
  },
  { slug: 'voetanalyse', isAddon: true, soldAlone: true, addonMinutes: 30, addonSlugs: [] },
  { slug: 'zadelanalyse', isAddon: true, soldAlone: true, addonMinutes: 60, addonSlugs: [] },
  {
    slug: 'afstellen-schoenplaatjes',
    isAddon: true,
    soldAlone: true,
    addonMinutes: 15,
    addonSlugs: [],
  },
];

function hasExtraSide(entry: DefaultOffering): boolean {
  return (
    entry.isAddon ||
    !entry.soldAlone ||
    entry.addonMinutes != null ||
    entry.addonOptions.length > 0 ||
    entry.addonSlugs.length > 0
  );
}

/**
 * The offerings the patch manages, in overview order, with what the defaults
 * say: those with something on the extra side, plus those the first version
 * touched (the three analyses, whose target is "no extra" now).
 */
export function extrasTargets(
  defaults: readonly DefaultOffering[] = DEFAULT_OFFERS,
  previous: readonly PreviousExtras[] = PREVIOUS_EXTRAS_TARGETS,
): ExtrasTarget[] {
  const touchedBefore = new Set(previous.map((entry) => entry.slug));
  return defaults
    .filter((entry) => hasExtraSide(entry) || touchedBefore.has(entry.content.slug))
    .map((entry) => ({
      slug: entry.content.slug,
      isAddon: entry.isAddon,
      soldAlone: entry.soldAlone,
      addonMinutes: entry.addonMinutes,
      addonOptions: entry.addonOptions.map((choice) => ({ ...choice })),
      addonSlugs: [...entry.addonSlugs],
    }));
}

// ---------------------------------------------------------------------------
// Comparing and describing
// ---------------------------------------------------------------------------

function columnsOf(value: ExtraColumns): ExtraColumns {
  return { isAddon: value.isAddon, soldAlone: value.soldAlone, addonMinutes: value.addonMinutes };
}

function sameColumns(a: ExtraColumns, b: ExtraColumns): boolean {
  return (
    a.isAddon === b.isAddon && a.soldAlone === b.soldAlone && a.addonMinutes === b.addonMinutes
  );
}

function sameChoices(a: readonly AddonChoice[], b: readonly AddonChoice[]): boolean {
  return (
    a.length === b.length &&
    a.every((choice, index) => {
      const other = b[index];
      return (
        choice.key === other.key &&
        choice.label === other.label &&
        choice.minutes === other.minutes &&
        choice.priceCents === other.priceCents
      );
    })
  );
}

function sameList(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

/** The same links in any order. */
function sameSet(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && new Set(a).size === a.length && a.every((v) => b.includes(v));
}

export function describeColumns(columns: ExtraColumns): string {
  return [
    columns.isAddon ? 'als extra te boeken' : 'geen extra',
    columns.soldAlone ? 'ook apart' : 'enkel als extra',
    columns.addonMinutes != null ? `+${columns.addonMinutes} min` : 'geen extra tijd',
  ].join(', ');
}

export function describeChoices(choices: readonly AddonChoice[]): string {
  return choices
    .map((choice) => `${choice.key} (${choice.minutes} min, ${choice.priceCents} cent)`)
    .join(', ');
}

/** "geen extra meer (was extra, 30 min)" when an extra stops being one, else the new settings. */
function describeColumnChange(current: ExtraColumns, wanted: ExtraColumns): string {
  if (!wanted.isAddon && current.isAddon) {
    const minutes = current.addonMinutes != null ? `, ${current.addonMinutes} min` : '';
    return `geen extra meer (was extra${minutes})`;
  }
  return describeColumns(wanted);
}

/** "extra's: + a, b" for links that are added, "extra's: a (3 verwijderd)" when some are pruned. */
function describeLinks(stored: readonly string[], wanted: readonly string[]): string {
  const removed = stored.filter((slug) => !wanted.includes(slug)).length;
  const list = wanted.length > 0 ? wanted.join(', ') : 'geen';
  return removed === 0 ? `extra's: + ${list}` : `extra's: ${list} (${removed} verwijderd)`;
}

// ---------------------------------------------------------------------------
// The decision
// ---------------------------------------------------------------------------

export type ExtrasDecision = {
  /** The columns to write, when they change. */
  columns: ExtraColumns | null;
  /** The choices to write, when they change. */
  options: AddonChoice[] | null;
  /** The links the offering ends up with (slugs, in order; any other link goes), when they change. */
  addonSlugs: string[] | null;
  /** What the dry run prints after `~ offering <slug> —`. */
  changes: string[];
  /** Why the patch refuses this offering (an edit made in Beheer, which it never overwrites). */
  blockers: string[];
};

/**
 * Compares what an offering holds with its target, group by group:
 *
 *   columns  target → nothing; fresh or 20 Oct → the target; anything else blocks
 *   choices  target → nothing; none → the target; anything else blocks
 *   links    target → nothing; none, or the extras of 20 Oct in any order → the
 *            target (the others are pruned); anything else blocks
 *
 * `previous` is the 20 Oct state of this offering (looked up by slug).
 */
export function decideExtras(
  target: ExtrasTarget,
  stored: StoredExtraState,
  previous: PreviousExtras | undefined = PREVIOUS_EXTRAS_TARGETS.find(
    (entry) => entry.slug === target.slug,
  ),
): ExtrasDecision {
  const decision: ExtrasDecision = {
    columns: null,
    options: null,
    addonSlugs: null,
    changes: [],
    blockers: [],
  };
  const { slug } = target;

  const current = columnsOf(stored);
  const wanted = columnsOf(target);
  if (!sameColumns(current, wanted)) {
    const movable =
      sameColumns(current, UNSET) || (previous !== undefined && sameColumns(current, previous));
    if (movable) {
      decision.columns = wanted;
      decision.changes.push(describeColumnChange(current, wanted));
    } else {
      decision.blockers.push(
        `offering ${slug}: the extra settings were changed in Beheer (${describeColumns(current)}) — not touched`,
      );
    }
  }

  if (!sameChoices(stored.addonOptions, target.addonOptions)) {
    if (stored.addonOptions.length === 0) {
      decision.options = target.addonOptions;
      decision.changes.push(`keuzes: ${describeChoices(target.addonOptions)}`);
    } else {
      decision.blockers.push(
        `offering ${slug}: has its own keuzes (${describeChoices(stored.addonOptions)}) — not touched`,
      );
    }
  }

  if (!sameList(stored.addonSlugs, target.addonSlugs)) {
    const movable =
      stored.addonSlugs.length === 0 ||
      (previous !== undefined && sameSet(stored.addonSlugs, previous.addonSlugs));
    if (movable) {
      decision.addonSlugs = [...target.addonSlugs];
      decision.changes.push(describeLinks(stored.addonSlugs, target.addonSlugs));
    } else {
      decision.blockers.push(
        `offering ${slug}: has its own extra's (${stored.addonSlugs.join(', ')}) — not touched`,
      );
    }
  }

  return decision;
}
