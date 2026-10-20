/**
 * Imports one REAL team portrait (a photo the person agreed to) into the site.
 *
 *   npm run images:portrait -- --person rutger-roelandts --src ".incoming/rutger.jpg" \
 *     [--alt "Dutch alt text"] [--focus 0.5,0.6] [--version 1] [--no-treatment]
 *
 * Persons: the keys of `src/lib/studio/team-portraits.json`. The script:
 *  1. reads the source file (never modified) and records its sha256;
 *  2. writes `public/images/team/<person>-v<version>.webp`: EXIF-rotated,
 *     cropped to the 4:5 frame of the `team` block (`.studio-team__portrait`)
 *     around `--focus` (x,y as fractions of the source, the centre of the
 *     crop window; default 0.5,0.5), at most 1200×1500, metadata stripped,
 *     WebP at the highest quality that stays under 450 KB;
 *  3. unless `--no-treatment`: a light grade so a phone photo sits next to the
 *     editorial images (saturation −12 %, a touch warmer, blacks lifted a
 *     little); nothing that changes what is in the picture;
 *  4. records file, size, crop, treatment, provenance and alt in the manifest.
 *     Existing files are never overwritten: bump `--version`.
 *
 * Afterwards `teamPortrait(person)` (`src/lib/studio/team-portraits.ts`)
 * resolves to the file, the seed content picks it up and a
 * `cms:rollout-aanbod` dry run shows that /ons-team changes. Generated images
 * never come through here: those are editorial images
 * (`scripts/import-editorial-image.mts`) and are never used as a portrait.
 *
 * Uses `sharp`, which ships with Next.js; no extra dependency.
 */
import { createHash } from 'node:crypto';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { basename, resolve } from 'node:path';

import { portraitCropWindow } from '@/lib/studio/team-portraits';

const MANIFEST = resolve('src/lib/studio/team-portraits.json');
const OUTPUT_DIR = resolve('public/images/team');
const MAX_WIDTH = 1200;
const MAX_HEIGHT = 1500;
const MAX_BYTES = 450 * 1024;
const QUALITIES = [84, 78, 72, 66, 60];

type ManifestEntry = {
  name: string;
  file: string | null;
  width: number | null;
  height: number | null;
  bytes: number | null;
  alt: string;
  source: string | null;
  sourceSha256: string | null;
  crop: { left: number; top: number; width: number; height: number } | null;
  treatment: string | null;
  consent: string;
  importedAt: string | null;
};
type Manifest = { version: number; note: string; portraits: Record<string, ManifestEntry> };

function option(args: string[], flag: string): string | null {
  const index = args.indexOf(flag);
  if (index >= 0) {
    const value = args[index + 1];
    if (value === undefined || value.startsWith('--')) throw new Error(`${flag} needs a value`);
    return value;
  }
  const inline = args.find((arg) => arg.startsWith(`${flag}=`));
  return inline ? inline.slice(flag.length + 1) : null;
}

function parseFocus(value: string | null): { x: number; y: number } {
  if (!value) return { x: 0.5, y: 0.5 };
  const [x, y] = value.split(',').map((part) => Number(part.trim()));
  if (![x, y].every((part) => Number.isFinite(part) && part >= 0 && part <= 1)) {
    throw new Error('--focus takes two fractions between 0 and 1, e.g. 0.5,0.6');
  }
  return { x, y };
}

const TREATMENT = 'saturation 0.88 · warm cast (R ×1.03, B ×0.96) · linear 0.94 +10';

async function main() {
  const args = process.argv.slice(2);
  const person = option(args, '--person');
  const src = option(args, '--src');
  const version = Number(option(args, '--version') ?? '1');
  const focus = parseFocus(option(args, '--focus'));
  const treat = !args.includes('--no-treatment');
  if (!person || !src) {
    throw new Error('usage: --person <person> --src <file> [--alt …] [--focus x,y] [--version N]');
  }
  if (!Number.isInteger(version) || version < 1) throw new Error('--version must be 1 or higher');

  const manifest = JSON.parse(await readFile(MANIFEST, 'utf8')) as Manifest;
  const entry = manifest.portraits[person];
  if (!entry) {
    throw new Error(
      `unknown person ${person} (known: ${Object.keys(manifest.portraits).join(', ')})`,
    );
  }

  const source = await readFile(resolve(src));
  const sha256 = createHash('sha256').update(source).digest('hex');

  let sharp: (typeof import('sharp'))['default'];
  try {
    sharp = (await import('sharp')).default;
  } catch {
    throw new Error('sharp is not available (it ships with next); run npm ci first');
  }

  const file = `${person}-v${version}.webp`;
  const target = resolve(OUTPUT_DIR, file);
  const exists = await stat(target).then(
    () => true,
    () => false,
  );
  if (exists) throw new Error(`${file} already exists; pass --version ${version + 1}`);

  // Orientation first, so the crop is computed on the picture as people see it.
  const upright = await sharp(source).rotate().toBuffer({ resolveWithObject: true });
  const crop = portraitCropWindow(upright.info.width, upright.info.height, focus);

  let output: Buffer | null = null;
  let info: { width: number; height: number; size: number } | null = null;
  for (const quality of QUALITIES) {
    let pipeline = sharp(upright.data)
      .extract(crop)
      .resize({ width: MAX_WIDTH, height: MAX_HEIGHT, fit: 'inside', withoutEnlargement: true });
    if (treat) {
      pipeline = pipeline
        .modulate({ saturation: 0.88 })
        .recomb([
          [1.03, 0, 0],
          [0, 1, 0],
          [0, 0, 0.96],
        ])
        .linear(0.94, 10);
    }
    const result = await pipeline
      .webp({ quality, effort: 5 })
      .toBuffer({ resolveWithObject: true });
    output = result.data;
    info = { width: result.info.width, height: result.info.height, size: result.info.size };
    if (result.info.size <= MAX_BYTES) break;
  }
  if (!output || !info) throw new Error('could not encode the image');

  await mkdir(OUTPUT_DIR, { recursive: true });
  await writeFile(target, output, { flag: 'wx' });

  const alt = option(args, '--alt');
  manifest.portraits[person] = {
    ...entry,
    file,
    width: info.width,
    height: info.height,
    bytes: info.size,
    alt: alt ?? entry.alt,
    source: basename(src),
    sourceSha256: sha256,
    crop,
    treatment: treat ? TREATMENT : null,
    importedAt: new Date().toISOString(),
  };
  await writeFile(MANIFEST, `${JSON.stringify(manifest, null, 2)}\n`);

  console.log(
    `✓ ${person}: public/images/team/${file} — ${info.width}×${info.height}, ${Math.round(info.size / 1024)} KB`,
  );
  console.log(
    `  crop ${crop.width}×${crop.height} at (${crop.left}, ${crop.top}) of ${upright.info.width}×${upright.info.height}; treatment ${treat ? 'on' : 'off'}`,
  );
  console.log(`  source ${basename(src)} sha256 ${sha256}`);
  console.log(
    '  next: npm test, then `npm run cms:rollout-aanbod` (dry run) to see /ons-team change.',
  );
}

main().catch((error) => {
  console.error('✗ portrait import failed');
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
