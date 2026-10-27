'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { euroInputToCents, slugify } from '@/lib/booking/format';
import {
  audiencesFor,
  AUDIENCE_LABELS,
  OFFERING_MAX_ADDON_CHOICES,
  OFFERING_BOOKING_MODES,
  OFFERING_VARIANT_MODES,
  type OfferingAudience,
  type OfferingBookingMode,
  type OfferingVariantMode,
  type VariantServiceInput,
} from '@/lib/offers/offering';
import { linesToList, OFFERING_SLUG_PATTERN } from '@/lib/offers/offering-content';
import { createOffering, deleteOffering, updateOffering } from '@/lib/offers/repo';
import { runAction } from './run';
import { actionError, actionOk, boolField, field, type ActionState } from './state';

/**
 * Beheer → Aanbod. One form per offering: the copy, whether it is shown,
 * its variants with their booking facts and prices, direct booking or
 * enquiry. The fields become the objects `createOffering()` /
 * `updateOffering()` validate again (zod), after they checked
 * `offering.manage` themselves — this wrapper is not the boundary
 * (`offerings.test.ts` calls it directly as a provider and as an editor).
 */

function oneOf<T extends string>(value: string, options: readonly T[]): T | null {
  return (options as readonly string[]).includes(value) ? (value as T) : null;
}

function intIn(raw: string, min: number, max: number): number | null {
  if (!/^-?\d+$/.test(raw)) return null;
  const value = Number(raw);
  return value >= min && value <= max ? value : null;
}

function revalidateOfferingViews(): void {
  revalidatePath('/admin/aanbod', 'layout');
  revalidatePath('/admin/agenda');
  revalidatePath('/admin/providers', 'layout');
}

/** The variant's service facts from the form; `null` when nothing was filled in. */
function serviceFrom(
  form: FormData,
  audience: OfferingAudience,
): { ok: true; data: VariantServiceInput | null } | { ok: false; message: string } {
  const who = AUDIENCE_LABELS[audience] ? `${AUDIENCE_LABELS[audience]}: ` : '';
  const durationRaw = field(form, `duration:${audience}`);
  const bufferRaw = field(form, `buffer:${audience}`);
  if (!durationRaw) return { ok: true, data: null };
  const durationMinutes = intIn(durationRaw, 5, 720);
  if (durationMinutes === null) {
    return {
      ok: false,
      message: `${who}de duur moet een geheel aantal minuten tussen 5 en 720 zijn.`,
    };
  }
  const bufferAfterMinutes = bufferRaw ? intIn(bufferRaw, 0, 240) : null;
  if (bufferRaw && bufferAfterMinutes === null) {
    return { ok: false, message: `${who}de buffer moet tussen 0 en 240 minuten liggen.` };
  }
  return {
    ok: true,
    data: {
      durationMinutes,
      bufferAfterMinutes,
      locationId: field(form, `location:${audience}`) || null,
      requiresGuardian: boolField(form, `guardian:${audience}`),
    },
  };
}

export async function saveOfferingAction(
  _prevState: ActionState,
  form: FormData,
): Promise<ActionState> {
  return runAction(async () => {
    const offeringId = field(form, 'offeringId') || null;
    const title = field(form, 'title');
    if (!title) return actionError('Geef het aanbod een titel.');
    const sortRaw = field(form, 'sortOrder');
    const sortOrder = sortRaw ? intIn(sortRaw, 0, 999) : 0;
    if (sortOrder === null) return actionError('De volgorde moet een getal tussen 0 en 999 zijn.');

    const imageMediaId = field(form, 'imageMediaId') || null;
    const content = {
      slug: field(form, 'slug') || slugify(title),
      category: field(form, 'category') || 'bikefit',
      sortOrder,
      title,
      summary: field(form, 'summary'),
      intro: field(form, 'intro'),
      goal: field(form, 'goal'),
      contents: linesToList(field(form, 'contents')),
      extras: linesToList(field(form, 'extras')),
      extrasNote: field(form, 'extrasNote'),
      duration: field(form, 'duration'),
      priceText: field(form, 'priceText'),
      ctaLabel: field(form, 'ctaLabel'),
      image: {
        mediaId: imageMediaId,
        // An editorial image from `/public` stays until a media item replaces it.
        url: imageMediaId ? null : field(form, 'imageUrl') || null,
        alt: field(form, 'imageAlt'),
        decorative: false,
      },
      metaDescription: field(form, 'metaDescription'),
    };

    const bookingMode = oneOf<OfferingBookingMode>(
      field(form, 'bookingMode'),
      OFFERING_BOOKING_MODES,
    );
    const variantMode = oneOf<OfferingVariantMode>(
      field(form, 'variantMode'),
      OFFERING_VARIANT_MODES,
    );
    if (!bookingMode || !variantMode) return actionError('Kies hoe dit aanbod geboekt wordt.');

    const variants = [];
    for (const audience of audiencesFor(variantMode)) {
      const priceCents = euroInputToCents(field(form, `price:${audience}`));
      if (priceCents === undefined) {
        const which = AUDIENCE_LABELS[audience];
        return actionError(
          `${which ? `${which}: g` : 'G'}eef de prijs in euro, bv. 150 of 149,50, of laat het veld leeg voor “Prijs op aanvraag”.`,
        );
      }
      const service = serviceFrom(form, audience);
      if (!service.ok) return actionError(service.message);
      variants.push({
        audience,
        serviceId: field(form, `serviceId:${audience}`) || null,
        priceCents,
        service: service.data,
      });
    }

    // Extra's (20 Oct 2026): the minutes only matter for an extra; "ook apart
    // te boeken" is only a choice for an extra (anything else is sold alone).
    const isAddon = boolField(form, 'isAddon');
    const minutesRaw = field(form, 'addonMinutes');
    const addonMinutes = minutesRaw ? intIn(minutesRaw, 5, 720) : null;
    if (minutesRaw && addonMinutes === null) {
      return actionError('De extra tijd moet een geheel aantal minuten tussen 5 en 720 zijn.');
    }
    const addonIds = form
      .getAll('addonIds')
      .filter((value): value is string => typeof value === 'string' && value.trim() !== '')
      .map((value) => value.trim());

    // Choices within an extra: the rows of the "Keuzes" list; an empty name is no row.
    const addonOptions: { key: string; label: string; minutes: number; priceCents: number }[] = [];
    for (let row = 0; row < OFFERING_MAX_ADDON_CHOICES; row += 1) {
      const label = field(form, `addonOptionLabel:${row}`);
      if (!label) continue;
      const minutes = intIn(field(form, `addonOptionMinutes:${row}`), 5, 720);
      if (minutes === null) {
        return actionError(
          `Keuze “${label}”: de tijd moet een geheel aantal minuten tussen 5 en 720 zijn.`,
        );
      }
      const priceCents = euroInputToCents(field(form, `addonOptionPrice:${row}`));
      if (priceCents === undefined || priceCents === null) {
        return actionError(`Keuze “${label}”: geef de prijs in euro, bv. 75 of 149,50.`);
      }
      // A choice that exists keeps its key when its label changes: bookings and the copy token
      // `{{extra:<slug>:<key>}}` refer to it. Only a new row gets a key from its label.
      const keptKey = field(form, `addonOptionKey:${row}`);
      const key = OFFERING_SLUG_PATTERN.test(keptKey)
        ? keptKey
        : slugify(label) || `keuze-${row + 1}`;
      addonOptions.push({ key, label, minutes, priceCents });
    }

    const input = {
      content,
      settings: {
        isListed: boolField(form, 'isListed'),
        bookingMode,
        variantMode,
        variants,
        isAddon,
        soldAlone: isAddon ? boolField(form, 'soldAlone') : true,
        addonMinutes: isAddon ? addonMinutes : null,
        addonIds,
        addonOptions: isAddon ? addonOptions : [],
      },
    };
    const result = offeringId
      ? await updateOffering(offeringId, input)
      : await createOffering(input);
    if (!result.ok) return actionError(result.message);

    revalidateOfferingViews();
    if (!offeringId) redirect(`/admin/aanbod/${result.data.id}?created=1`);
    return actionOk('Aanbod opgeslagen. De website toont het meteen zo.');
  });
}

export async function deleteOfferingAction(
  _prevState: ActionState,
  form: FormData,
): Promise<ActionState> {
  return runAction(async () => {
    const offeringId = field(form, 'offeringId');
    if (!offeringId) return actionError('Dit aanbod bestaat niet (meer).');
    if (field(form, 'confirm') !== 'VERWIJDER') {
      return actionError('Typ VERWIJDER om het aanbod definitief te verwijderen.');
    }
    const result = await deleteOffering(offeringId);
    if (!result.ok) return actionError(result.message);

    revalidateOfferingViews();
    redirect('/admin/aanbod');
  });
}
