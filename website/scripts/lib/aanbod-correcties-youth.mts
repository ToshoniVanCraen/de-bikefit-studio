/**
 * The youth package and the provider Toshoni, the two sections of
 * `npm run cms:patch-aanbod-correcties` that look at who offers what: the third
 * variant "Jeugd – volledig pakket" (€ 275) of both bikefits with its booking
 * service and providers, and Toshoni's offerings as Aanbieder. Pure (no
 * database, no I/O): `aanbod-correcties-plan.mts` feeds the rows in,
 * `aanbod-correcties-youth.test.ts` pins the rules. The other sections are
 * `aanbod-correcties-targets.mts`; the same rule applies (the target is done,
 * the old state moves, anything else is an admin's edit and blocks the patch).
 * Runbook: `docs/staging-runbook.md` §24.
 */
import { DEFAULT_SERVICES, type DefaultService } from '@/lib/booking/defaults';
import { formatPriceInProse } from '@/lib/booking/format';
import { AUDIENCE_LABELS, type OfferingAudience } from '@/lib/offers/offering';

// ---------------------------------------------------------------------------
// The provider Toshoni
// ---------------------------------------------------------------------------

/** How `cms-seed-booking.mts` names the first provider; compared case-insensitively. */
export const FIRST_PROVIDER_NAME = 'toshoni';

export function isFirstProvider(displayName: string): boolean {
  return displayName.trim().toLowerCase() === FIRST_PROVIDER_NAME;
}

export type ProviderRow = {
  id: string;
  displayName: string;
  isActive: boolean;
  userActive: boolean;
};
export type SubscriptionRow = { providerId: string; serviceId: string; locationId: string | null };
export type ServiceRef = { id: string; slug: string; name: string; isActive: boolean };

export type ProviderRemoval = {
  provider: ProviderRow | null;
  /** His subscriptions, to be removed. */
  rows: SubscriptionRow[];
  changes: string[];
  blockers: string[];
};

/**
 * Toshoni no longer shows as an Aanbieder: his subscriptions go, the provider
 * row stays (bookings, calendar link). Refused while an active service would
 * be left without another active provider (`planned` are subscriptions the
 * same run adds), since it could not be booked any more.
 */
export function decideProviderRemoval(input: {
  providers: readonly ProviderRow[];
  subscriptions: readonly SubscriptionRow[];
  services: readonly ServiceRef[];
  planned: ReadonlyArray<Pick<SubscriptionRow, 'providerId' | 'serviceId'>>;
}): ProviderRemoval {
  const matches = input.providers.filter((provider) => isFirstProvider(provider.displayName));
  if (matches.length === 0) return { provider: null, rows: [], changes: [], blockers: [] };
  if (matches.length > 1) {
    return {
      provider: null,
      rows: [],
      changes: [],
      blockers: [
        `${matches.length} providers are named Toshoni — remove the right one's offerings in Beheer → Aanbieders`,
      ],
    };
  }
  const [provider] = matches;
  const rows = input.subscriptions.filter((row) => row.providerId === provider.id);
  const blockers: string[] = [];
  const names: string[] = [];
  const everyone = [...input.subscriptions, ...input.planned];
  for (const row of rows) {
    const service = input.services.find((entry) => entry.id === row.serviceId);
    names.push(service?.slug ?? row.serviceId);
    if (!service?.isActive) continue; // a retired service is not bookable anyway
    const others = everyone.filter((entry) => {
      if (entry.serviceId !== row.serviceId || entry.providerId === provider.id) return false;
      const other = input.providers.find((candidate) => candidate.id === entry.providerId);
      return Boolean(other?.isActive && other.userActive);
    });
    if (others.length === 0) {
      blockers.push(
        `provider ${provider.displayName}: service ${service.slug} would be left without a provider — add the other provider to it in Beheer → Aanbieders first`,
      );
    }
  }
  return {
    provider,
    rows,
    changes: rows.length > 0 ? [`${rows.length} offering(s) removed: ${names.join(', ')}`] : [],
    blockers,
  };
}

// ---------------------------------------------------------------------------
// The youth package: "Jeugd – volledig pakket" (€ 275) on both bikefits
// ---------------------------------------------------------------------------

export type OfferingRef = {
  id: string;
  slug: string;
  title: string;
  bookingMode: string;
  variantMode: string;
};
export type VariantRow = {
  offeringId: string;
  audience: string;
  serviceId: string | null;
  priceCents: number | null;
};
export type ServiceRow = ServiceRef & {
  choiceLabel: string;
  description: string;
  durationMinutes: number;
  bufferAfterMinutes: number | null;
  priceCents: number | null;
  showPrice: boolean;
  locationId: string | null;
  requiresGuardian: boolean;
  sortOrder: number;
};

/** The facts of the package service a run creates (`createService` input). */
export type NewServiceFacts = {
  slug: string;
  name: string;
  choiceLabel: string;
  description: string;
  durationMinutes: number;
  bufferAfterMinutes: number | null;
  priceCents: number;
  showPrice: boolean;
  locationId: string | null;
  requiresGuardian: boolean;
  isActive: boolean;
  sortOrder: number;
};

export type PackageService =
  | { kind: 'none' }
  | { kind: 'existing'; id: string; slug: string }
  | { kind: 'create'; facts: NewServiceFacts };

export type YouthPackageDecision = {
  offeringId: string;
  slug: string;
  priceCents: number;
  action: 'none' | 'update' | 'blocked';
  /** The third variant row: there, to create, or to fill in (empty price or service). */
  variant: 'exists' | 'create' | 'fill';
  service: PackageService;
  /** Providers (and their location override) to subscribe to the package service. */
  subscribe: Array<{ providerId: string; locationId: string | null }>;
  changes: string[];
  blockers: string[];
};

const PACKAGE_AUDIENCE: OfferingAudience = 'youth-package';

/** "Bikefit – huidige fiets – Jeugd – eenmalig" → "Bikefit – huidige fiets – Jeugd – volledig pakket". */
export function packageServiceName(youthName: string): string {
  return `${youthName.replace(/ – eenmalig$/, '')} – volledig pakket`;
}

function freeSlug(base: string, taken: ReadonlySet<string>): string {
  if (!taken.has(base)) return base;
  for (let suffix = 2; suffix < 100; suffix += 1) {
    if (!taken.has(`${base}-${suffix}`)) return `${base}-${suffix}`;
  }
  throw new Error('no free service slug');
}

/**
 * The third variant of a bikefit (Toshoni, 27 Oct 2026), as the defaults have it:
 *
 *  - the row `youth-package` at the target price; an empty one is filled in,
 *    another price is an admin's edit (blocker);
 *  - a booking service for it only when the offering is booked online and its
 *    Jeugd – eenmalig variant has one: `jeugdfit-pakket` from the defaults when
 *    that variant books through `jeugdfit`, else a copy of that service
 *    ("<name> – volledig pakket", 2 hours, the price shown, a guardian asked
 *    for, the same location and buffer); an existing service with the slug is
 *    used as it is;
 *  - subscribed to every active provider that offers the Jeugd – eenmalig
 *    service, except Toshoni, whose offerings go (`decideProviderRemoval`).
 */
export function decideYouthPackage(input: {
  offering: OfferingRef;
  variants: readonly VariantRow[];
  services: readonly ServiceRow[];
  subscriptions: readonly SubscriptionRow[];
  providers: readonly ProviderRow[];
  targetPriceCents: number;
  /** The slug the defaults book the Jeugd – eenmalig variant of this offering through, if any. */
  defaultYouthServiceSlug: string | null;
  packageDefault?: DefaultService | undefined;
}): YouthPackageDecision {
  const { offering, variants, services, subscriptions, providers, targetPriceCents } = input;
  const packageDefault =
    input.packageDefault ?? DEFAULT_SERVICES.find((service) => service.slug === 'jeugdfit-pakket');
  const decision: YouthPackageDecision = {
    offeringId: offering.id,
    slug: offering.slug,
    priceCents: targetPriceCents,
    action: 'none',
    variant: 'exists',
    service: { kind: 'none' },
    subscribe: [],
    changes: [],
    blockers: [],
  };
  const blocked = (message: string): YouthPackageDecision => ({
    ...decision,
    action: 'blocked',
    blockers: [`offering ${offering.slug}: ${message}`],
  });

  if (offering.variantMode !== 'audience') {
    return blocked('is not split by audience yet — run cms:patch-aanbod-prijzen first');
  }
  const youth = variants.find((variant) => variant.audience === 'youth');
  if (!youth) return blocked(`has no ${AUDIENCE_LABELS.youth} variant`);
  const youthService = youth.serviceId
    ? (services.find((service) => service.id === youth.serviceId) ?? null)
    : null;
  const needsService = offering.bookingMode === 'direct' && youthService !== null;

  const third = variants.find((variant) => variant.audience === PACKAGE_AUDIENCE);
  if (!third) {
    decision.variant = 'create';
  } else if (third.priceCents === targetPriceCents && (third.serviceId !== null || !needsService)) {
    decision.variant = 'exists';
  } else if (third.priceCents === null || third.priceCents === targetPriceCents) {
    decision.variant = 'fill';
  } else {
    return blocked(
      `${AUDIENCE_LABELS[PACKAGE_AUDIENCE]} holds ${third.priceCents} cent, neither empty nor the target (${targetPriceCents}) — edited in Beheer?`,
    );
  }

  // The service the variant books through.
  if (needsService && youthService) {
    const standard =
      packageDefault !== undefined &&
      input.defaultYouthServiceSlug !== null &&
      youthService.slug === input.defaultYouthServiceSlug;
    const taken = new Set(services.map((service) => service.slug));
    const slug = standard ? packageDefault.slug : freeSlug(`${offering.slug}-jeugd-pakket`, taken);
    const existing = third?.serviceId
      ? services.find((service) => service.id === third.serviceId)
      : services.find((service) => service.slug === slug);
    if (existing && !existing.isActive) {
      return blocked(
        `service ${existing.slug} exists but is switched off — activate it in Beheer first`,
      );
    }
    if (existing) {
      decision.service = { kind: 'existing', id: existing.id, slug: existing.slug };
      // A variant row that books through another service (or none) is pointed at this one.
      if (third && third.serviceId !== existing.id) decision.variant = 'fill';
    } else {
      if (third) decision.variant = 'fill';
      decision.service = {
        kind: 'create',
        facts: {
          slug,
          name: standard ? packageDefault.name : packageServiceName(youthService.name),
          choiceLabel: AUDIENCE_LABELS[PACKAGE_AUDIENCE],
          description: packageDefault?.description ?? '',
          durationMinutes: packageDefault?.durationMinutes ?? 120,
          bufferAfterMinutes: youthService.bufferAfterMinutes,
          priceCents: targetPriceCents,
          showPrice: true,
          locationId: youthService.locationId,
          requiresGuardian: true,
          isActive: true,
          sortOrder: youthService.sortOrder + 1,
        },
      };
    }

    // Who offers it: whoever offers the Jeugd – eenmalig service, minus Toshoni.
    const packageId = decision.service.kind === 'existing' ? decision.service.id : null;
    const already = new Set(
      subscriptions.filter((row) => row.serviceId === packageId).map((row) => row.providerId),
    );
    for (const row of subscriptions.filter((entry) => entry.serviceId === youthService.id)) {
      const provider = providers.find((candidate) => candidate.id === row.providerId);
      if (!provider?.isActive || !provider.userActive || isFirstProvider(provider.displayName))
        continue;
      if (already.has(provider.id)) continue;
      decision.subscribe.push({ providerId: provider.id, locationId: row.locationId });
    }
  }

  const price = formatPriceInProse(targetPriceCents);
  if (decision.variant !== 'exists') {
    decision.changes.push(
      `${AUDIENCE_LABELS[PACKAGE_AUDIENCE]}: ${decision.variant === 'create' ? 'add' : 'fill in'} variant at ${price}`,
    );
  }
  if (decision.service.kind === 'create') {
    const { facts } = decision.service;
    decision.changes.push(
      `new service ${facts.slug} ("${facts.name}", ${facts.durationMinutes} min, ${price})`,
    );
  }
  if (decision.subscribe.length > 0) {
    decision.changes.push(`offered by ${decision.subscribe.length} provider(s)`);
  }
  decision.action = decision.changes.length > 0 ? 'update' : 'none';
  return decision;
}
