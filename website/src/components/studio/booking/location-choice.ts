import type {
  BookingLocationOption,
  BookingProviderOption,
  BookingServiceOption,
  BookingSlot,
} from './types';

/**
 * The location choice in "Kies een dag en uur" (20 Oct 2026) as plain data:
 * which places a fit for the chosen service may be at, the visitor's
 * selection (`null` = every place) and how the month's slots are narrowed to
 * it. Pure; tested in `location-choice.test.ts`.
 *
 * The places come from what the server already hands the widget: a service
 * pinned to a place is there; otherwise each provider offering it works from
 * the places of their hours (and their default), else the place resolved for
 * that provider. A place may still have no free moment in a given month —
 * the calendar then says so for that selection.
 */

export function locationsForService(input: {
  service: BookingServiceOption | null;
  providers: readonly BookingProviderOption[];
  /** A chosen provider, or `null` for "Iedereen". */
  providerId: string | null;
  /** Every place a slot may name, in admin order. */
  locations: readonly BookingLocationOption[];
}): BookingLocationOption[] {
  const { service, providerId } = input;
  if (!service) return [];
  const ids = new Set<string>();
  for (const provider of input.providers) {
    if (providerId && provider.id !== providerId) continue;
    const entry = provider.services.find((item) => item.serviceId === service.id);
    if (!entry) continue;
    if (service.location) {
      ids.add(service.location.id);
    } else if (provider.locations.length > 0) {
      for (const location of provider.locations) ids.add(location.id);
    } else if (entry.location) {
      ids.add(entry.location.id);
    }
  }
  return input.locations.filter((location) => ids.has(location.id));
}

/**
 * A selection against the places on offer: ids no longer offered are
 * dropped; an empty selection, or one that names every place, is "every
 * place" (`null`).
 */
export function normalizeLocationSelection(
  selected: readonly string[] | null,
  offered: readonly BookingLocationOption[],
): string[] | null {
  if (!selected) return null;
  const kept = selected.filter((id) => offered.some((location) => location.id === id));
  return kept.length === 0 || kept.length === offered.length ? null : kept;
}

/** Tapping a place: from "every place" to that one; otherwise in or out of the selection. */
export function toggleLocation(
  selected: readonly string[] | null,
  id: string,
  offered: readonly BookingLocationOption[],
): string[] | null {
  if (!selected) return normalizeLocationSelection([id], offered);
  const next = selected.includes(id) ? selected.filter((entry) => entry !== id) : [...selected, id];
  return normalizeLocationSelection(next, offered);
}

/** The slots at the selected places; every slot when `selected` is `null`. */
export function filterSlotsByLocation(
  slots: readonly BookingSlot[],
  selected: readonly string[] | null,
): BookingSlot[] {
  if (!selected) return [...slots];
  return slots.filter((slot) => slot.locationId !== null && selected.includes(slot.locationId));
}

/** What to show under a place: its address, or how a fit at home works. */
export function locationAddressLines(location: BookingLocationOption): string[] {
  if (location.kind === 'customer') return ['Je adres vul je straks in bij je gegevens.'];
  return location.addressLines;
}
