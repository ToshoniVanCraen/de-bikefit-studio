import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  LIVE_NEON_TARGETS,
  makeLiveFreezeSql,
  makeLiveSetupSql,
  type LivePins,
} from './cms-writer-freeze-live.mjs';
import {
  LiveOperationError,
  runLiveGuardTransaction,
  runLiveSetupTransaction,
  safeLiveError,
  withPinnedLiveClient,
  type LiveSessionClient,
} from './cms-writer-freeze-live-transactions.mjs';

const pins: LivePins = {
  environment: 'staging',
  purpose: 'live-staging-writer-freeze',
  ...LIVE_NEON_TARGETS.staging,
  database: 'neondb',
  installer: 'neondb_owner',
};
const names = {
  app: 'audit_app',
  cli: 'audit_cli',
  owner: 'audit_owner',
  installer: pins.installer,
};
const roles = { ...names, sourceOwner: pins.installer, trustedPlatformRoles: [] };
const passwords = { app: 'app-secret-only-in-parameters', cli: 'cli-secret-only-in-parameters' };
const sha = (s: string) => createHash('sha256').update(s).digest('hex');
const ref = (name: string) => ({ ref: `work-blocks/${name}`, sha256: 'b'.repeat(64) });
function review(sql: string, action: 'setup' | 'install') {
  const now = Date.now();
  const raw = JSON.stringify({
    schema: 'cms-writer-freeze-live-hold/v1',
    gate: 'Gate 1',
    decision: 'GO',
    receiptId: '9a970044-8d6c-44e2-a249-b7355a66fe74',
    issuedAt: new Date(now - 60_000).toISOString(),
    expiresAt: new Date(now + 9 * 60_000).toISOString(),
    action,
    sqlSha256: sha(sql),
    target: pins,
    operator: 'operator.one',
    reviewer: 'reviewer.two',
    evidence: {
      ingressZeroInvocation: ref('ingress'),
      egressProviderCronDrain: ref('drain'),
      snapshotRestore: ref('snapshot'),
      ...(action === 'install' ? { oldOwnerCredentialRetirement: ref('retirement') } : {}),
    },
  });
  return { sql, hash: sha(sql), holdRaw: raw, holdHash: sha(raw), pins };
}
const setupSql = makeLiveSetupSql(names, pins);
const guardSql = makeLiveFreezeSql('install', roles, pins);

class MockClient implements LiveSessionClient {
  calls: Array<{ sql: string; values?: unknown[] }> = [];
  connectCount = 0;
  endCount = 0;
  failAt?: string;
  emitAt?: string;
  endFails = false;
  rollbackFails = false;
  connectFails = false;
  beginAck = 'BEGIN';
  commitAck = 'COMMIT';
  publicAcl = 0;
  identityRole = pins.installer;
  private errorListener?: () => void;
  on(event: 'error', listener: () => void) {
    expect(event).toBe('error');
    this.errorListener = listener;
  }
  async connectStrict() {
    this.connectCount++;
    if (this.connectFails) throw new Error('raw connection password=hidden');
  }
  async end() {
    this.endCount++;
    if (this.endFails) throw new Error('raw teardown password=hidden');
  }
  async query(sql: string, values?: unknown[]): Promise<unknown> {
    this.calls.push({ sql, values });
    if (this.emitAt === sql) this.errorListener?.();
    if (this.failAt === sql || (sql === 'ROLLBACK' && this.rollbackFails))
      throw new Error('raw driver password=hidden');
    if (sql === setupSql) return { command: 'DO' };
    if (sql === guardSql) return [{ command: 'BEGIN' }, { command: this.commitAck }];
    if (sql.includes('server_version_num'))
      return {
        rows: [
          {
            session_user: this.identityRole,
            current_user: this.identityRole,
            current_database: pins.database,
            server_version_num: '160000',
            backend_pid: 42,
          },
        ],
      };
    if (sql === 'BEGIN') return { command: this.beginAck };
    if (sql.startsWith('SET LOCAL')) return { command: 'SET' };
    if (sql.includes('FROM pg_class c JOIN pg_namespace')) return { rows: [{ n: this.publicAcl }] };
    if (sql.startsWith("SELECT set_config('cms_freeze.app_password'"))
      return { rows: [{ app_set: true, cli_set: true }] };
    if (sql.startsWith('SELECT session_user,current_user,pg_backend_pid()'))
      return { rows: [{ session_user: pins.installer, current_user: pins.installer, pid: 42 }] };
    if (sql === 'COMMIT') return { command: this.commitAck };
    if (sql === 'ROLLBACK') return { command: 'ROLLBACK' };
    throw new Error('unexpected mock SQL');
  }
  count(sql: string) {
    return this.calls.filter((call) => call.sql === sql).length;
  }
}

const setup = (client: MockClient, override: Partial<ReturnType<typeof review>> = {}) =>
  runLiveSetupTransaction(client, {
    ...review(setupSql, 'setup'),
    ...override,
    names,
    passwords,
    pid: 42,
  });
const execute = (client: MockClient, override: Partial<ReturnType<typeof review>> = {}) =>
  runLiveGuardTransaction(client, { ...review(guardSql, 'install'), ...override, pid: 42 });

describe('live SQL transaction acknowledgement and uncertainty', () => {
  it('submits reviewed setup once, injects secrets only as parameters, and requires COMMIT', async () => {
    const client = new MockClient();
    const attest = async () => {
      events.push('attest');
    };
    const events: string[] = [];
    const message = await withPinnedLiveClient(
      client,
      pins.installer,
      pins,
      attest,
      (session, pid) =>
        runLiveSetupTransaction(session, {
          ...review(setupSql, 'setup'),
          names,
          passwords,
          pid,
        }),
    );
    expect(events).toEqual(['attest']);
    expect(client.connectCount).toBe(1);
    expect(client.endCount).toBe(1);
    expect(client.count('BEGIN')).toBe(1);
    expect(client.count(setupSql)).toBe(1);
    expect(client.count('COMMIT')).toBe(1);
    expect(client.count('ROLLBACK')).toBe(0);
    expect(
      client.calls.find((call) =>
        call.sql.startsWith("SELECT set_config('cms_freeze.app_password'"),
      )?.values,
    ).toEqual([passwords.app, passwords.cli]);
    expect(client.calls.map((call) => call.sql).join('\n')).not.toContain(passwords.app);
    expect(message).toContain('COMMIT confirmed');
    expect(message).not.toContain(passwords.app);
  });
  it('refuses missing approval or wrong BEGIN before role SQL, and rolls back failed preflight', async () => {
    const missing = new MockClient();
    await expect(setup(missing, { holdHash: '0'.repeat(64) })).rejects.toThrow('SHA-256');
    expect(missing.calls).toHaveLength(0);
    const noBegin = new MockClient();
    noBegin.beginAck = 'SELECT';
    await expect(setup(noBegin)).rejects.toThrow('preflight failed');
    expect(noBegin.count(setupSql)).toBe(0);
    expect(noBegin.count('ROLLBACK')).toBe(0);
    const acl = new MockClient();
    acl.publicAcl = 1;
    await expect(setup(acl)).rejects.toThrow('preflight failed');
    expect(acl.count(setupSql)).toBe(0);
    expect(acl.count('ROLLBACK')).toBe(1);
  });
  it('rolls back once on setup SQL or COMMIT failure and never retries an uncertain write', async () => {
    for (const failure of ['sql', 'missing-ack', 'transport'] as const) {
      const client = new MockClient();
      if (failure === 'sql') client.failAt = setupSql;
      if (failure === 'missing-ack') client.commitAck = 'SELECT';
      if (failure === 'transport') client.failAt = 'COMMIT';
      await expect(setup(client)).rejects.toThrow('COMMIT uncertain');
      expect(client.count(setupSql)).toBe(1);
      expect(client.count('COMMIT')).toBe(failure === 'sql' ? 0 : 1);
      expect(client.count('ROLLBACK')).toBe(1);
    }
    const rollbackLost = new MockClient();
    rollbackLost.failAt = setupSql;
    rollbackLost.rollbackFails = true;
    await expect(setup(rollbackLost)).rejects.toThrow('COMMIT uncertain');
    expect(rollbackLost.count(setupSql)).toBe(1);
    expect(rollbackLost.count('ROLLBACK')).toBe(1);
  });
  it('submits one generated guard transaction and refuses missing acknowledgement without retry', async () => {
    const good = new MockClient();
    await expect(execute(good)).resolves.toContain('COMMIT confirmed');
    expect(good.count(guardSql)).toBe(1);
    expect(good.count('ROLLBACK')).toBe(0);
    const missing = new MockClient();
    missing.commitAck = 'SELECT';
    await expect(execute(missing)).rejects.toThrow('COMMIT acknowledgement missing');
    expect(missing.count(guardSql)).toBe(1);
    expect(missing.count('ROLLBACK')).toBe(0);
    const thrown = new MockClient();
    thrown.failAt = guardSql;
    await expect(execute(thrown)).rejects.toThrow('outcome uncertain');
    expect(thrown.count(guardSql)).toBe(1);
    expect(thrown.count('ROLLBACK')).toBe(1);
  });
  it('treats connection, identity, error-event and teardown failures as refusal or uncertainty', async () => {
    const noConnect = new MockClient();
    noConnect.connectFails = true;
    await expect(
      withPinnedLiveClient(
        noConnect,
        pins.installer,
        pins,
        async () => {},
        async () => 'unused',
      ),
    ).rejects.toThrow('raw connection');
    expect(noConnect.endCount).toBe(0);
    const wrongRole = new MockClient();
    wrongRole.identityRole = 'wrong_role';
    await expect(
      withPinnedLiveClient(
        wrongRole,
        pins.installer,
        pins,
        async () => {},
        async () => setup(wrongRole),
      ),
    ).rejects.toThrow('session/current user');
    expect(wrongRole.count(setupSql)).toBe(0);
    const transport = new MockClient();
    transport.emitAt = setupSql;
    await expect(
      withPinnedLiveClient(
        transport,
        pins.installer,
        pins,
        async () => {},
        async () => setup(transport),
      ),
    ).rejects.toThrow('outcome uncertain');
    expect(transport.count(setupSql)).toBe(1);
    expect(transport.connectCount).toBe(1);
    const teardown = new MockClient();
    teardown.endFails = true;
    await expect(
      withPinnedLiveClient(
        teardown,
        pins.installer,
        pins,
        async () => {},
        async () => execute(teardown),
      ),
    ).rejects.toThrow('outcome uncertain');
    expect(teardown.count(guardSql)).toBe(1);
    expect(teardown.endCount).toBe(1);
  });
  it('rejects live probe before credentials, control-plane access or SQL', () => {
    const child = spawnSync(
      join(process.cwd(), 'node_modules/.bin/tsx'),
      ['scripts/cms-writer-freeze-live.mts', 'probe'],
      {
        cwd: process.cwd(),
        encoding: 'utf8',
        timeout: 10_000,
        env: {
          ...process.env,
          NEON_API_KEY: 'secret-sentinel',
          DATABASE_URL: 'postgresql://user:secret-sentinel@invalid.example/neondb',
        },
      },
    );
    expect(child.status).toBe(1);
    expect(child.stdout).toBe('');
    expect(child.stderr).toContain('Live probe disabled');
    expect(child.stderr).not.toContain('secret-sentinel');
  });
  it('never exposes raw driver errors or parameters through the CLI error sanitizer', () => {
    expect(safeLiveError(new Error('Live setup password=hidden'))).toBe(
      'Live writer-freeze refused; inspect pinned branch state before any retry',
    );
    expect(safeLiveError(new Error('postgresql://user:secret@example.test'))).not.toContain(
      'secret',
    );
    expect(
      safeLiveError(
        new LiveOperationError(
          'Live setup failed or COMMIT uncertain; inspect branch state, no retry',
        ),
      ),
    ).toContain('COMMIT uncertain');
  });
});
