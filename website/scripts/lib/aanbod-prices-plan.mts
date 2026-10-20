/**
 * Read-only half of `npm run cms:patch-aanbod-prijzen`: what Toshoni's prices
 * and durations of 20 Oct 2026 (`src/lib/offers/aanbod-prices.ts`) would
 * change on an existing database, what blocks it, and the dry-run printout.
 * Never writes; the dry run runs it against `readOnlyDb()`. The writing half
 * (backup, apply, verify, restore, mode dispatch) is `aanbod-prices-patch.mts`.
 *
 * Rule per field: the stored value equals the new value → done; equals the
 * old value → change; anything else → an admin edited it since the rollout
 * and the patch refuses (`!`), no override.
 */
import { cmsOfferingVariants, cmsOfferings } from '@/db/cms-offering-schema';
import {
  NEW_OFFERING_SLUGS,
  OFFERING_PRICE_CHANGES,
  SERVICE_PRICE_CHANGES,
  type OfferingPriceState,
  type ServicePriceState,
} from '@/lib/offers/aanbod-prices';
import { OFFERING_AUDIENCES, type OfferingAudience } from '@/lib/offers/offering';
import { stable, type PlanDeps } from './aanbod-rollout.mjs';
import { isTransportFailure } from './cli-options.mjs';

export type OfferingRow = typeof cmsOfferings.$inferSelect;
export type VariantRow = typeof cmsOfferingVariants.$inferSelect;

export type StoredOffering = { row: OfferingRow; variants: VariantRow[] };

export type OfferingPlan = {
  slug: string;
  action: 'update' | 'unchanged' | 'missing' | 'conflict';
  stored: StoredOffering | null;
  changes: string[];
  conflicts: string[];
};

export type NewOfferingPlan = { slug: string; action: 'create' | 'exists' };

export type ServiceRow = PlanDeps['schema']['cmsServices']['$inferSelect'];

export type ServicePlan = {
  slug: string;
  action: 'update' | 'unchanged' | 'missing' | 'conflict';
  stored: ServiceRow | null;
  changes: string[];
  conflicts: string[];
};

/** Row counts of what the patch must not add or remove. Service rows change inside, by design. */
export type PriceGuards = {
  bookings: number;
  services: number;
  providerServices: number;
  providers: number;
};

export type AanbodPricesPlan = {
  locale: string;
  offerings: OfferingPlan[];
  created: NewOfferingPlan[];
  services: ServicePlan[];
  guards: PriceGuards;
};

const AUDIENCE_ORDER: Record<OfferingAudience, number> = Object.fromEntries(
  OFFERING_AUDIENCES.map((audience, index) => [audience, index]),
) as Record<OfferingAudience, number>;

/**
 * Runs a read again, once, after a transport failure of the HTTP driver (20 Oct
 * 2026 on Neon Staging: the first query after the apply's module imports hit a
 * keep-alive socket the server had closed meanwhile — "fetch failed"). An SQL
 * error is thrown as is.
 */
export async function withTransportRetry<T>(read: () => Promise<T>): Promise<T> {
  try {
    return await read();
  } catch (error) {
    if (!isTransportFailure(error)) throw error;
    await new Promise((resolve) => setTimeout(resolve, 750));
    return read();
  }
}

export async function readStoredOffering(
  deps: PlanDeps,
  slug: string,
): Promise<StoredOffering | null> {
  const { and, asc, eq } = deps.orm;
  const [row] = await withTransportRetry(() =>
    deps.db
      .select()
      .from(cmsOfferings)
      .where(and(eq(cmsOfferings.locale, deps.locale), eq(cmsOfferings.slug, slug)))
      .limit(1),
  );
  if (!row) return null;
  const variants = await deps.db
    .select()
    .from(cmsOfferingVariants)
    .where(eq(cmsOfferingVariants.offeringId, row.id))
    .orderBy(asc(cmsOfferingVariants.audience));
  variants.sort(
    (a, b) =>
      (AUDIENCE_ORDER[a.audience as OfferingAudience] ?? 9) -
      (AUDIENCE_ORDER[b.audience as OfferingAudience] ?? 9),
  );
  return { row, variants };
}

export async function readStoredService(deps: PlanDeps, slug: string): Promise<ServiceRow | null> {
  const { and, eq } = deps.orm;
  const [row] = await withTransportRetry(() =>
    deps.db
      .select()
      .from(deps.schema.cmsServices)
      .where(
        and(
          eq(deps.schema.cmsServices.locale, deps.locale),
          eq(deps.schema.cmsServices.slug, slug),
        ),
      )
      .limit(1),
  );
  return row ?? null;
}

/** The fields the patch compares, as stored. */
export function offeringState(stored: StoredOffering): OfferingPriceState {
  return {
    duration: stored.row.duration,
    contents: [...stored.row.contents],
    extras: [...stored.row.extras],
    metaDescription: stored.row.metaDescription,
    variantMode: stored.row.variantMode as OfferingPriceState['variantMode'],
    variants: stored.variants.map((variant) => ({
      audience: variant.audience as OfferingAudience,
      priceCents: variant.priceCents,
    })),
  };
}

export function serviceState(row: ServiceRow): ServicePriceState {
  return {
    durationMinutes: row.durationMinutes,
    priceCents: row.priceCents,
    showPrice: row.showPrice,
  };
}

function short(value: unknown): string {
  const text = typeof value === 'string' ? value : JSON.stringify(value);
  return text.length > 60 ? `${text.slice(0, 57)}…` : text;
}

/** Compares each field of `current` with `from` and `to`; the keys of `to` decide what is looked at. */
function diffFields<T extends Record<string, unknown>>(
  current: T,
  from: T,
  to: T,
): { changes: string[]; conflicts: string[] } {
  const changes: string[] = [];
  const conflicts: string[] = [];
  for (const key of Object.keys(to) as Array<keyof T & string>) {
    const now = stable(current[key]);
    if (now === stable(to[key])) continue;
    if (now === stable(from[key])) {
      changes.push(`${key}: ${short(from[key])} → ${short(to[key])}`);
    } else {
      conflicts.push(
        `${key} holds neither the old nor the new value (now ${short(current[key])}) — edited in the admin?`,
      );
    }
  }
  return { changes, conflicts };
}

export async function guardCounts(deps: PlanDeps): Promise<PriceGuards> {
  const { db, schema } = deps;
  const [bookings, services, providerServices, providers] = await Promise.all([
    db.select({ id: schema.cmsBookings.id }).from(schema.cmsBookings),
    db.select({ id: schema.cmsServices.id }).from(schema.cmsServices),
    db.select({ id: schema.cmsProviderServices.providerId }).from(schema.cmsProviderServices),
    db.select({ id: schema.cmsProviders.id }).from(schema.cmsProviders),
  ]);
  return {
    bookings: bookings.length,
    services: services.length,
    providerServices: providerServices.length,
    providers: providers.length,
  };
}

export async function planAanbodPrices(deps: PlanDeps): Promise<AanbodPricesPlan> {
  const offerings: OfferingPlan[] = [];
  for (const change of OFFERING_PRICE_CHANGES) {
    const stored = await readStoredOffering(deps, change.slug);
    if (!stored) {
      offerings.push({ slug: change.slug, action: 'missing', stored, changes: [], conflicts: [] });
      continue;
    }
    const { changes, conflicts } = diffFields(offeringState(stored), change.from, change.to);
    offerings.push({
      slug: change.slug,
      action: conflicts.length ? 'conflict' : changes.length ? 'update' : 'unchanged',
      stored,
      changes,
      conflicts,
    });
  }

  const created: NewOfferingPlan[] = [];
  for (const slug of NEW_OFFERING_SLUGS) {
    const stored = await readStoredOffering(deps, slug);
    created.push({ slug, action: stored ? 'exists' : 'create' });
  }

  const services: ServicePlan[] = [];
  for (const change of SERVICE_PRICE_CHANGES) {
    const stored = await readStoredService(deps, change.slug);
    if (!stored) {
      services.push({ slug: change.slug, action: 'missing', stored, changes: [], conflicts: [] });
      continue;
    }
    const { changes, conflicts } = diffFields(serviceState(stored), change.from, change.to);
    services.push({
      slug: change.slug,
      action: conflicts.length ? 'conflict' : changes.length ? 'update' : 'unchanged',
      stored,
      changes,
      conflicts,
    });
  }

  return { locale: deps.locale, offerings, created, services, guards: await guardCounts(deps) };
}

export function aanbodPricesHasChanges(plan: AanbodPricesPlan): boolean {
  return (
    plan.offerings.some((entry) => entry.action === 'update') ||
    plan.created.some((entry) => entry.action === 'create') ||
    plan.services.some((entry) => entry.action === 'update')
  );
}

export function aanbodPricesBlockers(plan: AanbodPricesPlan): string[] {
  const blockers: string[] = [];
  for (const entry of plan.offerings) {
    if (entry.action === 'missing') {
      blockers.push(
        `offering ${entry.slug} is missing — run cms:bootstrap / cms:migrate-aanbod first`,
      );
    }
    for (const conflict of entry.conflicts) blockers.push(`offering ${entry.slug}: ${conflict}`);
  }
  for (const entry of plan.services) {
    if (entry.action === 'missing') blockers.push(`service ${entry.slug} is missing`);
    for (const conflict of entry.conflicts) blockers.push(`service ${entry.slug}: ${conflict}`);
  }
  return blockers;
}

export function printAanbodPricesPlan(plan: AanbodPricesPlan, log: PlanDeps['log']): void {
  for (const entry of plan.offerings) {
    if (entry.action === 'update') {
      log('~', `offering ${entry.slug} — ${entry.changes.length} change(s)`);
      for (const change of entry.changes) log(' ', `  ${change}`);
    } else if (entry.action === 'unchanged') {
      log('=', `offering ${entry.slug} — already at the 20 Oct 2026 values`);
    }
  }
  for (const entry of plan.created) {
    if (entry.action === 'create') log('+', `offering ${entry.slug} — create from the defaults`);
    else log('=', `offering ${entry.slug} — exists`);
  }
  for (const entry of plan.services) {
    if (entry.action === 'update') {
      log('~', `service ${entry.slug} — ${entry.changes.join('; ')}`);
    } else if (entry.action === 'unchanged') {
      log('=', `service ${entry.slug} — already 2 u and priced`);
    }
  }
  const { guards } = plan;
  log(
    '=',
    `guards: ${guards.bookings} bookings, ${guards.services} services, ${guards.providerServices} provider services, ${guards.providers} providers (counts must not change)`,
  );
}
