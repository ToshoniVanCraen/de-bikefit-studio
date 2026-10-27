/**
 * The youth package and the provider Toshoni, the two sections of
 * `npm run cms:patch-aanbod-correcties` that look at who offers what: the third
 * variant "Jeugd – volledig pakket" (€ 275) of both bikefits with its booking
 * service and providers, and Toshoni's offerings as Aanbieder (they go, or on
 * staging they stay: {@link ProviderMode}). Pure (no database, no I/O):
 * `aanbod-correcties-plan.mts` feeds the rows in, `aanbod-correcties-youth.test.ts`,
 * `-youth-toshoni.test.ts` and `-youth-retain.test.ts` pin the rules.
 * The other sections are `aanbod-correcties-targets.mts`; the same rule applies
 * (the target is done, the old state moves, anything else is an admin's edit and
 * blocks the patch). Runbook: `docs/staging-runbook.md` §24.
 */
import { DEFAULT_SERVICES, type DefaultService } from '@/lib/booking/defaults';
import { formatPriceInProse } from '@/lib/booking/format';
import { normalizeEmail } from '@/lib/email-address';
import { AUDIENCE_LABELS, type OfferingAudience } from '@/lib/offers/offering';
import { FIRST_PROVIDER } from './first-provider.mjs';

// ---------------------------------------------------------------------------
// The provider Toshoni
// ---------------------------------------------------------------------------

/**
 * What a run does with Toshoni as Aanbieder. `remove`, the default and the rule
 * for production (where it still waits for Toshoni's go): his offerings go and the
 * youth package goes to the other providers. `staging-retain`, chosen with
 * {@link STAGING_RETAIN_FLAG} (Toshoni, 27 Oct 2026, 15:12, for staging only): he
 * stays a provider with every offering he has and is offered the youth package like
 * anybody else; only on a database whose one provider is him (`keepSoleProvider`).
 */
export const PROVIDER_MODES = ['remove', 'staging-retain'] as const;
export type ProviderMode = (typeof PROVIDER_MODES)[number];
export const STAGING_RETAIN_FLAG = '--staging-retain-toshoni';

export type ProviderRow = {
  id: string;
  displayName: string;
  isActive: boolean;
  userActive: boolean;
  /** The login of the profile (`cms_users.email` of `cms_providers.user_id`): compared, never printed. */
  userEmail: string;
};
/** A provider as a plan names him: without the login, so nothing downstream can print it. */
export type ProviderRef = Pick<ProviderRow, 'id' | 'displayName'>;
export type SubscriptionRow = { providerId: string; serviceId: string; locationId: string | null };
export type ServiceRef = { id: string; slug: string; name: string; isActive: boolean };

/**
 * Who Toshoni is, fixed, so that every place that needs him means the same
 * provider: his offerings go (`decideProviderRemoval`), the youth package is not
 * offered by him (`decideYouthPackage`), the verify looks for him; on staging he
 * stays and is offered it (`staging-retain`). A provider is
 * Toshoni when the login of his profile is the first provider `cms:seed-booking`
 * creates by default, or when his display name is one of these names; both
 * compared whole after `normalizeEmail` (`@/lib/email-address`) /
 * {@link normalizedName}, never as a part ("Toshoni2", "Toshoni V." or "Toshoni
 * (assistent)" is somebody else). Staging calls him "Toshoni Van Craen" and he
 * logs in as the seed's default; production calls him "Toshoni" (27 Oct 2026).
 * The rule fails closed: in a database with providers, no match or more than
 * one blocks the patch (`decideProviderRemoval`).
 */
export const TOSHONI: {
  readonly userEmails: readonly string[];
  readonly displayNames: readonly string[];
} = {
  userEmails: [FIRST_PROVIDER.email],
  displayNames: [FIRST_PROVIDER.displayName, 'Toshoni Van Craen'],
};

/** A display name compared as people read it: compatibility forms (NFKD), accents, spacing and case do not count. */
export function normalizedName(name: string): string {
  return name.normalize('NFKD').replace(/\p{M}/gu, '').replace(/\s+/g, ' ').trim().toLowerCase();
}

/** Which half of the rule a profile meets: its login, its display name, both or neither. */
export type ToshoniMatch = { byLogin: boolean; byName: boolean };

export function toshoniMatch(
  provider: Pick<ProviderRow, 'displayName' | 'userEmail'>,
): ToshoniMatch {
  const email = normalizeEmail(provider.userEmail);
  const name = normalizedName(provider.displayName);
  return {
    byLogin: TOSHONI.userEmails.some((entry) => normalizeEmail(entry) === email),
    byName: TOSHONI.displayNames.some((entry) => normalizedName(entry) === name),
  };
}

export function isToshoni(provider: Pick<ProviderRow, 'displayName' | 'userEmail'>): boolean {
  const match = toshoniMatch(provider);
  return match.byLogin || match.byName;
}

/** Why a profile matched, in words that never contain the login itself. */
function matchReason({ byLogin, byName }: ToshoniMatch): string {
  if (byLogin && byName) return 'by display name and login';
  return byLogin ? 'by login' : 'by display name';
}

/** The names of the rule as a message quotes them: `"Toshoni" or "Toshoni Van Craen"`. */
const KNOWN_NAMES = TOSHONI.displayNames.map((name) => `"${name}"`).join(' or ');

export type ProviderRemoval = {
  provider: ProviderRef | null;
  /** His subscriptions, to be removed. */
  rows: SubscriptionRow[];
  changes: string[];
  blockers: string[];
};

/**
 * Toshoni ({@link isToshoni}) no longer shows as an Aanbieder: his subscriptions
 * go, the provider row stays (bookings, calendar link). Refused while an active
 * service would be left without another active provider (`planned` are
 * subscriptions the same run adds), since it could not be booked any more: a
 * replacement provider has to offer it first.
 *
 * Fails closed on who he is: when the database has providers and none matches
 * (a renamed profile on another login would otherwise be treated as anybody
 * else: offered the package, nothing removed, nothing verified), or when more
 * than one matches. A database without providers has nothing to remove.
 *
 * With `staging-retain` nothing is removed, so no service can be left without
 * him; that mode has a guard of its own (`keepSoleProvider`).
 */
export function decideProviderRemoval(input: {
  providers: readonly ProviderRow[];
  subscriptions: readonly SubscriptionRow[];
  services: readonly ServiceRef[];
  planned: ReadonlyArray<Pick<SubscriptionRow, 'providerId' | 'serviceId'>>;
  /** Default `remove`; `staging-retain` keeps him ({@link ProviderMode}). */
  providerMode?: ProviderMode;
}): ProviderRemoval {
  if (input.providerMode === 'staging-retain') return keepSoleProvider(input.providers);
  const matches = input.providers.filter((candidate) => isToshoni(candidate));
  const nobody = (blockers: string[]): ProviderRemoval => ({
    provider: null,
    rows: [],
    changes: [],
    blockers,
  });
  if (matches.length === 0) {
    // No providers at all: nothing to remove. Providers, but none of them him: stop.
    return input.providers.length === 0
      ? nobody([])
      : nobody([
          `provider Toshoni: no provider profile matches (display name ${KNOWN_NAMES}, or the login of cms:seed-booking) — stop and report; check Beheer → Aanbieders, do not rename a profile blindly`,
        ]);
  }
  if (matches.length > 1) {
    const which = matches
      .map((candidate) => `"${candidate.displayName}" (${matchReason(toshoniMatch(candidate))})`)
      .join(', ');
    return nobody([
      `provider Toshoni: ${matches.length} provider profiles match — ${which}; rename the one that is not his in Beheer → Aanbieders (or change its login), then run again`,
    ]);
  }
  const provider: ProviderRef = { id: matches[0].id, displayName: matches[0].displayName };
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
        `provider ${provider.displayName}: service ${service.slug} would be left without a provider — add a replacement provider for it in Beheer → Aanbieders first`,
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

/**
 * `staging-retain`: Toshoni stays a provider with every offering he has; nothing
 * is removed. Only for the database it was decided for, staging on 27 Oct 2026:
 * exactly one provider row in all (active or not), which is Toshoni, active on an
 * active login. Anything else stops the run (`!`), so the flag cannot reach
 * production, which has a second provider.
 */
function keepSoleProvider(providers: readonly ProviderRow[]): ProviderRemoval {
  const decision = (blockers: string[], provider: ProviderRef | null = null): ProviderRemoval => ({
    provider,
    rows: [],
    changes: [],
    blockers,
  });
  const scope = `${STAGING_RETAIN_FLAG} is for a database whose only provider is Toshoni (staging)`;
  if (providers.length !== 1) {
    return decision([
      `provider Toshoni: ${scope}; this one has ${providers.length} provider(s) — run without it`,
    ]);
  }
  const [only] = providers;
  if (!isToshoni(only)) {
    return decision([
      `provider Toshoni: ${scope}; its one provider "${only.displayName}" is not him (display name ${KNOWN_NAMES}, or the login of cms:seed-booking) — stop and report`,
    ]);
  }
  if (!only.isActive || !only.userActive) {
    return decision([
      `provider ${only.displayName}: ${STAGING_RETAIN_FLAG} keeps him as the only provider, but his profile or its login is switched off — stop and report`,
    ]);
  }
  return decision([], { id: only.id, displayName: only.displayName });
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

/**
 * The third variant of a bikefit (Toshoni, 27 Oct 2026), as the defaults have it:
 *
 *  - the row `youth-package` at the target price; an empty one is filled in,
 *    another price is an admin's edit (blocker);
 *  - a booking service for it only when the offering is booked online and its
 *    Jeugd – eenmalig variant has one: `jeugdfit-pakket` from the defaults when
 *    that variant books through `jeugdfit`, else a copy of that service
 *    ("<name> – volledig pakket", 2 hours, the price shown, a guardian asked
 *    for, the same location and buffer); a custom existing service is adopted
 *    only when its identity and booking facts match. A slug collision never
 *    creates a second semantic package;
 *  - subscribed to every active provider that offers the Jeugd – eenmalig
 *    service, except Toshoni ({@link isToshoni}), whose offerings go
 *    (`decideProviderRemoval`); with `staging-retain` he stays and is offered it
 *    like anybody else. A run that would leave the package's service
 *    with no provider at all is refused (the package could not be booked):
 *    a replacement provider has to offer the Jeugd – eenmalig service first.
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
  /** Default `remove`; `staging-retain` offers Toshoni the package too ({@link ProviderMode}). */
  providerMode?: ProviderMode;
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

  // The service the variant books through; the slug of the Jeugd – eenmalig service
  // when nobody would offer the package after the run.
  let unbookableFor: string | null = null;
  if (needsService && youthService) {
    const standard =
      packageDefault !== undefined &&
      input.defaultYouthServiceSlug !== null &&
      youthService.slug === input.defaultYouthServiceSlug;
    const slug = standard ? packageDefault.slug : `${offering.slug}-jeugd-pakket`;
    const linked = third?.serviceId
      ? services.find((service) => service.id === third.serviceId)
      : null;
    if (third?.serviceId && !linked) {
      return blocked(
        `package variant links to missing service ${third.serviceId} — inspect in Beheer first`,
      );
    }
    if (linked && linked.slug !== slug) {
      return blocked(
        `package variant links to service ${linked.slug}, not ${slug} — inspect in Beheer first`,
      );
    }
    const existing = linked ?? services.find((service) => service.slug === slug);
    if (existing && !existing.isActive) {
      return blocked(
        `service ${existing.slug} exists but is switched off — activate it in Beheer first`,
      );
    }
    if (existing && !standard) {
      const expected = {
        name: packageServiceName(youthService.name),
        choiceLabel: AUDIENCE_LABELS[PACKAGE_AUDIENCE],
        durationMinutes: packageDefault?.durationMinutes ?? 120,
        bufferAfterMinutes: youthService.bufferAfterMinutes,
        priceCents: targetPriceCents,
        showPrice: true,
        locationId: youthService.locationId,
        requiresGuardian: true,
      };
      const mismatched = Object.entries(expected)
        .filter(([key, value]) => existing[key as keyof ServiceRow] !== value)
        .map(([key]) => key);
      if (mismatched.length > 0) {
        return blocked(
          `service ${slug} has unexpected ${mismatched.join(', ')} — inspect in Beheer first`,
        );
      }
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

    // Who offers it: whoever offers the Jeugd – eenmalig service, minus Toshoni unless he stays.
    const keepsToshoni = input.providerMode === 'staging-retain';
    const packageId = decision.service.kind === 'existing' ? decision.service.id : null;
    const offers = (providerId: string) => {
      const provider = providers.find((candidate) => candidate.id === providerId);
      return Boolean(
        provider?.isActive && provider.userActive && (keepsToshoni || !isToshoni(provider)),
      );
    };
    const already = new Set(
      subscriptions.filter((row) => row.serviceId === packageId).map((row) => row.providerId),
    );
    for (const row of subscriptions.filter((entry) => entry.serviceId === youthService.id)) {
      if (!offers(row.providerId) || already.has(row.providerId)) continue;
      decision.subscribe.push({ providerId: row.providerId, locationId: row.locationId });
    }
    // After the run: who offers it already (his rows go, unless he stays), and who is added.
    const offeredBy = [...already].filter(offers).length + decision.subscribe.length;
    if (offeredBy === 0) unbookableFor = youthService.slug;
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
  if (unbookableFor !== null && decision.changes.length > 0) {
    // The changes stay: the dry run shows what the run would make, and why it does not.
    return {
      ...decision,
      action: 'blocked',
      blockers: [
        `offering ${offering.slug}: ${AUDIENCE_LABELS[PACKAGE_AUDIENCE]} would be offered by no provider — add a replacement provider for ${unbookableFor} in Beheer → Aanbieders first`,
      ],
    };
  }
  decision.action = decision.changes.length > 0 ? 'update' : 'none';
  return decision;
}
