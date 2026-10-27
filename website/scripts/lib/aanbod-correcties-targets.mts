/**
 * What `npm run cms:patch-aanbod-correcties` wants and what it does about every
 * state a database can be in: the decisions of the small sections (site
 * settings, the booking location, the main menu, offering and service copy,
 * durations). Pure (no database, no I/O, no Next): `aanbod-correcties-world.mts`
 * reads the rows, `aanbod-correcties-plan.mts` feeds them in here,
 * `aanbod-correcties-apply.mts` writes, and `aanbod-correcties-targets.test.ts`
 * pins the rules. The page texts are the same idea in `aanbod-correcties-pages.mts`,
 * the youth package and the provider in `aanbod-correcties-youth.mts`.
 *
 * Toshoni, 27 Oct 2026. The data lives next to the seeds it must agree with:
 * the address (`seed-content/location-section.ts`), the phone number and the
 * page edits (`seed-content/corrections-2026-10-27.ts`), the gift voucher
 * promotion (`seed-content/cadeaubon-promo.ts`), the offering and service copy
 * (`src/lib/offers/corrections-2026-10-27.ts`).
 *
 * One rule for everything: a field holds the TARGET (done, `=`), the value it
 * had BEFORE (change, `~`), or something else, which an admin typed in Beheer
 * since (a blocker, `!`): an edit is never overwritten. Runbook:
 * `docs/staging-runbook.md` §24.
 */
import type { NavigationItem } from '@/lib/cms/blocks';
import {
  defaultSiteSettings,
  SITE_SETTING_KEYS,
  siteSettingSchemas,
  type SiteSettingKey,
} from '@/lib/cms/site-settings';
import type { ServiceTextFields } from '@/lib/offers/corrections-2026-10-27';
import { AUDIENCE_LABELS, type OfferingAudience } from '@/lib/offers/offering';
import { CADEAUBON_PROMO } from '@/lib/studio/seed-content/cadeaubon-promo';
import {
  PHONE_HREF_AFTER,
  PHONE_HREF_BEFORE,
  PHONE_LABEL_AFTER,
  PHONE_LABEL_BEFORE,
} from '@/lib/studio/seed-content/corrections-2026-10-27';
import {
  STUDIO_CONTACT_ADDRESS,
  type StudioAddress,
} from '@/lib/studio/seed-content/location-section';

// ---------------------------------------------------------------------------
// Comparing and describing
// ---------------------------------------------------------------------------

/** JSON with sorted object keys: Postgres `jsonb` does not keep key order. */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(value, (_key, entry: unknown) =>
    entry && typeof entry === 'object' && !Array.isArray(entry)
      ? Object.fromEntries(
          Object.entries(entry as Record<string, unknown>).sort(([a], [b]) => (a < b ? -1 : 1)),
        )
      : entry,
  );
}

export function sameValue(a: unknown, b: unknown): boolean {
  return canonicalJson(a) === canonicalJson(b);
}

/** A value for a log line: a quoted string, cut at `max` characters. */
export function shortText(value: unknown, max = 60): string {
  const text = typeof value === 'string' ? value : (JSON.stringify(value) ?? 'undefined');
  return JSON.stringify(text.length > max ? `${text.slice(0, max - 1)}…` : text);
}

/** A list change in a few words: "6 → 6 item(s), 2 changed"; a text change as "old" → "new". */
function describeValueChange(key: string, from: unknown, to: unknown): string {
  if (Array.isArray(from) && Array.isArray(to)) {
    const same = from.filter((value, index) => sameValue(value, to[index])).length;
    const changed = Math.max(from.length, to.length) - same;
    return `${key}: ${from.length} → ${to.length} item(s), ${changed} changed`;
  }
  return `${key}: ${shortText(from)} → ${shortText(to)}`;
}

// ---------------------------------------------------------------------------
// Addresses (site settings → Contact, and the booking location)
// ---------------------------------------------------------------------------

export type StoredAddress = {
  addressLines: string[];
  postalCode: string;
  city: string;
};

/** The city both addresses held before the street was known (Toshoni, 27 Oct 2026). */
const CITY_BEFORE = 'Ninove';

export function formatAddress(address: StoredAddress): string {
  const street = address.addressLines.filter(Boolean).join(', ');
  const place = [address.postalCode, address.city].filter(Boolean).join(' ');
  return [street, place].filter(Boolean).join(', ') || '(empty)';
}

export type AddressDecision =
  | { action: 'none' }
  | { action: 'update'; change: string }
  | { action: 'blocked'; blocker: string };

/**
 * Before: no street, no postal code, the city "Ninove" (or empty). Target: the
 * studio's address. Anything else is the admin's own.
 */
export function decideAddress(stored: StoredAddress, target: StudioAddress): AddressDecision {
  if (
    sameValue(stored.addressLines, target.addressLines) &&
    stored.postalCode === target.postalCode &&
    stored.city === target.city
  ) {
    return { action: 'none' };
  }
  if (
    stored.addressLines.length === 0 &&
    stored.postalCode === '' &&
    (stored.city === CITY_BEFORE || stored.city === '')
  ) {
    return {
      action: 'update',
      change: `address: ${formatAddress(stored)} → ${formatAddress({ ...target, addressLines: [...target.addressLines] })}`,
    };
  }
  return {
    action: 'blocked',
    blocker: `address holds neither the old (no street, ${CITY_BEFORE}) nor the new address (now ${formatAddress(stored)}) — edited in Beheer?`,
  };
}

// ---------------------------------------------------------------------------
// Site settings
// ---------------------------------------------------------------------------

export type ContactDecision = {
  /** The whole contact value to write, when something changes. */
  value: Record<string, unknown> | null;
  changes: string[];
  blockers: string[];
};

/**
 * Instellingen → Contact: the address (before → the studio's) and the phone
 * number (label and link each: `0473 95 26 33` → `+32 473 95 26 33`). The
 * other fields stay as they are; an empty phone field has nothing to correct.
 */
export function decideContact(stored: unknown): ContactDecision {
  const parsed = siteSettingSchemas.contact.safeParse(stored);
  if (!parsed.success) {
    return { value: null, changes: [], blockers: ['setting contact does not validate'] };
  }
  const contact = parsed.data;
  const next: Record<string, unknown> = { ...contact };
  const changes: string[] = [];
  const blockers: string[] = [];

  const address = decideAddress(contact, STUDIO_CONTACT_ADDRESS);
  if (address.action === 'update') {
    next.addressLines = [...STUDIO_CONTACT_ADDRESS.addressLines];
    next.postalCode = STUDIO_CONTACT_ADDRESS.postalCode;
    next.city = STUDIO_CONTACT_ADDRESS.city;
    next.country = STUDIO_CONTACT_ADDRESS.country;
    changes.push(address.change);
  } else if (address.action === 'blocked') {
    blockers.push(`setting contact: ${address.blocker}`);
  }

  const phone = [
    ['phoneLabel', 'phone label', PHONE_LABEL_BEFORE, PHONE_LABEL_AFTER],
    ['phoneHref', 'phone link', PHONE_HREF_BEFORE, PHONE_HREF_AFTER],
  ] as const;
  for (const [field, label, before, after] of phone) {
    const value = contact[field];
    if (value === after || value === '') continue;
    if (value === before) {
      next[field] = after;
      changes.push(`${label}: ${before} → ${after}`);
    } else {
      blockers.push(
        `setting contact: ${label} holds neither the old (${before}) nor the new (${after}) number (now ${shortText(value)}) — edited in Beheer?`,
      );
    }
  }
  return { value: changes.length > 0 ? next : null, changes, blockers };
}

/** The setting keys of the schema that have no row yet, in schema order. */
export function missingSettingKeys(existing: ReadonlySet<string>): SiteSettingKey[] {
  return SITE_SETTING_KEYS.filter((key) => !existing.has(key));
}

/** The schema defaults of a setting, as a fresh site shows them (`defaultSiteSettings()`). */
export function defaultSettingValue(key: SiteSettingKey): unknown {
  return defaultSiteSettings()[key];
}

export type SettingTextDecision = {
  /** The whole setting to write, when a field changes. */
  value: Record<string, unknown> | null;
  changes: string[];
  /** Fields that hold neither text: the studio's own, left alone (not a blocker). */
  notes: string[];
};

/**
 * Default texts in a settings group that the corrections change (the SEO
 * title and description lose their dashes): a field is written only when it
 * still holds the default text it had; any other text is the studio's own and
 * stays as it is.
 */
export function decideSettingTexts(
  key: SiteSettingKey,
  stored: unknown,
  corrections: ReadonlyArray<{ key: string; field: string; from: string; to: string }>,
): SettingTextDecision {
  const parsed = siteSettingSchemas[key].safeParse(stored);
  const decision: SettingTextDecision = { value: null, changes: [], notes: [] };
  if (!parsed.success) return decision;
  const next: Record<string, unknown> = { ...parsed.data };
  for (const correction of corrections.filter((entry) => entry.key === key)) {
    const current = next[correction.field];
    if (current === correction.to) continue;
    if (current === correction.from) {
      next[correction.field] = correction.to;
      decision.changes.push(
        `${correction.field}: ${shortText(correction.from)} → ${shortText(correction.to)}`,
      );
    } else {
      decision.notes.push(`${correction.field} is not the default text: left alone`);
    }
  }
  if (decision.changes.length > 0) decision.value = next;
  return decision;
}

// ---------------------------------------------------------------------------
// The main menu
// ---------------------------------------------------------------------------

/**
 * "Cadeaubon" goes in front of "Contact" (at the end when there is no such
 * item), unless an item with that link is already in the menu.
 */
export function decideMenu(
  items: readonly NavigationItem[],
  promo: { item: NavigationItem; before: string } = CADEAUBON_PROMO.menu,
): { items: NavigationItem[] | null; change: string } {
  const present = items.some(
    (item) =>
      item.href === promo.item.href ||
      item.children.some((child) => child.href === promo.item.href),
  );
  if (present) return { items: null, change: '' };
  const index = items.findIndex((item) => item.label === promo.before);
  const clone = structuredClone(promo.item);
  const next =
    index < 0 ? [...items, clone] : [...items.slice(0, index), clone, ...items.slice(index)];
  return {
    items: next,
    change: `insert "${promo.item.label}" (${promo.item.href}) ${index < 0 ? 'at the end' : `before "${promo.before}"`}`,
  };
}

// ---------------------------------------------------------------------------
// Copy of offerings and services: exact from → to, per field
// ---------------------------------------------------------------------------

export type TextDecision = {
  /** The fields to write (key → new value). */
  writes: Record<string, unknown>;
  /** What those fields hold now (for the backup and the audit line). */
  before: Record<string, unknown>;
  changes: string[];
  blockers: string[];
};

type Fields = Readonly<Record<string, unknown>>;

/**
 * The other old states a correction declares (`alsoBefore`: a text, one state, or
 * a list of states) as records of fields. A plain string is the description of a
 * service (a Beheer save rewrites it from the offering's summary).
 */
export function alternativeStates(value: unknown): Fields[] {
  if (typeof value === 'string') return [{ description: value }];
  if (Array.isArray(value)) return value.flatMap(alternativeStates);
  return value && typeof value === 'object' ? [value as Fields] : [];
}

/**
 * Compares the fields named in `to` with what is stored: `to` → done, `from`
 * (or one of `alsoBefore`, other states known to be live) → write `to`, anything
 * else → a blocker. Only the named fields are looked at, so an editor's change to
 * any other field never blocks the patch.
 */
export function decideTexts(
  label: string,
  stored: Fields,
  from: Fields,
  to: Fields,
  alsoBefore: readonly Fields[] = [],
): TextDecision {
  const decision: TextDecision = { writes: {}, before: {}, changes: [], blockers: [] };
  for (const key of Object.keys(to)) {
    const current = stored[key];
    if (sameValue(current, to[key])) continue;
    if (
      sameValue(current, from[key]) ||
      alsoBefore.some((state) => key in state && sameValue(current, state[key]))
    ) {
      decision.writes[key] = to[key];
      decision.before[key] = current;
      decision.changes.push(describeValueChange(key, current, to[key]));
    } else {
      decision.blockers.push(
        `${label}: ${key} holds neither the old nor the new text (now ${shortText(current)}) — edited in Beheer?`,
      );
    }
  }
  return decision;
}

/** The variant labels of 20 Oct 2026: Jeugd was one variant then. */
const LABELS_OF_20_OCT: Readonly<Record<OfferingAudience, string>> = {
  all: '',
  adult: 'Volwassene',
  youth: 'Jeugd',
  'youth-package': AUDIENCE_LABELS['youth-package'],
};

/**
 * The text of a booking service after the offering it belongs to was saved
 * through the repo: name "<title> – <label>", the label, the offering's
 * summary. The prices patch of 20 Oct 2026 saved the current-bike fit, so
 * staging and production may hold this instead of the bootstrap text.
 */
export function serviceTextAfterRepoSave(
  offering: { title: string; summary: string },
  audience: OfferingAudience,
): ServiceTextFields {
  const label = LABELS_OF_20_OCT[audience];
  return {
    name: label ? `${offering.title} – ${label}` : offering.title,
    choiceLabel: label,
    description: offering.summary,
  };
}

// ---------------------------------------------------------------------------
// Durations (Toshoni, 27 Oct 2026)
// ---------------------------------------------------------------------------

/**
 * Both bikefits take 2 hours; voetanalyse 30 minutes, zadelanalyse 1 hour,
 * schoenplaatjes 15 minutes. Applies to the booking service of every variant
 * of the offering that has one (a bikefit that is asked for has none: nothing
 * to set). The current-bike fit's services were set to 2 hours on 20 Oct 2026.
 */
export const DURATION_TARGETS: ReadonlyArray<{ slug: string; minutes: number }> = [
  { slug: 'bikefit-nieuwe-fiets', minutes: 120 },
  { slug: 'voetanalyse', minutes: 30 },
  { slug: 'zadelanalyse', minutes: 60 },
  { slug: 'afstellen-schoenplaatjes', minutes: 15 },
];

/** What Beheer → Aanbod offers as the duration of a service that is made bookable. */
export const BEHEER_PREFILL_MINUTES = 60;

export type DurationDecision =
  | { action: 'none' }
  | { action: 'update'; change: string }
  | { action: 'blocked'; blocker: string };

/** The target is done; the Beheer prefill is moved to it; any other duration is the admin's own. */
export function decideDuration(current: number, target: number): DurationDecision {
  if (current === target) return { action: 'none' };
  if (current === BEHEER_PREFILL_MINUTES) {
    return { action: 'update', change: `${current} → ${target} min` };
  }
  return {
    action: 'blocked',
    blocker: `duration is ${current} min, neither the Beheer prefill (${BEHEER_PREFILL_MINUTES}) nor the target (${target}) — edited in Beheer?`,
  };
}
