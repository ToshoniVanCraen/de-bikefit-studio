import { beforeEach, describe, expect, it, vi } from 'vitest';
import { cmsAuditLog, cmsSiteSettings, type CmsRole, type CmsUserPublic } from '@/db/cms-schema';
import { updateSettingAction } from './settings';
import type { ActionState } from './state';

/**
 * Beheer → Instellingen, called directly as a forged POST would: the guard is
 * the real one in `src/lib/cms/repo.ts` (`settings.update`, admin only), the
 * session lookup and the database are doubles (as in `offerings.test.ts`). The
 * two groups of 27 Oct 2026, `business` and `rules`, are checked against their
 * schema before anything is saved, because `parseSiteSetting()` would reset the
 * whole group to its defaults without a word.
 */

const session = vi.hoisted(() => ({
  readSessionCookie: vi.fn(async (): Promise<string | undefined> => undefined),
  resolveSession: vi.fn(async (): Promise<unknown> => null),
  setSessionCookie: vi.fn(async () => {}),
  clearSessionCookie: vi.fn(async () => {}),
  createSession: vi.fn(async () => {}),
  revokeSession: vi.fn(async () => {}),
  revokeAllUserSessions: vi.fn(async () => {}),
  toPublicUser: vi.fn((user: unknown) => user),
}));

const fake = vi.hoisted(() => {
  const writes: Array<{ kind: string; table: unknown; values?: unknown }> = [];
  const db = {
    select: () => ({ from: () => ({ where: async () => [] }) }),
    insert: (table: unknown) => ({
      values: (values: unknown) => {
        writes.push({ kind: 'insert', table, values });
        const returning = async () => [{ ...(values as object), id: 'row-1' }];
        return Object.assign(Promise.resolve(), {
          returning,
          onConflictDoUpdate: () => Object.assign(Promise.resolve(), { returning }),
        });
      },
    }),
  };
  return { writes, db };
});

vi.mock('@/lib/cms/session', () => session);
vi.mock('@/lib/cms/mfa/challenge', () => ({
  clearChallengeCookie: vi.fn(),
  createMfaChallenge: vi.fn(),
  deleteMfaChallenge: vi.fn(),
  readChallengeCookie: vi.fn(),
  resolveMfaChallenge: vi.fn(),
  setChallengeCookie: vi.fn(),
}));
vi.mock('@/lib/cms/mfa/repo', () => ({
  clearMfaAttempts: vi.fn(async () => {}),
  hasConfirmedFactor: vi.fn(async () => false),
}));
vi.mock('@/db/cms', () => ({ getCmsDb: async () => fake.db }));
vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
  revalidateTag: vi.fn(),
  updateTag: vi.fn(),
  unstable_cache: (fn: unknown) => fn,
}));

const FORBIDDEN = 'Je hebt geen toestemming voor deze actie.';
const IDLE: ActionState = { ok: null, message: '' };

function cmsUser(role: CmsRole): CmsUserPublic {
  const at = new Date('2026-10-27T08:00:00Z');
  return {
    id: `user-${role}`,
    email: `${role}@example.com`,
    name: role,
    role,
    mustChangePassword: false,
    isActive: true,
    createdAt: at,
    updatedAt: at,
    lastLoginAt: null,
  };
}

function signIn(user: CmsUserPublic) {
  session.readSessionCookie.mockResolvedValue('cookie-token');
  session.resolveSession.mockResolvedValue({
    user,
    sessionId: 'session-1',
    mfaVerified: true,
    reauthenticatedAt: new Date(),
    absoluteExpiresAt: null,
    expiresAt: new Date(),
    cookieExpiresAt: new Date(),
    renewed: false,
  });
}

function form(fields: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.append(key, value);
  return data;
}

const BUSINESS = {
  key: 'business',
  locale: 'nl',
  legalName: ' Qarakter BV ',
  seatAddressLines: 'Weversstraat 7\n  \nBus 2',
  seatPostalCode: '1730',
  seatCity: 'Asse',
  seatCountry: 'be',
  enterpriseNumber: 'BE 1036.912.281',
  vatNumber: 'BE 1036.912.281',
};

const RULES = {
  key: 'rules',
  locale: 'nl',
  followUpMonthsAdult: '6',
  secondVisitFreeMonths: '6',
  voucherValidityMonths: '12',
};

const settingWrites = () => fake.writes.filter((write) => write.table === cmsSiteSettings);

beforeEach(() => {
  vi.clearAllMocks();
  fake.writes.length = 0;
});

describe('updateSettingAction: who may change the masters', () => {
  it('an editor is refused before anything is written; so is a signed-out request', async () => {
    signIn(cmsUser('editor'));
    expect(await updateSettingAction(IDLE, form(BUSINESS))).toEqual({
      ok: false,
      message: FORBIDDEN,
    });
    expect(await updateSettingAction(IDLE, form(RULES))).toEqual({ ok: false, message: FORBIDDEN });
    session.resolveSession.mockResolvedValue(null);
    expect((await updateSettingAction(IDLE, form(RULES))).ok).toBe(false);
    expect(fake.writes).toEqual([]);
  });
});

describe('updateSettingAction: Bedrijfsgegevens', () => {
  beforeEach(() => signIn(cmsUser('admin')));

  it('saves the legal identity: trimmed, one address line per line, the country in capitals', async () => {
    expect(await updateSettingAction(IDLE, form(BUSINESS))).toEqual({
      ok: true,
      message: 'Instellingen opgeslagen.',
    });
    expect(settingWrites()).toHaveLength(1);
    expect(settingWrites()[0].values).toMatchObject({
      locale: 'nl',
      key: 'business',
      value: {
        legalName: 'Qarakter BV',
        seatAddressLines: ['Weversstraat 7', 'Bus 2'],
        seatPostalCode: '1730',
        seatCity: 'Asse',
        seatCountry: 'BE',
        enterpriseNumber: 'BE 1036.912.281',
        vatNumber: 'BE 1036.912.281',
      },
    });
    expect(
      fake.writes
        .filter((write) => write.table === cmsAuditLog)
        .map((write) => (write.values as { action: string }).action),
    ).toEqual(['settings.update']);
  });

  it('refuses a value the schema refuses, with the field named, instead of resetting the group', async () => {
    const tooLong = await updateSettingAction(
      IDLE,
      form({ ...BUSINESS, legalName: 'x'.repeat(121) }),
    );
    expect(tooLong).toEqual({
      ok: false,
      message: 'Juridische naam: De naam is te lang (max. 120 tekens).',
    });
    const country = await updateSettingAction(IDLE, form({ ...BUSINESS, seatCountry: 'BEL' }));
    expect(country.message).toBe('Land: Gebruik een landcode van 2 letters, bv. BE.');
    const lines = await updateSettingAction(
      IDLE,
      form({ ...BUSINESS, seatAddressLines: 'a\nb\nc\nd\ne' }),
    );
    expect(lines.message).toBe('Adresregels: Maximaal 4 adresregels.');
    expect(fake.writes).toEqual([]);
  });

  it('the organization form no longer carries the legal name or the VAT number', async () => {
    await updateSettingAction(
      IDLE,
      form({
        key: 'organization',
        locale: 'nl',
        type: 'LocalBusiness',
        legalName: 'De Bikefit Studio',
        vatNumber: 'BE 0',
        sameAs: '',
        priceRange: '',
        areaServed: 'Ninove',
      }),
    );
    const value = settingWrites()[0].values as { value: Record<string, unknown> };
    expect(value.value).not.toHaveProperty('legalName');
    expect(value.value).not.toHaveProperty('vatNumber');
    expect(value.value).toMatchObject({ type: 'LocalBusiness', areaServed: ['Ninove'] });
  });
});

describe('updateSettingAction: Regels', () => {
  beforeEach(() => signIn(cmsUser('admin')));

  it('saves the three lengths in months', async () => {
    const result = await updateSettingAction(
      IDLE,
      form({ ...RULES, followUpMonthsAdult: '9', voucherValidityMonths: '24' }),
    );
    expect(result.ok).toBe(true);
    expect(settingWrites()[0].values).toMatchObject({
      key: 'rules',
      value: {
        followUpMonthsAdult: 9,
        secondVisitFreeMonths: 6,
        voucherValidityMonths: 24,
      },
    });
  });

  it('an empty field is the default', async () => {
    await updateSettingAction(IDLE, form({ ...RULES, secondVisitFreeMonths: '' }));
    expect(settingWrites()[0].values).toMatchObject({ value: { secondVisitFreeMonths: 6 } });
  });

  it.each([
    ['0', 'Probleemopvolging volwassene: Minstens 1 maand.'],
    ['61', 'Probleemopvolging volwassene: Maximaal 60 maanden.'],
    ['6,5', 'Probleemopvolging volwassene: Geef een geheel aantal maanden.'],
    ['zes', 'Probleemopvolging volwassene: Geef een geheel aantal maanden.'],
  ])('refuses %s with a Dutch message that names the field', async (months, message) => {
    const result = await updateSettingAction(IDLE, form({ ...RULES, followUpMonthsAdult: months }));
    expect(result).toEqual({ ok: false, message });
    expect(fake.writes).toEqual([]);
  });
});
