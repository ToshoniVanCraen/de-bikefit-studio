/**
 * The provider Toshoni, the section of `npm run cms:patch-aanbod-correcties` that
 * looks at who offers what: Toshoni's offerings as Aanbieder (they go, or on
 * staging they stay: {@link ProviderMode}). The youth package that also lived
 * here is withdrawn (Toshoni, 29 Oct 2026); the file keeps its name. Pure (no
 * database, no I/O):
 * `aanbod-correcties-plan.mts` feeds the rows in, `aanbod-correcties-youth.test.ts`,
 * `-youth-toshoni.test.ts` and `-youth-retain.test.ts` pin the rules.
 * The other sections are `aanbod-correcties-targets.mts`; the same rule applies
 * (the target is done, the old state moves, anything else is an admin's edit and
 * blocks the patch). Runbook: `docs/staging-runbook.md` §25.
 */
import { normalizeEmail } from '@/lib/email-address';
import { FIRST_PROVIDER } from './first-provider.mjs';

// ---------------------------------------------------------------------------
// The provider Toshoni
// ---------------------------------------------------------------------------

/**
 * What a run does with Toshoni as Aanbieder. `remove`, the default and the rule
 * for production (where it still waits for Toshoni's go): his offerings go.
 * `staging-retain`, chosen with {@link STAGING_RETAIN_FLAG} (Toshoni, 27 Oct 2026,
 * 15:12, for staging only): he stays a provider with every offering he has; only on
 * a database whose one provider is him (`keepSoleProvider`).
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
 * provider: his offerings go (`decideProviderRemoval`), the verify looks for him;
 * on staging he stays (`staging-retain`). A provider is
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
 * else: nothing removed, nothing verified), or when more than one matches. A
 * database without providers has nothing to remove.
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
