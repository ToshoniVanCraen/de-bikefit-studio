/**
 * `npm run cms:writer-freeze`: writes one reviewable writer-freeze SQL transaction to a new
 * mode-0600 file and prints its SHA-256. It never connects to a database. Disposable Neon branch
 * proof only (docs/cms-writer-freeze.md, staging-runbook.md §26); the SQL header records the
 * purpose, the role contract and the operator's trusted platform role attestation.
 *
 * Every option is required exactly once. `--trusted-platform-roles` is an exact comma list of
 * provider-managed role names (no patterns) or the literal `none`.
 */
import { createHash } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  FREEZE_ACTIONS,
  FREEZE_PURPOSE,
  makeFreezeSql,
  type FreezeAction,
} from './lib/cms-writer-freeze-sql.mjs';

const USAGE =
  'Usage: npm run cms:writer-freeze -- <install|verify|freeze|unfreeze|uninstall> --purpose disposable-branch-proof --app ROLE --cli ROLE --owner ROLE --installer ROLE --source-owner ROLE --trusted-platform-roles <ROLE[,ROLE...]|none> --out FILE';
const OPTIONS = [
  '--purpose',
  '--app',
  '--cli',
  '--owner',
  '--installer',
  '--source-owner',
  '--trusted-platform-roles',
  '--out',
];

const isAction = (value: string | undefined): value is FreezeAction =>
  FREEZE_ACTIONS.some((action) => action === value);

const args = process.argv.slice(2);
const action = args.shift();
if (!isAction(action)) throw new Error(USAGE);
const values: Record<string, string> = {};
while (args.length) {
  const key = args.shift();
  const value = args.shift();
  if (!key?.startsWith('--') || !value || value.startsWith('--') || key in values)
    throw new Error(`Invalid option: ${key}. ${USAGE}`);
  values[key] = value;
}
if (Object.keys(values).length !== OPTIONS.length || OPTIONS.some((key) => !values[key]))
  throw new Error(`All ${OPTIONS.length} options are required exactly once. ${USAGE}`);
if (values['--purpose'] !== FREEZE_PURPOSE)
  throw new Error(`--purpose must be ${FREEZE_PURPOSE}; live activation is not supported`);
const trustedList = values['--trusted-platform-roles'];
const trusted = trustedList === 'none' ? [] : trustedList.split(',');
if (trusted.includes('none')) throw new Error('Use --trusted-platform-roles none on its own');
const sql = makeFreezeSql(
  action,
  {
    app: values['--app'],
    cli: values['--cli'],
    owner: values['--owner'],
    installer: values['--installer'],
    sourceOwner: values['--source-owner'],
    trustedPlatformRoles: trusted,
  },
  FREEZE_PURPOSE,
);
const destination = resolve(values['--out']);
writeFileSync(destination, sql, { flag: 'wx', mode: 0o600 });
const digest = createHash('sha256').update(sql).digest('hex');
process.stdout.write(`Generated ${action} SQL: ${destination}\nSHA-256: ${digest}\n`);
