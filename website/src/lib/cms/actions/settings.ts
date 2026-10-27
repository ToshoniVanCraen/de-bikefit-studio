'use server';

import { revalidatePath } from 'next/cache';
import { DEFAULT_LOCALE } from '@/db/cms-schema';
import { isValidTimeZone } from '@/lib/booking/time';
import { isSiteSettingKey, siteSettingSchemas, type SiteSettingKey } from '@/lib/cms/blocks';
import { updateSiteSetting } from '@/lib/cms/repo';
import { isUnsafeUrl } from './sanitize';
import { runAction } from './run';
import { actionError, actionOk, boolField, field, type ActionState } from './state';

/** Site-settings server actions — admin only (`settings.update` in `repo.ts`). */

function lines(form: FormData, name: string): string[] {
  return field(form, name)
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
}

function numberOrNull(form: FormData, name: string): number | null {
  const raw = field(form, name).replace(',', '.');
  if (!raw) return null;
  const value = Number(raw);
  return Number.isFinite(value) ? value : null;
}

/**
 * Whole number from a form field, or `undefined` when empty or not a number so
 * the schema default applies. Out-of-range values are left for zod to refuse.
 */
function intOrUndefined(form: FormData, name: string): number | undefined {
  const raw = field(form, name);
  if (!raw) return undefined;
  const value = Number(raw);
  return Number.isInteger(value) ? value : undefined;
}

function valueFor(key: SiteSettingKey, form: FormData): unknown {
  switch (key) {
    case 'site':
      return {
        name: field(form, 'name'),
        tagline: field(form, 'tagline'),
        mission: field(form, 'mission'),
        logoMediaId: field(form, 'logoMediaId') || null,
      };
    case 'contact':
      return {
        phoneLabel: field(form, 'phoneLabel'),
        phoneHref: field(form, 'phoneHref'),
        email: field(form, 'email'),
        addressLines: lines(form, 'addressLines'),
        postalCode: field(form, 'postalCode'),
        city: field(form, 'city'),
        country: field(form, 'country'),
        hours: field(form, 'hours'),
        website: field(form, 'website'),
      };
    case 'seo':
      return {
        defaultMetaTitle: field(form, 'defaultMetaTitle'),
        titleTemplate: field(form, 'titleTemplate'),
        defaultMetaDescription: field(form, 'defaultMetaDescription'),
        defaultOgImageMediaId: field(form, 'defaultOgImageMediaId') || null,
        allowIndexing: boolField(form, 'allowIndexing'),
      };
    case 'organization':
      return {
        type: field(form, 'type') || 'LocalBusiness',
        sameAs: lines(form, 'sameAs'),
        priceRange: field(form, 'priceRange'),
        areaServed: lines(form, 'areaServed'),
        latitude: numberOrNull(form, 'latitude'),
        longitude: numberOrNull(form, 'longitude'),
      };
    case 'analytics':
      return {
        ga4PropertyId: field(form, 'ga4PropertyId').replace(/^properties\//, ''),
        enabled: boolField(form, 'enabled'),
      };
    case 'booking':
      return {
        slotStepMinutes: intOrUndefined(form, 'slotStepMinutes'),
        minNoticeHours: intOrUndefined(form, 'minNoticeHours'),
        horizonDays: intOrUndefined(form, 'horizonDays'),
        defaultBufferAfterMinutes: intOrUndefined(form, 'defaultBufferAfterMinutes'),
        cancelUntilHours: intOrUndefined(form, 'cancelUntilHours'),
        timezone: field(form, 'timezone') || undefined,
        introTitle: field(form, 'introTitle') || undefined,
        introText: field(form, 'introText'),
        confirmationText: field(form, 'confirmationText') || undefined,
        showProviderChoice: boolField(form, 'showProviderChoice'),
      };
    case 'business':
      return {
        legalName: field(form, 'legalName'),
        seatAddressLines: lines(form, 'seatAddressLines'),
        seatPostalCode: field(form, 'seatPostalCode'),
        seatCity: field(form, 'seatCity'),
        seatCountry: field(form, 'seatCountry').toUpperCase(),
        enterpriseNumber: field(form, 'enterpriseNumber'),
        vatNumber: field(form, 'vatNumber'),
      };
    case 'rules':
      return {
        followUpMonthsAdult: monthsOrUndefined(form, 'followUpMonthsAdult'),
        followUpMonthsYouthPackage: monthsOrUndefined(form, 'followUpMonthsYouthPackage'),
        secondVisitFreeMonths: monthsOrUndefined(form, 'secondVisitFreeMonths'),
        voucherValidityMonths: monthsOrUndefined(form, 'voucherValidityMonths'),
      };
  }
}

/**
 * A number of months from a form field: `undefined` when empty (the default
 * applies), the typed number otherwise: a decimal or a word reaches the schema
 * as it is and is refused there with a Dutch message.
 */
function monthsOrUndefined(form: FormData, name: string): number | undefined {
  const raw = field(form, name).replace(',', '.');
  return raw ? Number(raw) : undefined;
}

/** What the form calls each field of the two groups the schema checks for us. */
const FIELD_LABELS: Readonly<Record<string, string>> = {
  legalName: 'Juridische naam',
  seatAddressLines: 'Adresregels',
  seatPostalCode: 'Postcode',
  seatCity: 'Gemeente',
  seatCountry: 'Land',
  enterpriseNumber: 'Ondernemingsnummer',
  vatNumber: 'Btw-nummer',
  followUpMonthsAdult: 'Probleemopvolging volwassene',
  followUpMonthsYouthPackage: 'Opvolging jeugd – volledig pakket',
  secondVisitFreeMonths: 'Gratis tweede bezoek',
  voucherValidityMonths: 'Geldigheid cadeaubon',
};

/**
 * `parseSiteSetting()` in the repo falls back to the defaults for the WHOLE key
 * when a value does not validate, which would silently reset the legal identity
 * or every length in the copy. For the two groups of 27 Oct 2026 the schema
 * itself says what is wrong, in Dutch, before anything is saved.
 */
function schemaProblem(key: SiteSettingKey, value: unknown): string | null {
  if (key !== 'business' && key !== 'rules') return null;
  const parsed = siteSettingSchemas[key].safeParse(value);
  if (parsed.success) return null;
  const issue = parsed.error.issues[0];
  const label = FIELD_LABELS[String(issue.path[0])];
  return label ? `${label}: ${issue.message}` : issue.message;
}

/**
 * `parseSiteSetting()` in the repo falls back to the defaults for the WHOLE key
 * when a value does not validate, which would silently reset every booking
 * rule. Refuse out-of-range numbers here instead, with a readable message.
 */
function bookingProblem(form: FormData): string | null {
  const checks: Array<[string, string, number, number]> = [
    ['slotStepMinutes', 'Tijdsraster', 5, 240],
    ['minNoticeHours', 'Minimale voorafgaande termijn', 0, 1440],
    ['horizonDays', 'Boekingshorizon', 1, 730],
    ['defaultBufferAfterMinutes', 'Standaard buffer', 0, 240],
    ['cancelUntilHours', 'Annuleren tot', 0, 1440],
  ];
  for (const [name, label, min, max] of checks) {
    const raw = field(form, name);
    if (!raw) continue;
    const value = Number(raw);
    if (!Number.isInteger(value) || value < min || value > max) {
      return `${label}: geef een geheel getal tussen ${min} en ${max}.`;
    }
  }
  const timezone = field(form, 'timezone');
  if (timezone && !isValidTimeZone(timezone)) {
    return 'Tijdzone: gebruik een IANA-naam zoals Europe/Brussels.';
  }
  return null;
}

export async function updateSettingAction(
  _prevState: ActionState,
  form: FormData,
): Promise<ActionState> {
  return runAction(async () => {
    const key = field(form, 'key');
    if (!isSiteSettingKey(key)) return actionError('Onbekende instelling.');

    const locale = field(form, 'locale') || DEFAULT_LOCALE;
    if (key === 'booking') {
      const problem = bookingProblem(form);
      if (problem) return actionError(problem);
    }
    const value = valueFor(key, form);
    const problem = schemaProblem(key, value);
    if (problem) return actionError(problem);

    for (const candidate of [field(form, 'phoneHref'), field(form, 'website')]) {
      if (candidate && isUnsafeUrl(candidate)) {
        return actionError('Een van de links gebruikt een niet-toegelaten schema.');
      }
    }

    const result = await updateSiteSetting(locale, key, value);
    if (!result.ok) return actionError(result.message);

    revalidatePath('/admin/settings');
    return actionOk('Instellingen opgeslagen.');
  });
}
