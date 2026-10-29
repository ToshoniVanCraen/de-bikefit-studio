import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { readCorrectiesBackup } from './aanbod-correcties-backup.mjs';

it('refuses a 27 Oct v1 backup before a revised restore can silently omit package rows', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'bikefit-correcties-backup-'));
  const file = join(dir, 'historical.json');
  try {
    await writeFile(
      file,
      JSON.stringify({
        kind: 'aanbod-correcties-backup',
        version: 1,
        variants: [{ audience: 'youth-package' }],
        services: { updated: [], created: [{ slug: 'jeugdfit-pakket' }] },
      }),
    );
    await expect(readCorrectiesBackup(file)).rejects.toThrow('requires the ef1ef63 restore code');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
