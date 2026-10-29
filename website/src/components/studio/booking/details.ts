import { formatPhoneForInput, isBarePrefix, normalizePhone } from '@/lib/booking/phone';
import type { BookActionInput } from './types';

/**
 * The details form's values, validation and mapping onto `bookAction`'s input.
 * Pure — the server validates again (zod in `@/lib/booking/public-booking`);
 * this layer only exists so a visitor sees Dutch messages next to the field
 * before anything is sent. One form for every fit: since 29 Oct 2026 (Toshoni)
 * a Jeugd booking no longer switches to a parent's or guardian's details.
 */

export type DetailsValues = {
  name: string;
  email: string;
  phone: string;
  age: string;
  street: string;
  city: string;
  bikeType: string;
  bikeModel: string;
  notes: string;
  /** Honeypot. */
  website: string;
};

export type DetailsField = keyof DetailsValues;

export const EMPTY_DETAILS: DetailsValues = {
  name: '',
  email: '',
  phone: '',
  age: '',
  street: '',
  city: '',
  bikeType: '',
  bikeModel: '',
  notes: '',
  website: '',
};

export type DetailsMode = {
  /** The fit happens at the customer's place, so we need an address. */
  address: boolean;
};

/** "We fitten koers-, gravel-, mountain-, stads-, toer- en e-bikes." */
export const BIKE_TYPES = [
  'Koersfiets',
  'Gravelfiets',
  'Mountainbike',
  'Stadsfiets',
  'Toerfiets',
  'E-bike',
  'Andere',
] as const;

export const NOTES_MAX = 2000;

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** The server's limit for a phone number (`PUBLIC_BOOKING_LIMITS`). */
const PHONE_MAX = 40;

/** Belgian (or explicitly international) and callable; the same rule as the server. */
function isPhone(value: string): boolean {
  return value.length <= PHONE_MAX && normalizePhone(value) !== null;
}

function isAge(value: string): boolean {
  const age = Number(value);
  return /^\d{1,3}$/.test(value) && age >= 1 && age <= 120;
}

/** The fields in the order they appear, so the first error can take focus. */
export function fieldOrder(mode: DetailsMode): DetailsField[] {
  return [
    'name',
    'email',
    'phone',
    'age',
    ...(mode.address ? (['street', 'city'] as DetailsField[]) : []),
    'bikeType',
    'bikeModel',
    'notes',
  ];
}

export function validateDetails(
  raw: DetailsValues,
  mode: DetailsMode,
): Partial<Record<DetailsField, string>> {
  const v = trimmed(raw);
  const errors: Partial<Record<DetailsField, string>> = {};

  const email = (field: DetailsField, value: string) => {
    if (!value) errors[field] = 'Vul je e-mailadres in.';
    else if (!EMAIL.test(value)) errors[field] = 'Dit e-mailadres lijkt niet te kloppen.';
  };
  const phone = (field: DetailsField, value: string) => {
    // "+32 " alone is the prefix the field starts with, not a number.
    if (isBarePrefix(value)) errors[field] = 'Vul je telefoonnummer in.';
    else if (!isPhone(value)) errors[field] = 'Dit telefoonnummer lijkt niet te kloppen.';
  };

  if (!v.name) errors.name = 'Vul je voornaam en naam in.';
  email('email', v.email);
  phone('phone', v.phone);
  if (v.age && !isAge(v.age)) errors.age = 'Vul een leeftijd tussen 1 en 120 in, of laat het leeg.';

  if (mode.address) {
    if (!v.street) errors.street = 'Vul de straat en het huisnummer in.';
    if (!v.city) errors.city = 'Vul de postcode en gemeente in.';
  }

  if (v.notes.length > NOTES_MAX) {
    errors.notes = `Houd het kort: maximaal ${NOTES_MAX} tekens.`;
  }

  return errors;
}

export function toBookInput(
  raw: DetailsValues,
  mode: DetailsMode,
): Omit<BookActionInput, 'serviceId' | 'providerId' | 'locationId' | 'startsAt' | 'addonIds'> {
  const v = trimmed(raw);
  const bikeDetails = [
    v.bikeType ? `Type: ${v.bikeType}` : '',
    v.bikeModel ? `Merk en model: ${v.bikeModel}` : '',
  ]
    .filter(Boolean)
    .join(' · ');

  return {
    name: v.name,
    age: v.age ? Number(v.age) : null,
    email: v.email,
    phone: formatPhoneForInput(v.phone),
    address: mode.address ? [v.street, v.city].filter(Boolean).join(', ') : '',
    bikeDetails,
    notes: v.notes,
    website: raw.website,
  };
}

/** Maps a server-side field error (keyed by `BookActionInput`) back onto a form field. */
export function formFieldFor(inputKey: string): DetailsField | null {
  if (inputKey === 'address') return 'street';
  if (inputKey === 'bikeDetails') return 'bikeModel';
  return inputKey in EMPTY_DETAILS ? (inputKey as DetailsField) : null;
}

function trimmed(values: DetailsValues): DetailsValues {
  const out = { ...values };
  for (const key of Object.keys(out) as DetailsField[]) out[key] = out[key].trim();
  return out;
}
