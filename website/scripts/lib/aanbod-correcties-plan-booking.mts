/**
 * The booking-service sections of the `cms:patch-aanbod-correcties` plan: the
 * third variant "Jeugd – volledig pakket" of both bikefits, the copy and the
 * durations of the booking services, and Toshoni's offerings as Aanbieder (they
 * go, or with `staging-retain` they stay and he is offered the package). Pure:
 * the rules are `aanbod-correcties-targets.mts` and `aanbod-correcties-youth.mts`,
 * the rows come from `aanbod-correcties-world.mts`.
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
  decideYouthPackage,
  type ProviderMode,
  type ProviderRemoval,
  type SubscriptionRow,
  type YouthPackageDecision,
} from './aanbod-correcties-youth.mjs';
import type { OfferingRowFull, ServiceRowFull, World } from './aanbod-correcties-world.mjs';

/** Per offering with a third variant in the defaults: its price and the service the youth variant books through. */
export type YouthPackageTarget = {
  slug: string;
  priceCents: number;
  defaultYouthServiceSlug: string | null;
};
export type DurationTarget = { slug: string; minutes: number };

const asRecord = (row: object) => row as unknown as Record<string, unknown>;

export type PackagePlan = YouthPackageDecision & {
  offering: OfferingRowFull | null;
  /** The third variant row as it is now (`null`: there is none yet). */
  thirdBefore: { serviceId: string | null; priceCents: number | null } | null;
};
export type ServicePlan = Planned & {
  slug: string;
  row: ServiceRowFull | null;
  writes: Record<string, unknown>;
  before: Record<string, unknown>;
};
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

export function planPackages(
  world: World,
  targets: readonly YouthPackageTarget[],
  providerMode: ProviderMode = 'remove',
): PackagePlan[] {
  return targets.map((target) => {
    const offering = world.offerings.find((entry) => entry.slug === target.slug) ?? null;
    if (!offering) {
      return {
        offeringId: '',
        slug: target.slug,
        priceCents: target.priceCents,
        action: 'blocked' as const,
        variant: 'exists' as const,
        service: { kind: 'none' as const },
        subscribe: [],
        changes: [],
        blockers: [`offering ${target.slug}: missing — run cms:patch-aanbod-prijzen first`],
        offering: null,
        thirdBefore: null,
      };
    }
    const variants = world.variants.filter((variant) => variant.offeringId === offering.id);
    const decision = decideYouthPackage({
      offering,
      variants,
      services: world.services,
      subscriptions: world.subscriptions,
      providers: world.providers,
      targetPriceCents: target.priceCents,
      defaultYouthServiceSlug: target.defaultYouthServiceSlug,
      providerMode,
    });
    const third = variants.find((variant) => variant.audience === 'youth-package');
    return {
      ...decision,
      offering,
      thirdBefore: third ? { serviceId: third.serviceId, priceCents: third.priceCents } : null,
    };
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

export function planProvider(
  world: World,
  packages: readonly PackagePlan[],
  providerMode: ProviderMode = 'remove',
): ProviderPlan {
  const planned = packages.flatMap((entry) =>
    entry.subscribe.map((target) => ({
      providerId: target.providerId,
      serviceId: entry.service.kind === 'existing' ? entry.service.id : `new:${entry.slug}`,
    })),
  );
  const removal = decideProviderRemoval({
    providers: world.providers,
    subscriptions: world.subscriptions,
    services: world.services,
    planned,
    providerMode,
  });
  // What stays his: the verify checks every one of these rows is still there after the apply.
  const keptId = providerMode === 'staging-retain' ? removal.provider?.id : undefined;
  const kept = keptId ? world.subscriptions.filter((row) => row.providerId === keptId) : [];
  return { ...removal, kept, action: statusOf(removal.blockers, removal.changes) };
}
