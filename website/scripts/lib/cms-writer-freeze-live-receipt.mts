/** Offline, reviewer-hashed operational hold receipt. References are claims, not evidence verification. */
import { createHash } from 'node:crypto';
import { validateLivePins, type LivePins } from './cms-writer-freeze-live.mjs';
import { FREEZE_ACTIONS, type FreezeAction } from './cms-writer-freeze-sql.mjs';

export type LiveWriteAction = 'setup' | FreezeAction;
const HEX = /^[0-9a-f]{64}$/;
const ID = /^[a-z][a-z0-9._-]{1,63}$/;
const REF = /^[a-z0-9][a-z0-9._/-]{2,199}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Live operational hold receipt invalid');
  return value as Record<string, unknown>;
}
function exactKeys(value: Record<string, unknown>, names: string[]): void {
  const actual = Object.keys(value).sort();
  if (actual.length !== names.length || actual.some((key, i) => key !== [...names].sort()[i]))
    throw new Error('Live operational hold receipt invalid');
}
function evidence(value: unknown): void {
  const item = record(value);
  exactKeys(item, ['ref', 'sha256']);
  if (
    typeof item.ref !== 'string' ||
    !REF.test(item.ref) ||
    item.ref.includes('..') ||
    typeof item.sha256 !== 'string' ||
    !HEX.test(item.sha256)
  )
    throw new Error('Live operational hold evidence reference invalid');
}

export function validateOperationalHoldReceipt(
  raw: string,
  expectedHash: string,
  pins: LivePins,
  action: LiveWriteAction,
  sqlHash: string,
  now = Date.now(),
): void {
  validateLivePins(pins);
  if (!HEX.test(expectedHash) || createHash('sha256').update(raw).digest('hex') !== expectedHash)
    throw new Error('Live operational hold receipt SHA-256 mismatch');
  if (!HEX.test(sqlHash) || !['setup', ...FREEZE_ACTIONS].includes(action))
    throw new Error('Live operational hold action or SQL digest invalid');
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error('Live operational hold receipt invalid');
  }
  const receipt = record(parsed);
  exactKeys(receipt, [
    'schema',
    'gate',
    'decision',
    'receiptId',
    'issuedAt',
    'expiresAt',
    'action',
    'sqlSha256',
    'target',
    'operator',
    'reviewer',
    'evidence',
  ]);
  if (
    receipt.schema !== 'cms-writer-freeze-live-hold/v1' ||
    receipt.gate !== 'Gate 1' ||
    receipt.decision !== 'GO' ||
    typeof receipt.receiptId !== 'string' ||
    !UUID.test(receipt.receiptId) ||
    receipt.action !== action ||
    receipt.sqlSha256 !== sqlHash ||
    typeof receipt.operator !== 'string' ||
    !ID.test(receipt.operator) ||
    typeof receipt.reviewer !== 'string' ||
    !ID.test(receipt.reviewer) ||
    receipt.operator === receipt.reviewer
  )
    throw new Error('Live operational hold receipt identity/action mismatch');
  const target = record(receipt.target);
  const pinKeys = [
    'environment',
    'purpose',
    'projectId',
    'branchId',
    'branchName',
    'endpointId',
    'host',
    'database',
    'installer',
  ];
  exactKeys(target, pinKeys);
  if (pinKeys.some((key) => target[key] !== pins[key as keyof LivePins]))
    throw new Error('Live operational hold target mismatch');
  if (
    typeof receipt.issuedAt !== 'string' ||
    !ISO.test(receipt.issuedAt) ||
    typeof receipt.expiresAt !== 'string' ||
    !ISO.test(receipt.expiresAt)
  )
    throw new Error('Live operational hold timestamps invalid');
  const issued = Date.parse(receipt.issuedAt);
  const expires = Date.parse(receipt.expiresAt);
  if (
    !Number.isFinite(issued) ||
    !Number.isFinite(expires) ||
    new Date(issued).toISOString() !== receipt.issuedAt ||
    new Date(expires).toISOString() !== receipt.expiresAt ||
    issued > now + 30_000 ||
    now - issued > 5 * 60_000 ||
    expires <= now ||
    expires > issued + 15 * 60_000
  )
    throw new Error('Live operational hold receipt stale or expired');
  const refs = record(receipt.evidence);
  const evidenceKeys = ['ingressZeroInvocation', 'egressProviderCronDrain', 'snapshotRestore'];
  if (action === 'install') evidenceKeys.push('oldOwnerCredentialRetirement');
  exactKeys(refs, evidenceKeys);
  for (const key of evidenceKeys) evidence(refs[key]);
}
