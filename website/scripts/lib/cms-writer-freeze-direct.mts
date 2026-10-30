/** Native PostgreSQL transport for the disposable proof. The installed pg version is pinned:
 * its SASL handler prefers PLUS but permits a downgrade unless we reject the offer first. */
import { TLSSocket } from 'node:tls';
import { Client, type ClientConfig } from 'pg';

export type DirectTarget = { host: string; database: string; user: string; password: string };

export function parseDirectTarget(
  connectionString: string,
  expectedHost: string,
  expectedDatabase: string,
  installer: string,
): DirectTarget {
  if (
    !/^[a-z_][a-z0-9_]{0,62}$/.test(expectedDatabase) ||
    !/^[a-z_][a-z0-9_]{0,62}$/.test(installer)
  )
    throw new Error('Expected database and installer must be exact PostgreSQL names');
  if (
    !/^ep-[a-z0-9-]+\.[a-z0-9-]+\.(?:aws|azure)\.neon\.tech$/.test(expectedHost) ||
    expectedHost.split('.')[0].endsWith('-pooler')
  )
    throw new Error('Expected host must be an exact non-pooler Neon endpoint');
  let url: URL;
  try {
    url = new URL(connectionString);
  } catch {
    throw new Error('DATABASE_URL is not a valid PostgreSQL URL');
  }
  let user: string, password: string, database: string;
  try {
    user = decodeURIComponent(url.username);
    password = decodeURIComponent(url.password);
    database = decodeURIComponent(url.pathname.slice(1));
  } catch {
    throw new Error('DATABASE_URL has invalid encoded connection fields');
  }
  const params = [...url.searchParams.entries()];
  if (
    !['postgres:', 'postgresql:'].includes(url.protocol) ||
    url.hostname !== expectedHost ||
    (url.port && url.port !== '5432') ||
    url.hash ||
    user !== installer ||
    database !== expectedDatabase ||
    !password ||
    password.includes('\0') ||
    params.length !== 2 ||
    url.searchParams.getAll('sslmode').length !== 1 ||
    url.searchParams.getAll('channel_binding').length !== 1 ||
    url.searchParams.get('sslmode') !== 'require' ||
    url.searchParams.get('channel_binding') !== 'require'
  )
    throw new Error(
      'DATABASE_URL must target the pinned direct Neon host with sslmode=require and channel_binding=require',
    );
  return { host: expectedHost, database: expectedDatabase, user: installer, password };
}

/** URL setters preserve literal percent signs; encode before setting a derived role secret. */
export function deriveRoleUrl(
  installerUrl: string,
  expectedHost: string,
  expectedDatabase: string,
  role: string,
  password: string,
): string {
  const url = new URL(installerUrl);
  url.username = role;
  try {
    url.password = encodeURIComponent(password);
  } catch {
    throw new Error('Proof credential cannot be URL-encoded');
  }
  const derived = url.toString();
  if (parseDirectTarget(derived, expectedHost, expectedDatabase, role).password !== password)
    throw new Error('Derived role credential round-trip mismatch');
  return derived;
}

/** Called before pg can select a mechanism or fetch/use the password. */
export function requirePlusOffer(mechanisms: unknown, stream: unknown): void {
  if (
    !(stream instanceof TLSSocket) ||
    !stream.encrypted ||
    stream.authorized !== true ||
    !stream.getPeerCertificate()?.raw
  )
    throw new Error('Verified PostgreSQL TLS is required before authentication');
  if (!Array.isArray(mechanisms) || !mechanisms.includes('SCRAM-SHA-256-PLUS'))
    throw new Error('Server did not offer SCRAM-SHA-256-PLUS; channel binding required');
}

// Private pg hooks are intentionally pinned to pg@8.23.1. Runtime checks reject a changed API.
const pgPrototype = Client.prototype as unknown as Record<string, unknown>;
for (const name of ['_handleAuthSASL', '_handleAuthSASLContinue', '_handleAuthSASLFinal']) {
  if (typeof pgPrototype[name] !== 'function') throw new Error('Pinned pg SASL API unavailable');
}

export class StrictPlusClient extends Client {
  private plusOffered = false;
  private plusFinal = false;

  constructor(target: DirectTarget) {
    const config: ClientConfig & { enableChannelBinding: boolean; sslnegotiation: string } = {
      host: target.host,
      port: 5432,
      database: target.database,
      user: target.user,
      password: target.password,
      ssl: { rejectUnauthorized: true, servername: target.host },
      enableChannelBinding: true,
      sslnegotiation: 'postgres',
      connectionTimeoutMillis: 15_000,
      options: '-c search_path=pg_catalog,pg_temp',
    };
    super(config);
    // Guard the actual outgoing protocol message as well as pg's selection logic.
    const connection = this.connection as unknown as {
      sendSASLInitialResponseMessage: (mechanism: string, response: string) => void;
      sendSCRAMClientFinalMessage: (response: string) => void;
      stream: unknown;
    };
    const sendInitial = connection.sendSASLInitialResponseMessage.bind(connection);
    connection.sendSASLInitialResponseMessage = (mechanism, response) => {
      if (!this.plusOffered || mechanism !== 'SCRAM-SHA-256-PLUS')
        throw new Error('SCRAM-PLUS downgrade refused');
      sendInitial(mechanism, response);
    };
    const sendFinal = connection.sendSCRAMClientFinalMessage.bind(connection);
    connection.sendSCRAMClientFinalMessage = (response) => {
      if (!this.plusOffered || this.saslMechanism() !== 'SCRAM-SHA-256-PLUS')
        throw new Error('SCRAM-PLUS proof downgrade refused');
      sendFinal(response);
    };
  }

  private saslMechanism(): unknown {
    return (this as unknown as { saslSession?: { mechanism?: unknown } }).saslSession?.mechanism;
  }

  private refuseAuthentication(message: string): void {
    try {
      this.connection.emit('error', new Error(message));
    } finally {
      this.connection.stream.destroy();
    }
  }

  /** One fail-closed entry point for every direct proof connection. */
  async connectStrict(): Promise<void> {
    try {
      await this.connect();
      this.assertBound();
    } catch {
      this.connection.stream.destroy();
      throw new Error('Strict PostgreSQL TLS/SCRAM-PLUS connection failed');
    }
  }
  _handleAuthCleartextPassword(): void {
    this.refuseAuthentication('Cleartext password authentication refused');
  }
  _handleAuthMD5Password(): void {
    this.refuseAuthentication('MD5 password authentication refused');
  }
  _handleAuthSASL(msg: { mechanisms?: unknown }): void {
    try {
      requirePlusOffer(msg.mechanisms, this.connection.stream);
    } catch {
      this.refuseAuthentication('Verified TLS and SCRAM-SHA-256-PLUS are required');
      return;
    }
    this.plusOffered = true;
    (pgPrototype._handleAuthSASL as (this: Client, msg: unknown) => void).call(this, msg);
  }
  _handleAuthSASLContinue(msg: unknown): void {
    if (!this.plusOffered || this.saslMechanism() !== 'SCRAM-SHA-256-PLUS') {
      this.refuseAuthentication('SCRAM-PLUS continuation downgrade refused');
      return;
    }
    (pgPrototype._handleAuthSASLContinue as (this: Client, msg: unknown) => void).call(this, msg);
  }
  _handleAuthSASLFinal(msg: unknown): void {
    if (!this.plusOffered || this.saslMechanism() !== 'SCRAM-SHA-256-PLUS') {
      this.refuseAuthentication('SCRAM-PLUS final downgrade refused');
      return;
    }
    (pgPrototype._handleAuthSASLFinal as (this: Client, msg: unknown) => void).call(this, msg);
    this.plusFinal = true;
  }
  assertBound(): void {
    requirePlusOffer(['SCRAM-SHA-256-PLUS'], this.connection.stream);
    if (
      !this.plusOffered ||
      !this.plusFinal ||
      (this as unknown as { saslSession?: unknown }).saslSession !== null
    )
      throw new Error('SCRAM-SHA-256-PLUS authentication not completed');
  }
}

export function createStrictPlusClient(target: DirectTarget): StrictPlusClient {
  return new StrictPlusClient(target);
}
