import { createServer, Socket } from 'node:net';
import { TLSSocket } from 'node:tls';
import { describe, expect, it } from 'vitest';
import {
  deriveRoleUrl,
  parseDirectTarget,
  requirePlusOffer,
  StrictPlusClient,
} from './cms-writer-freeze-direct.mjs';

const host = 'ep-proof-branch.eu-central-1.aws.neon.tech';
const url = `postgresql://freeze_installer:secret@${host}/proofdb?sslmode=require&channel_binding=require`;
const target = { host, database: 'proofdb', user: 'freeze_installer', password: 'secret' };

function verifiedSocket(): TLSSocket {
  const socket = new TLSSocket(new Socket());
  Object.defineProperty(socket, 'authorized', { value: true, configurable: true });
  Object.defineProperty(socket, 'encrypted', { value: true });
  Object.defineProperty(socket, 'getPeerCertificate', {
    value: () => ({ raw: Buffer.from('fake-cert') }),
  });
  return socket;
}

describe('strict direct channel binding', () => {
  it('parses only the pinned two-parameter direct URL into explicit pg fields', () => {
    expect(parseDirectTarget(url, host, 'proofdb', 'freeze_installer')).toEqual(target);
    for (const bad of [
      url.replace(host, 'ep-other.eu-central-1.aws.neon.tech'),
      url.replace('proofdb', 'staging'),
      url.replace('freeze_installer:', 'other:'),
      url.replace('sslmode=require', 'sslmode=disable'),
      url.replace('channel_binding=require', 'channel_binding=prefer'),
      url.replace('&channel_binding=require', ''),
      url + '&channel_binding=require',
      url + '&sslmode=disable',
      url + '&options=-csearch_path=public',
      url.replace('/proofdb', ':5433/proofdb'),
      url.replace(host, 'ep-proof-branch-pooler.eu-central-1.aws.neon.tech'),
    ])
      expect(() => parseDirectTarget(bad, host, 'proofdb', 'freeze_installer')).toThrow();
  });

  it('round-trips percent-containing proof passwords without decoding their literal percent', () => {
    for (const password of ['abc%2Fdef' + 'x'.repeat(24), 'abc%def' + 'y'.repeat(26)]) {
      const derived = deriveRoleUrl(url, host, 'proofdb', 'freeze_app', password);
      expect(parseDirectTarget(derived, host, 'proofdb', 'freeze_app').password).toBe(password);
      expect(new URL(derived).password).toContain('%25');
    }
  });

  it('rejects MD5 authentication and closes the socket on a failed connect', async () => {
    let peer: Socket | undefined;
    let closed!: () => void;
    const peerClosed = new Promise<void>((resolve) => {
      closed = resolve;
    });
    const server = createServer((socket) => {
      peer = socket;
      socket.on('close', closed);
      socket.once('data', () => {
        // AuthenticationMD5Password: R, length 12, type 5, four salt bytes.
        const packet = Buffer.alloc(13);
        packet.write('R', 0);
        packet.writeInt32BE(12, 1);
        packet.writeInt32BE(5, 5);
        packet.set([1, 2, 3, 4], 9);
        socket.write(packet);
      });
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('No local test port');
    const client = new StrictPlusClient({ ...target, host: '127.0.0.1' });
    // Local wire fixture only: start without TLS to reach the MD5-rejection hook.
    (client as unknown as { port: number; ssl: boolean }).port = address.port;
    (client.connection as unknown as { ssl: boolean }).ssl = false;
    (client as unknown as { ssl: boolean }).ssl = false;
    let passwordSent = false;
    (client.connection as unknown as { password: (value: string) => void }).password = () => {
      passwordSent = true;
    };
    const promptly = <T>(promise: Promise<T>) =>
      Promise.race([
        promise,
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('socket did not close promptly')), 1000),
        ),
      ]);
    try {
      await expect(promptly(client.connectStrict())).rejects.toThrow(
        'Strict PostgreSQL TLS/SCRAM-PLUS connection failed',
      );
      await promptly(peerClosed);
      expect(passwordSent).toBe(false);
    } finally {
      peer?.destroy();
      server.close();
    }
  });

  it('requires verified PostgreSQL TLS and a PLUS offer before any password proof', () => {
    const socket = verifiedSocket();
    expect(() => requirePlusOffer(['SCRAM-SHA-256-PLUS', 'SCRAM-SHA-256'], socket)).not.toThrow();
    expect(() => requirePlusOffer(['SCRAM-SHA-256'], socket)).toThrow(/PLUS/);
    expect(() => requirePlusOffer(['SCRAM-SHA-256-PLUS'], new Socket())).toThrow(/TLS/);
    Object.defineProperty(socket, 'authorized', { value: false, configurable: true });
    expect(() => requirePlusOffer(['SCRAM-SHA-256-PLUS'], socket)).toThrow(/TLS/);
  });

  it('keeps the outbound mechanism guard and accepts a completed PLUS final exchange', () => {
    const client = new StrictPlusClient(target);
    const errors: unknown[] = [];
    client.connection.on('error', (error) => errors.push(error));
    const connection = client.connection as unknown as {
      stream: unknown;
      _send: (buffer: Buffer) => boolean;
      sendSASLInitialResponseMessage: (mechanism: string, response: string) => void;
      sendSCRAMClientFinalMessage: (response: string) => void;
    };
    connection.stream = verifiedSocket();
    let sends = 0;
    connection._send = () => {
      sends++;
      return true;
    };
    expect(() => connection.sendSASLInitialResponseMessage('SCRAM-SHA-256', 'x')).toThrow(
      /downgrade/,
    );
    client._handleAuthSASL({ mechanisms: ['SCRAM-SHA-256-PLUS', 'SCRAM-SHA-256'] });
    expect(
      (client as unknown as { saslSession: { mechanism: string } }).saslSession.mechanism,
    ).toBe('SCRAM-SHA-256-PLUS');
    expect(sends).toBe(1);
    (client as unknown as { saslSession: { mechanism: string } }).saslSession.mechanism =
      'SCRAM-SHA-256';
    expect(() => connection.sendSCRAMClientFinalMessage('proof')).toThrow(/downgrade/);
    expect(sends).toBe(1);
    expect(() => client.assertBound()).toThrow(/not completed/);
    (client as unknown as { saslSession: unknown }).saslSession = {
      mechanism: 'SCRAM-SHA-256-PLUS',
      message: 'SASLResponse',
      serverSignature: 'YWJj',
    };
    client._handleAuthSASLFinal({ data: 'v=YWJj' });
    expect(errors).toHaveLength(0);
    expect(() => client.assertBound()).not.toThrow();
  });

  it('refuses non-PLUS SASL, MD5 and cleartext without sending a password message', () => {
    const client = new StrictPlusClient(target);
    const errors: unknown[] = [];
    const connection = client.connection as unknown as {
      stream: unknown;
      sendSASLInitialResponseMessage: (mechanism: string, response: string) => void;
      password: (password: string) => void;
    };
    (
      client.connection as unknown as {
        on: (event: string, listener: (error: unknown) => void) => void;
      }
    ).on('error', (error) => errors.push(error));
    connection.stream = verifiedSocket();
    let sends = 0;
    connection.sendSASLInitialResponseMessage = () => {
      sends++;
    };
    connection.password = () => {
      sends++;
    };
    client._handleAuthSASL({ mechanisms: ['SCRAM-SHA-256'] });
    client._handleAuthMD5Password();
    client._handleAuthCleartextPassword();
    expect(errors).toHaveLength(3);
    expect(sends).toBe(0);
    expect(() => client.assertBound()).toThrow(/not completed/);
  });
});
