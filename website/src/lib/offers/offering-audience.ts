/**
 * Who a variant of an offering is for: the closed set of audiences, their public
 * labels and the few rules between them. Plain module: no I/O, no Next, no
 * `server-only`; unit-tested in `offering-audience.test.ts`. `./offering.ts`
 * re-exports everything here, so callers keep importing from there; the small
 * client components (the enquiry form) import this file directly.
 *
 * Jeugd (under 16) is bought in two ways (Toshoni, 27 Oct 2026): `youth`, a
 * one-off fit without follow-up (€ 150), or `youth-package`, the full package
 * with a year of free follow-up (€ 275), which the studio recommends because
 * young riders grow fast. Adults keep one variant (six months of problem
 * follow-up included). The labels below are what the offer page, the booking
 * widget, the enquiry mail and Beheer all print.
 *
 * `cms_offering_variants.audience` is plain text without a CHECK constraint
 * (`src/db/cms-offering-schema.ts`): this file is the closed set, and a new
 * audience needs no migration.
 */

export const OFFERING_VARIANT_MODES = ['single', 'audience'] as const;
export type OfferingVariantMode = (typeof OFFERING_VARIANT_MODES)[number];

export const OFFERING_AUDIENCES = ['all', 'adult', 'youth', 'youth-package'] as const;
export type OfferingAudience = (typeof OFFERING_AUDIENCES)[number];

/** The variants of an offering split by audience (everything but the single option `all`), in display order. */
export const SPLIT_AUDIENCES = ['adult', 'youth', 'youth-package'] as const;
export type SplitAudience = (typeof SPLIT_AUDIENCES)[number];

/** Public label of a variant; the single option has none. */
export const AUDIENCE_LABELS: Record<OfferingAudience, string> = {
  all: '',
  adult: 'Volwassene',
  youth: 'Jeugd – eenmalig',
  'youth-package': 'Jeugd – volledig pakket',
};

/** The variants a mode holds, in display order. */
export function audiencesFor(mode: OfferingVariantMode): OfferingAudience[] {
  return mode === 'audience' ? [...SPLIT_AUDIENCES] : ['all'];
}

export function isSplitAudience(value: string): value is SplitAudience {
  return (SPLIT_AUDIENCES as readonly string[]).includes(value);
}

/**
 * The audience whose price an extra falls back to when it has none of its own
 * for this one: the full Jeugd package is priced like Jeugd unless the extra
 * says otherwise. Every other audience is its own base.
 */
export function baseAudienceOf(audience: OfferingAudience): OfferingAudience {
  return audience === 'youth-package' ? 'youth' : audience;
}

/** Jeugd, whichever way it is bought: a parent or guardian is the contact. */
export function isYouthAudience(audience: OfferingAudience): boolean {
  return baseAudienceOf(audience) === 'youth';
}

/** Position of a variant within its offering (0, 1, 2): the order of its booking services. */
export function audienceRank(audience: OfferingAudience): number {
  const rank = (SPLIT_AUDIENCES as readonly string[]).indexOf(audience);
  return rank < 0 ? 0 : rank;
}

/**
 * Offerings saved before 27 Oct 2026 hold the pair Volwassene + Jeugd only.
 * They still read (a missing row is a variant without service and price,
 * `settingsFromRows()`) and the 20 Oct 2026 price patch, which writes that
 * pair, still validates. Remove this once the data move of 27 Oct 2026 has
 * reached every database and that patch is retired.
 */
const LEGACY_SPLIT_AUDIENCES: readonly OfferingAudience[] = ['adult', 'youth'];

/** May an offering in `mode` be saved with exactly these variants, in this order? */
export function isAcceptedAudienceSet(
  mode: OfferingVariantMode,
  given: readonly OfferingAudience[],
): boolean {
  const same = (set: readonly OfferingAudience[]) =>
    set.length === given.length && set.every((audience, index) => given[index] === audience);
  return same(audiencesFor(mode)) || (mode === 'audience' && same(LEGACY_SPLIT_AUDIENCES));
}
