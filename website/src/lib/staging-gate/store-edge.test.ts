import { describe, expect, it } from 'vitest';
import {
  checkGateDatabase,
  findGateSession,
  touchGateSession,
  type GateSqlExecutor,
} from './store-edge';

type Call = { text: string; params: unknown[] };

function fakeExecutor(rows: Record<string, unknown>[] = []) {
  const calls: Call[] = [];
  const exec: GateSqlExecutor = async (text, params) => {
    calls.push({ text, params });
    return rows;
  };
  return { exec, calls };
}

const squash = (sql: string) => sql.replace(/\s+/g, ' ').trim().toLowerCase();

const TAG = 'A'.repeat(43);
const SESSION_ID = '0b9f1c9e-3c1a-4a51-9d5e-8f3a2b1c0d4e';
const ACCOUNT_ID = '5d2c7a10-1e2f-4b3c-8d4e-6f7a8b9c0d1e';

describe('findGateSession', () => {
  it('looks up by token_hash only, parameterised, joined with the account', async () => {
    const { exec, calls } = fakeExecutor([]);
    await findGateSession(exec, TAG);
    expect(calls).toHaveLength(1);
    const text = squash(calls[0].text);
    expect(calls[0].params).toEqual([TAG]);
    expect(text).toContain('from cms_staging_gate_sessions');
    expect(text).toContain('join cms_staging_gate_accounts');
    expect(text).toContain('where s.token_hash = $1');
    expect(text).not.toContain(TAG.toLowerCase());
  });

  it('returns null when there is no row', async () => {
    const { exec } = fakeExecutor([]);
    await expect(findGateSession(exec, TAG)).resolves.toBeNull();
  });

  it('maps string timestamps (Postgres text and ISO) to Dates', async () => {
    const { exec } = fakeExecutor([
      {
        id: SESSION_ID,
        account_id: ACCOUNT_ID,
        created_at: '2026-10-18 08:00:00.123+00',
        last_used_at: '2026-10-18T09:15:00.000Z',
        revoked_at: null,
        account_revoked_at: null,
      },
    ]);
    const session = await findGateSession(exec, TAG);
    expect(session).toEqual({
      id: SESSION_ID,
      accountId: ACCOUNT_ID,
      createdAt: new Date('2026-10-18T08:00:00.123Z'),
      lastUsedAt: new Date('2026-10-18T09:15:00.000Z'),
      revokedAt: null,
      accountRevokedAt: null,
    });
  });

  it('maps Date timestamps and revocation columns', async () => {
    const created = new Date('2026-10-18T08:00:00Z');
    const revoked = new Date('2026-10-18T10:00:00Z');
    const { exec } = fakeExecutor([
      {
        id: SESSION_ID,
        account_id: ACCOUNT_ID,
        created_at: created,
        last_used_at: created,
        revoked_at: revoked,
        account_revoked_at: '2026-10-18 11:00:00+00',
      },
    ]);
    const session = await findGateSession(exec, TAG);
    expect(session?.createdAt).toEqual(created);
    expect(session?.createdAt).not.toBe(created);
    expect(session?.revokedAt).toEqual(revoked);
    expect(session?.accountRevokedAt).toEqual(new Date('2026-10-18T11:00:00Z'));
  });

  it('throws (fails closed) on an unparseable timestamp or a missing id', async () => {
    const bad = fakeExecutor([
      { id: SESSION_ID, account_id: ACCOUNT_ID, created_at: 'garbage', last_used_at: null },
    ]);
    await expect(findGateSession(bad.exec, TAG)).rejects.toThrow(/created_at/);
    const noId = fakeExecutor([
      { id: null, account_id: ACCOUNT_ID, created_at: new Date(), last_used_at: new Date() },
    ]);
    await expect(findGateSession(noId.exec, TAG)).rejects.toThrow(/id/);
  });

  it('propagates executor errors', async () => {
    const exec: GateSqlExecutor = async () => {
      throw new Error('boom');
    };
    await expect(findGateSession(exec, TAG)).rejects.toThrow('boom');
  });
});

describe('touchGateSession', () => {
  it('moves last_used_at forward only, never on a revoked row', async () => {
    const { exec, calls } = fakeExecutor([]);
    const now = new Date('2026-10-18T09:30:00.000Z');
    await touchGateSession(exec, SESSION_ID, now);
    expect(calls).toHaveLength(1);
    const text = squash(calls[0].text);
    expect(text).toMatch(/^update cms_staging_gate_sessions set last_used_at = \$2/);
    expect(text).toContain('id = $1');
    expect(text).toContain('revoked_at is null');
    expect(text).toMatch(/last_used_at < \$2/);
    expect(calls[0].params).toEqual([SESSION_ID, '2026-10-18T09:30:00.000Z']);
  });
});

describe('checkGateDatabase', () => {
  it('is true only after the gate accounts, sessions and rate-limit tables can be queried', async () => {
    const { exec, calls } = fakeExecutor([]);
    await expect(checkGateDatabase(exec)).resolves.toBe(true);
    const sql = squash(calls[0].text);
    expect(sql).toContain('cms_staging_gate_accounts');
    expect(sql).toContain('cms_staging_gate_sessions');
    expect(sql).toContain('cms_rate_limits');
    expect(sql).toContain('s.account_id');
    expect(sql).toContain('r.hits');
    expect(sql).toContain('r.updated_at');
    expect(sql).toContain('where false');
    expect(calls[0].params).toEqual([]);
  });

  it('is false (never throws) when the executor throws', async () => {
    const exec: GateSqlExecutor = async () => {
      throw new Error('connection refused');
    };
    await expect(checkGateDatabase(exec)).resolves.toBe(false);
  });
});
