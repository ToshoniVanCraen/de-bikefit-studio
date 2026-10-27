import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CmsBooking, CmsLocation, CmsProvider, CmsService } from '@/db/cms-schema';
import { computeSlots, type ExistingBooking, type SlotService } from './availability';
import { countEligibleProviders, getAvailability } from './content';
import { DEFAULT_PROVIDER_HOURS } from './defaults';
import { createProviderEvent } from './provider-calendar';
import { createPublicBooking, hashCancelToken } from './public-booking';
import { publicBookingInputSchema, validateBookingFields } from './public-booking-input';
import { DEFAULT_BOOKING_RULES } from './settings';
import { formatTime } from './time';

/**
 * The booking side of the production shape (27 Oct 2026, synthetic data): the
 * lengths production books online (the new-bike fit and its package 2 hours,
 * voetanalyse 30 min, zadelanalyse 1 hour, schoenplaatjes 15 min) through the
 * pure slot engine, and the guardian rule of the package service
 * ("Bikefit – aankoop nieuwe fiets – Jeugd – volledig pakket", `requiresGuardian`,
 * as `cms:patch-aanbod-correcties` creates it; pinned in
 * `offers/offer-catalogue-direct.test.ts`) through the field rules and
 * `createPublicBooking()`. No database: `@/db/cms` is a fake that answers each
 * awaited query from a queue; the live availability, the calendar, the mails and
 * the audit are replaced (their own tests and self-test 14 cover them).
 */

const fake = vi.hoisted(() => {
  const state: { results: unknown[][]; awaited: number; inserted: unknown[] } = {
    results: [],
    awaited: 0,
    inserted: [],
  };
  const query: Record<string, unknown> = {
    then: (
      onFulfilled?: ((value: never) => unknown) | null,
      onRejected?: ((reason: unknown) => unknown) | null,
    ) => {
      state.awaited += 1;
      const rows = state.results.shift();
      const settled: Promise<never> = rows
        ? Promise.resolve(rows as never)
        : Promise.reject(new Error('unexpected query'));
      return settled.then(onFulfilled, onRejected);
    },
    values: (values: unknown) => {
      state.inserted.push(values);
      return query;
    },
  };
  for (const step of ['from', 'where', 'limit', 'set', 'returning', 'onConflictDoUpdate']) {
    query[step] = () => query;
  }
  const db = { select: () => query, insert: () => query, update: () => query, delete: () => query };
  return { state, db };
});

vi.mock('@/db/cms', () => ({ getCmsDb: async () => fake.db }));
vi.mock('@/lib/cms/content', async () => {
  const { defaultSiteSettings } = await import('@/lib/cms/site-settings');
  return { CMS_TAGS: { all: 'cms' }, getSiteSettings: vi.fn(async () => defaultSiteSettings()) };
});
vi.mock('@/lib/booking/content', () => ({
  getAvailability: vi.fn(),
  countEligibleProviders: vi.fn(async () => 1),
}));
vi.mock('@/lib/booking/provider-calendar', () => ({
  createProviderEvent: vi.fn(async () => ({ status: 'none', eventId: null, error: null })),
  cancelProviderEvent: vi.fn(),
}));
vi.mock('@/lib/booking/notifications', () => ({
  cancelUrlFor: (token: string) => `https://studio.invalid/afspraak/annuleren/${token}`,
  loadBookingContext: vi.fn(async () => null),
  sendBookingCreatedEmails: vi.fn(async () => ({
    customer: { sent: false, reason: 'not_configured' },
    provider: { sent: false, reason: 'not_configured' },
  })),
  sendBookingCancelledEmails: vi.fn(),
}));
vi.mock('@/lib/cms/auth', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/cms/auth')>()),
  recordAudit: vi.fn(async () => undefined),
}));

// ---------------------------------------------------------------------------
// The slot engine with production's lengths
// ---------------------------------------------------------------------------

/** Tuesday 27 Oct 2026, 11:00 in Brussels; 3 and 7 Nov are in winter time (UTC+1). */
const NOW = new Date('2026-10-27T10:00:00.000Z');
const TUESDAY = '2026-11-03';
const SATURDAY = '2026-11-07';
const FITTER_ID = 'prov-2';
const STUDIO_ID = 'loc-studio';

/** Every service of the patch keeps the 15-minute buffer of the Jeugd service it copies. */
const LENGTHS: Record<string, SlotService> = {
  package: { durationMinutes: 120, bufferAfterMinutes: 15 },
  voetanalyse: { durationMinutes: 30, bufferAfterMinutes: 15 },
  zadelanalyse: { durationMinutes: 60, bufferAfterMinutes: 15 },
  schoenplaatjes: { durationMinutes: 15, bufferAfterMinutes: 15 },
};

function slots(service: SlotService, date = TUESDAY, bookings: ExistingBooking[] = []) {
  return computeSlots({
    date,
    hours: DEFAULT_PROVIDER_HOURS,
    bookings,
    service,
    rules: DEFAULT_BOOKING_RULES,
    now: NOW,
    providerId: FITTER_ID,
    defaultLocationId: STUDIO_ID,
  });
}
/** "09:00–11:00" in Brussels. */
const local = (list: ReturnType<typeof slots>) =>
  list.map((slot) => `${formatTime(slot.startsAt)}–${formatTime(slot.endsAt)}`);
const minutesOf = (list: ReturnType<typeof slots>) => [
  ...new Set(list.map((s) => (Date.parse(s.endsAt) - Date.parse(s.startsAt)) / 60_000)),
];
const starts = (list: ReturnType<typeof slots>) => list.map((slot) => formatTime(slot.startsAt));

describe('availability for the lengths production books (30-minute grid, Mon–Fri 09:00–18:00)', () => {
  it('every slot is exactly the service’s length, on the grid, inside the hours, at the studio', () => {
    const pkg = slots(LENGTHS.package);
    expect(minutesOf(pkg)).toEqual([120]);
    expect(pkg).toHaveLength(15);
    expect(local(pkg).slice(0, 2)).toEqual(['09:00–11:00', '09:30–11:30']);
    expect(local(pkg).at(-1)).toBe('16:00–18:00');
    expect(pkg[0]).toEqual({
      startsAt: '2026-11-03T08:00:00.000Z',
      endsAt: '2026-11-03T10:00:00.000Z',
      providerId: FITTER_ID,
      locationId: STUDIO_ID,
    });
    expect(
      ['voetanalyse', 'zadelanalyse', 'schoenplaatjes'].map((name) => {
        const list = slots(LENGTHS[name]);
        return [name, minutesOf(list), list.length, local(list)[0], local(list).at(-1)];
      }),
    ).toEqual([
      ['voetanalyse', [30], 18, '09:00–09:30', '17:30–18:00'],
      ['zadelanalyse', [60], 17, '09:00–10:00', '17:00–18:00'],
      // A 15-minute fit still starts on the half hour: 17:45 is not on the grid.
      ['schoenplaatjes', [15], 18, '09:00–09:15', '17:30–17:45'],
    ]);
  });

  it('Saturday 09:00–13:00: the last 2-hour fit starts at 11:00, with a second bike (+30 min) at 10:30', () => {
    expect(local(slots(LENGTHS.package, SATURDAY))).toEqual([
      '09:00–11:00',
      '09:30–11:30',
      '10:00–12:00',
      '10:30–12:30',
      '11:00–13:00',
    ]);
    // What `getAvailability({ extraMinutes })` asks the engine for "Zelfde type fiets".
    const withSecondBike = { ...LENGTHS.package, durationMinutes: 120 + 30 };
    expect(local(slots(withSecondBike, SATURDAY)).at(-1)).toBe('10:30–13:00');
    expect(local(slots(withSecondBike)).at(-1)).toBe('15:30–18:00');
  });

  it('a booked package (10:00–12:00, then its 15-minute buffer) blocks per length', () => {
    const booked: ExistingBooking[] = [
      {
        startsAt: '2026-11-03T09:00:00.000Z',
        endsAt: '2026-11-03T11:00:00.000Z',
        bufferAfterMinutes: 15,
        status: 'confirmed',
      },
    ];
    const around = (service: SlotService) =>
      starts(slots(service, TUESDAY, booked)).filter((time) => time < '13:00');
    // Each new fit needs its own length plus buffer free before 10:00, and starts after 12:15.
    expect(around(LENGTHS.package)).toEqual(['12:30']);
    expect(around(LENGTHS.zadelanalyse)).toEqual(['12:30']);
    expect(around(LENGTHS.voetanalyse)).toEqual(['09:00', '12:30']);
    expect(around(LENGTHS.schoenplaatjes)).toEqual(['09:00', '09:30', '12:30']);
    // A cancelled booking blocks nothing.
    expect(slots(LENGTHS.package, TUESDAY, [{ ...booked[0], status: 'cancelled' }])).toHaveLength(
      15,
    );
  });
});

// ---------------------------------------------------------------------------
// The package service needs a parent or guardian
// ---------------------------------------------------------------------------

const CREATED = new Date('2026-10-27T12:00:00.000Z');
const PACKAGE_ROW: CmsService = {
  id: 'svc-bikefit-nieuwe-fiets-jeugd-pakket',
  locale: 'nl',
  slug: 'bikefit-nieuwe-fiets-jeugd-pakket',
  name: 'Bikefit – aankoop nieuwe fiets – Jeugd – volledig pakket',
  choiceLabel: 'Jeugd – volledig pakket',
  description: '',
  durationMinutes: 120,
  bufferAfterMinutes: 15,
  priceCents: 27500,
  showPrice: true,
  locationId: null,
  requiresGuardian: true,
  isActive: true,
  sortOrder: 32,
  color: null,
  createdBy: null,
  createdAt: CREATED,
  updatedAt: CREATED,
};
const FITTER_ROW: CmsProvider = {
  id: FITTER_ID,
  userId: 'user-2',
  displayName: 'Fitter Twee',
  bio: '',
  phone: null,
  email: 'fitter@studio.invalid',
  timezone: 'Europe/Brussels',
  defaultLocationId: STUDIO_ID,
  googleCalendarId: null,
  googleRefreshTokenEnc: null,
  googleAccessToken: null,
  googleAccessExpiresAt: null,
  googleEmail: null,
  googleConnectedAt: null,
  googleSyncError: null,
  isActive: true,
  sortOrder: 1,
  createdAt: CREATED,
  updatedAt: CREATED,
};
const STUDIO_ROW: CmsLocation = {
  id: STUDIO_ID,
  name: 'De Bikefit Studio, Ninove',
  kind: 'studio',
  addressLines: ['Halsesteenweg 406 a'],
  postalCode: '9403',
  city: 'Neigem',
  country: 'BE',
  notes: null,
  isDefault: true,
  isActive: true,
  sortOrder: 0,
  createdAt: CREATED,
  updatedAt: CREATED,
};

/** The Jeugd form as the widget sends it (`toBookInput`): the child is fitted, the parent is the contact. */
const PACKAGE_INPUT = {
  serviceId: PACKAGE_ROW.id,
  providerId: FITTER_ID,
  locationId: STUDIO_ID,
  startsAt: '2026-11-03T09:00:00.000Z',
  addonIds: [],
  customerName: 'Lotte Peeters',
  customerEmail: 'Ann.Peeters@Example.test',
  customerPhone: '0470 12 34 56',
  customerAge: 13,
  guardianName: 'Ann Peeters',
  guardianEmail: 'Ann.Peeters@Example.test',
  guardianPhone: '0470 12 34 56',
  customerAddress: '',
  bikeDetails: 'Type: Koersfiets',
  notes: '',
  website: '',
  locale: 'nl',
};
const WITHOUT_GUARDIAN = { ...PACKAGE_INPUT, guardianName: '' };
const GUARDIAN_MESSAGE = 'Vul de naam van een ouder of voogd in.';

describe('a package booking needs a parent or guardian', () => {
  it('the field rules refuse it without a guardian’s name and accept it with one; the rule is the service’s', () => {
    const parse = (input: unknown) => publicBookingInputSchema.parse(input);
    expect(validateBookingFields(parse(WITHOUT_GUARDIAN), { requiresGuardian: true })).toEqual({
      guardianName: GUARDIAN_MESSAGE,
    });
    expect(validateBookingFields(parse(PACKAGE_INPUT), { requiresGuardian: true })).toEqual({});
    // The same form for a service without the rule (Volwassene) passes as it is.
    expect(validateBookingFields(parse(WITHOUT_GUARDIAN), { requiresGuardian: false })).toEqual({});
  });

  describe('through createPublicBooking()', () => {
    beforeEach(() => {
      fake.state.results = [];
      fake.state.awaited = 0;
      fake.state.inserted = [];
      vi.mocked(getAvailability).mockResolvedValue({
        ok: true,
        timezone: 'Europe/Brussels',
        fromYmd: TUESDAY,
        toYmd: TUESDAY,
        slots: slots(LENGTHS.package),
      });
    });
    afterEach(() => {
      vi.clearAllMocks();
    });

    /** Prune, the one e-mail key (the parent is customer and guardian), then the service row. */
    const throughTheService = () => [[], [{ scope: 'booking:email:…' }], [PACKAGE_ROW]];

    it('refuses it once the package row says `requiresGuardian`: no slot is looked at, nothing is stored', async () => {
      fake.state.results = throughTheService();
      const result = await createPublicBooking(WITHOUT_GUARDIAN, { ipAddress: null, now: NOW });
      expect(result).toEqual({
        ok: false,
        code: 'invalid',
        message: 'Controleer de gemarkeerde velden.',
        fieldErrors: { guardianName: GUARDIAN_MESSAGE },
      });
      expect(fake.state.awaited).toBe(3);
      expect(getAvailability).not.toHaveBeenCalled();
      expect(fake.state.inserted.some((row) => 'serviceId' in (row as object))).toBe(false);
    });

    /** The rest of a booking: the provider and location rows, then the inserted booking. */
    function bookingRow(values: Partial<CmsBooking> = {}): CmsBooking {
      return {
        id: '6f1c7a52-2a43-4d5e-9a57-2f1d3c4b5a60',
        serviceId: PACKAGE_ROW.id,
        providerId: FITTER_ID,
        locationId: STUDIO_ID,
        startsAt: new Date('2026-11-03T09:00:00.000Z'),
        endsAt: new Date('2026-11-03T11:00:00.000Z'),
        timezone: 'Europe/Brussels',
        status: 'confirmed',
        customerName: 'Lotte Peeters',
        customerEmail: 'ann.peeters@example.test',
        customerPhone: '+32 470 12 34 56',
        customerAge: 13,
        guardianName: 'Ann Peeters',
        guardianEmail: 'ann.peeters@example.test',
        guardianPhone: '+32 470 12 34 56',
        bikeDetails: 'Type: Koersfiets',
        notes: null,
        customerAddress: null,
        cancelTokenHash: 'stored-hash',
        cancelledAt: null,
        cancelledBy: null,
        googleEventId: null,
        googleSyncStatus: 'pending',
        googleSyncError: null,
        source: 'web',
        assignment: 'assigned',
        assignedAt: null,
        reminderSentAt: null,
        reviewRequestedAt: null,
        createdAt: CREATED,
        updatedAt: CREATED,
        ...values,
      };
    }
    const insertedBooking = () =>
      fake.state.inserted.find((row) => 'serviceId' in (row as object)) as Record<string, unknown>;

    it('books it with the guardian: 2 hours on the slot the engine offers, the parent as contact, assigned to the fitter', async () => {
      fake.state.results = [...throughTheService(), [FITTER_ROW], [STUDIO_ROW], [bookingRow()]];
      const result = await createPublicBooking(PACKAGE_INPUT, { ipAddress: null, now: NOW });
      if (!result.ok) throw new Error(`refused: ${result.code}`);
      expect(insertedBooking()).toMatchObject({
        serviceId: PACKAGE_ROW.id,
        providerId: FITTER_ID,
        locationId: STUDIO_ID,
        startsAt: new Date('2026-11-03T09:00:00.000Z'),
        endsAt: new Date('2026-11-03T11:00:00.000Z'),
        timezone: 'Europe/Brussels',
        status: 'confirmed',
        customerName: 'Lotte Peeters',
        customerEmail: 'ann.peeters@example.test',
        customerPhone: '+32 470 12 34 56',
        customerAge: 13,
        guardianName: 'Ann Peeters',
        guardianEmail: 'ann.peeters@example.test',
        guardianPhone: '+32 470 12 34 56',
        customerAddress: null,
        assignment: 'assigned',
      });
      expect(insertedBooking().cancelTokenHash).toBe(hashCancelToken(result.cancelToken));
      expect(result.booking).toEqual({
        bookingId: '6f1c7a52-2a43-4d5e-9a57-2f1d3c4b5a60',
        serviceName: 'Bikefit – aankoop nieuwe fiets – Jeugd – volledig pakket',
        providerName: 'Fitter Twee',
        assignmentPending: false,
        startsAt: '2026-11-03T09:00:00.000Z',
        endsAt: '2026-11-03T11:00:00.000Z',
        timezone: 'Europe/Brussels',
        locationLabel: 'De Bikefit Studio, Ninove',
        status: 'confirmed',
        addons: [],
      });
      expect(getAvailability).toHaveBeenCalledWith(
        expect.objectContaining({ serviceId: PACKAGE_ROW.id, fromYmd: TUESDAY, extraMinutes: 0 }),
      );
      expect(createProviderEvent).toHaveBeenCalledWith(FITTER_ROW, expect.anything(), {
        tentative: false,
      });
    });

    it('"Iedereen" waits for the beheerder only while more than one fitter offers the package', async () => {
      const everyone = { ...PACKAGE_INPUT, providerId: null };
      // Production after the patch: Toshoni offers nothing, one fitter is eligible.
      fake.state.results = [...throughTheService(), [FITTER_ROW], [STUDIO_ROW], [bookingRow()]];
      expect((await createPublicBooking(everyone, { ipAddress: null, now: NOW })).ok).toBe(true);
      expect(insertedBooking()).toMatchObject({ providerId: FITTER_ID, assignment: 'assigned' });
      // Had a second fitter kept it, the first free one would only hold the slot.
      vi.mocked(countEligibleProviders).mockResolvedValueOnce(2);
      fake.state.inserted = [];
      fake.state.results = [
        ...throughTheService(),
        [FITTER_ROW],
        [STUDIO_ROW],
        [bookingRow({ assignment: 'pending' })],
      ];
      const pending = await createPublicBooking(everyone, { ipAddress: null, now: NOW });
      expect(pending.ok && pending.booking.assignmentPending).toBe(true);
      expect(insertedBooking()).toMatchObject({ assignment: 'pending' });
    });
  });
});
