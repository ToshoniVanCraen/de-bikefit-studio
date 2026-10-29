/**
 * Who a variant of an offering is for: the closed set of audiences, their public
 * labels and the few rules between them. Plain module: no I/O, no Next, no
 * `server-only`; unit-tested in `offering-audience.test.ts`. `./offering.ts`
 * re-exports everything here, so callers keep importing from there; the small
 * client components (the enquiry form) import this file directly.
 *
 * Jeugd (under 16) is one variant (Toshoni, 29 Oct 2026): `youth`, a one-off fit
 * without follow-up (€ 150). Adults keep one variant (six months of problem
 * follow-up included). The labels below are what the offer page, the booking
 * widget, the enquiry mail and Beheer all print.
 *
 * `cms_offering_variants.audience` is plain text without a CHECK constraint
 * (`src/db/cms-offering-schema.ts`): this file is the closed set, and a new
 * audience needs no migration.
 */

export const OFFERING_VARIANT_MODES = ['single', 'audience'] as const;
export type OfferingVariantMode = (typeof OFFERING_VARIANT_MODES)[number];

export const OFFERING_AUDIENCES = ['all', 'adult', 'youth'] as const;
export type OfferingAudience = (typeof OFFERING_AUDIENCES)[number];

/** The variants of an offering split by audience (everything but the single option `all`), in display order. */
export const SPLIT_AUDIENCES = ['adult', 'youth'] as const;
export type SplitAudience = (typeof SPLIT_AUDIENCES)[number];

/** Public label of a variant; the single option has none. */
export const AUDIENCE_LABELS: Record<OfferingAudience, string> = {
  all: '',
  adult: 'Volwassene',
  youth: 'Jeugd – eenmalig',
};

/** The variants a mode holds, in display order. */
export function audiencesFor(mode: OfferingVariantMode): OfferingAudience[] {
  return mode === 'audience' ? [...SPLIT_AUDIENCES] : ['all'];
}

export function isSplitAudience(value: string): value is SplitAudience {
  return (SPLIT_AUDIENCES as readonly string[]).includes(value);
}

/** Position of a variant within its offering (0, 1): the order of its booking services. */
export function audienceRank(audience: OfferingAudience): number {
  const rank = (SPLIT_AUDIENCES as readonly string[]).indexOf(audience);
  return rank < 0 ? 0 : rank;
}

/** May an offering in `mode` be saved with exactly these variants, in this order? */
export function isAcceptedAudienceSet(
  mode: OfferingVariantMode,
  given: readonly OfferingAudience[],
): boolean {
  const same = (set: readonly OfferingAudience[]) =>
    set.length === given.length && set.every((audience, index) => given[index] === audience);
  return same(audiencesFor(mode));
}
