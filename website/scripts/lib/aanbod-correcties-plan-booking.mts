/**
 * The booking-service sections of the `cms:patch-aanbod-correcties` plan: the
 * copy, the guardian rule and the durations of the booking services, Toshoni's
 * offerings as Aanbieder (they go, or with `staging-retain` they stay), and the
 * guard against the withdrawn youth package. Pure: the rules are
 * `aanbod-correcties-targets.mts` and `aanbod-correcties-youth.mts`, the rows
 * come from `aanbod-correcties-world.mts`.
 *
 * A service whose copy was last written by Beheer → Aanbod (or the prices patch
 * of 20 Oct 2026, which saves the current-bike fit through the same repo) holds
 * "<offering> – <label>" and the offering's summary instead of the bootstrap
 * text; that state is accepted as the old text next to the one the correction
 * names (`serviceTextAfterRepoSave`).
 */
import type { OfferingAudience } from '@/lib/offers/offering';
import type { ServiceTextCorrection } from '@/lib/offers/corrections-2026-10-27';
import { statusOf, type Planned } from './aanbod-correcties-status.mjs';
import {
  alternativeStates,
  decideDuration,
  decideTexts,
  serviceTextAfterRepoSave,
} from './aanbod-correcties-targets.mjs';
import {
  decideProviderRemoval,
  type ProviderMode,
  type ProviderRemoval,
  type SubscriptionRow,
} from './aanbod-correcties-youth.mjs';
import type { ServiceRowFull, World } from './aanbod-correcties-world.mjs';

export type DurationTarget = { slug: string; minutes: number };

const asRecord = (row: object) => row as unknown as Record<string, unknown>;

export type ServicePlan = Planned & {
  slug: string;
  row: ServiceRowFull | null;
  writes: Record<string, unknown>;
  before: Record<string, unknown>;
};
/** A youth service whose `requires_guardian` is set to false (or already is). */
export type GuardianPlan = Planned & { row: ServiceRowFull };
export type DurationPlan = Planned & {
  /** `<offering slug>` or `<offering slug> (<variant label>)`. */
  label: string;
  row: ServiceRowFull | null;
  minutes: number;
  note: string;
};
export type ProviderPlan = Planned &
  ProviderRemoval & {
    /** His offerings as they are, every one of them kept (`staging-retain`); empty when they go. */
    kept: SubscriptionRow[];
  };

/** The package services of 27 Oct 2026: `jeugdfit-pakket` and `<offering>-jeugd-pakket`. */
const PACKAGE_SERVICE_SLUG = /^(jeugdfit-pakket|.+-jeugd-pakket)$/;

/**
 * The youth package of 27 Oct 2026 ("Jeugd – volledig pakket") is withdrawn
 * (Toshoni, 29 Oct 2026): this patch never makes it. A database that holds one
 * (a `youth-package` variant, or a package service) is not the state the patch
 * starts from: one blocker, so nothing is written.
 */
export function planPackageGuard(world: World): Planned {
  const found = [
    ...world.variants
      .filter((variant) => variant.audience === 'youth-package')
      .map((variant) => {
        const offering = world.offerings.find((entry) => entry.id === variant.offeringId);
        return `variant youth-package of ${offering?.slug ?? variant.offeringId}`;
      }),
    ...world.services
      .filter((service) => PACKAGE_SERVICE_SLUG.test(service.slug))
      .map((service) => `service ${service.slug}`),
  ];
  const blockers =
    found.length > 0
      ? [
          `youth package: this database holds the withdrawn "Jeugd – volledig pakket" (${found.join(', ')}) — restore the backup of 27 Oct 2026 first, then run again`,
        ]
      : [];
  return { changes: [], blockers, action: statusOf(blockers, []) };
}

/**
 * No booking asks for a parent or guardian any more (Toshoni, 29 Oct 2026): every
 * service a Jeugd variant books through, and `jeugdfit`, ends with
 * `requires_guardian` false; one that is false already is done. Other services
 * are not looked at.
 */
export function planGuardians(world: World): GuardianPlan[] {
  const youth = new Set(
    world.variants
      .filter((variant) => variant.audience === 'youth' && variant.serviceId !== null)
      .map((variant) => variant.serviceId),
  );
  return world.services
    .filter((service) => youth.has(service.id) || service.slug === 'jeugdfit')
    .sort((a, b) => a.slug.localeCompare(b.slug))
    .map((row) => {
      const changes = row.requiresGuardian ? ['requiresGuardian: true → false'] : [];
      return { row, changes, blockers: [], action: statusOf([], changes) };
    });
}

/**
 * The other old states of a service: what the repo left in the service of a
 * variant (see `serviceTextAfterRepoSave`), when it has one, and the
 * alternatives the correction declares itself (`alsoBefore`).
 */
function otherOldStates(world: World, service: ServiceRowFull, correction: ServiceTextCorrection) {
  const variant = world.variants.find((entry) => entry.serviceId === service.id);
  const offering = variant && world.offerings.find((entry) => entry.id === variant.offeringId);
  return [
    ...(variant && offering
      ? [serviceTextAfterRepoSave(offering, variant.audience as OfferingAudience)]
      : []),
    ...alternativeStates((correction as { alsoBefore?: unknown }).alsoBefore),
  ];
}

export function planServiceTexts(
  world: World,
  corrections: ReadonlyArray<ServiceTextCorrection>,
): ServicePlan[] {
  return corrections.map((correction) => {
    const row = world.services.find((entry) => entry.slug === correction.slug) ?? null;
    if (!row) {
      return {
        slug: correction.slug,
        row: null,
        writes: {},
        before: {},
        changes: [],
        blockers: [`service ${correction.slug}: missing`],
        action: 'blocked' as const,
      };
    }
    const decision = decideTexts(
      `service ${correction.slug}`,
      asRecord(row),
      correction.from,
      correction.to,
      otherOldStates(world, row, correction),
    );
    return {
      slug: correction.slug,
      row,
      writes: decision.writes,
      before: decision.before,
      changes: decision.changes,
      blockers: decision.blockers,
      action: statusOf(decision.blockers, decision.changes),
    };
  });
}

export function planDurations(world: World, targets: readonly DurationTarget[]): DurationPlan[] {
  const plans: DurationPlan[] = [];
  const handled = new Set<string>();
  for (const target of targets) {
    const offering = world.offerings.find((entry) => entry.slug === target.slug);
    if (!offering) {
      plans.push({
        label: target.slug,
        row: null,
        minutes: target.minutes,
        note: '',
        changes: [],
        blockers: [`offering ${target.slug}: missing — run cms:patch-aanbod-prijzen first`],
        action: 'blocked',
      });
      continue;
    }
    const booked = world.variants.filter(
      (variant) => variant.offeringId === offering.id && variant.serviceId !== null,
    );
    if (booked.length === 0) {
      plans.push({
        label: target.slug,
        row: null,
        minutes: target.minutes,
        note: 'no booking service (asked for): nothing to set',
        changes: [],
        blockers: [],
        action: 'none',
      });
      continue;
    }
    for (const variant of booked) {
      const service = world.services.find((entry) => entry.id === variant.serviceId);
      if (!service || handled.has(service.id)) continue;
      handled.add(service.id);
      const decision = decideDuration(service.durationMinutes, target.minutes);
      const changes = decision.action === 'update' ? [decision.change] : [];
      const blockers =
        decision.action === 'blocked' ? [`service ${service.slug}: ${decision.blocker}`] : [];
      plans.push({
        label:
          booked.length > 1
            ? `${target.slug} (${service.choiceLabel || service.slug})`
            : target.slug,
        row: service,
        minutes: target.minutes,
        note: '',
        changes,
        blockers,
        action: statusOf(blockers, changes),
      });
    }
  }
  return plans;
}

export function planProvider(world: World, providerMode: ProviderMode = 'remove'): ProviderPlan {
  const removal = decideProviderRemoval({
    providers: world.providers,
    subscriptions: world.subscriptions,
    services: world.services,
    planned: [],
    providerMode,
  });
  // What stays his: the verify checks every one of these rows is still there after the apply.
  const keptId = providerMode === 'staging-retain' ? removal.provider?.id : undefined;
  const kept = keptId ? world.subscriptions.filter((row) => row.providerId === keptId) : [];
  return { ...removal, kept, action: statusOf(removal.blockers, removal.changes) };
}
