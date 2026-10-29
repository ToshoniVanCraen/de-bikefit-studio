import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { makeFreezeSql, type FreezeRoles } from './lib/cms-writer-freeze-sql.mjs';

const args = process.argv.slice(2);
const action = args.shift();
if (!action || !['install', 'verify', 'freeze', 'unfreeze', 'uninstall'].includes(action)) {
  throw new Error(
    'Usage: npm run cms:writer-freeze -- <install|verify|freeze|unfreeze|uninstall> --app ROLE --cli ROLE --owner ROLE --installer ROLE --out FILE',
  );
}
const values: Record<string, string> = {};
while (args.length) {
  const key = args.shift();
  const value = args.shift();
  if (!key?.startsWith('--') || !value || value.startsWith('--') || values[key])
    throw new Error(`Invalid option: ${key}`);
  values[key] = value;
}
const expected = ['--app', '--cli', '--owner', '--installer', '--out'];
if (Object.keys(values).length !== expected.length || expected.some((key) => !values[key]))
  throw new Error('All five role/output options are required');
const roles: FreezeRoles = {
  app: values['--app'],
  cli: values['--cli'],
  owner: values['--owner'],
  installer: values['--installer'],
};
const sql = makeFreezeSql(action as Parameters<typeof makeFreezeSql>[0], roles);
const destination = resolve(values['--out']);
writeFileSync(destination, sql, { flag: 'wx', mode: 0o600 });
process.stdout.write(`Generated ${action} SQL: ${destination}\n`);
