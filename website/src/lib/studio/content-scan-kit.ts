import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { CUSTOMER_LOCATION, DEFAULT_SERVICES } from '@/lib/booking/defaults';
import { blockRegistry } from '@/lib/cms/blocks';
import { DEFAULT_OFFERS } from '@/lib/offers/defaults';
import { OG_IMAGE_ALT } from '@/lib/studio/og';
import * as aanbod from './seed-content/aanbod';
import * as appointment from './seed-content/appointment';
import * as bookingCta from './seed-content/booking-cta';
import * as cadeaubon from './seed-content/cadeaubon';
import * as cadeaubonPromo from './seed-content/cadeaubon-promo';
import * as copy from './seed-content/copy';
import * as corrections from './seed-content/corrections-2026-10-27';
import * as correctionsCopy from './seed-content/corrections-2026-10-27-copy';
import { SEED_SCRIPT } from './seed-content/corrections-test-kit';
import * as faq from './seed-content/faq';
import * as legal from './seed-content/legal';
import * as locationSection from './seed-content/location-section';
import * as navigation from './seed-content/navigation';
import * as pageCleanup from './seed-content/page-cleanup';
import * as shared from './seed-content/shared';

/**
 * What the content guards read (27 Oct 2026): every visitor-facing text that lives in code, with
 * the file and the place it sits at. `content-facts.test.ts` looks in it for a literal fact and for
 * a dash between two sentences, `content-tokens.test.ts` for a copy token the engine does not know
 * or cannot fill in. Test support (like `seed-content/corrections-test-kit.ts`): the tests import
 * it, nothing of the site depends on it.
 *
 * The collecting choices here are part of the guards' allowlist, together with `ALLOWED` in the
 * facts test: what is skipped is a master or the live text a correction replaces, nothing else.
 */

// ------------------------------------------------------------------ paths ----

/** `src/` of the project. */
export const SRC = fileURLToPath(new URL('../../', import.meta.url));

/** The sources below `dir` (the tests excluded), for the text scans. */
export function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = `${dir}/${entry.name}`;
    if (entry.isDirectory()) return sourceFiles(path);
    return /\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name) ? [path] : [];
  });
}

/** `source` with its comments blanked out (strings, template literals and JSX text stay). */
export function withoutComments(source: string): string {
  let out = '';
  let index = 0;
  let quote: string | null = null;
  while (index < source.length) {
    const char = source[index];
    const next = source[index + 1];
    if (quote) {
      out += char;
      if (char === '\\') {
        out += next ?? '';
        index += 2;
        continue;
      }
      if (char === quote) quote = null;
      index += 1;
    } else if (char === '/' && next === '/') {
      while (index < source.length && source[index] !== '\n') index += 1;
    } else if (char === '/' && next === '*') {
      const end = source.indexOf('*/', index + 2);
      index = end < 0 ? source.length : end + 2;
    } else {
      if (char === "'" || char === '"' || char === '`') quote = char;
      out += char;
      index += 1;
    }
  }
  return out;
}

// -------------------------------------------------------------- allowlist ----

/** Export names whose value is a master, not copy: skipped when a module's exports are walked. */
const MASTER_EXPORTS: ReadonlySet<string> = new Set([
  'PHONE_LABEL',
  'PHONE_HREF',
  'CONTACT_EMAIL',
  'STUDIO_CONTACT_ADDRESS',
  'STUDIO_LOCATION_ADDRESS',
  // The old and the international spelling of the number: the facts the phone correction moves
  // between (its edits end on the international form, and the contact edits go on to the token).
  'PHONE_LABEL_BEFORE',
  'PHONE_LABEL_AFTER',
  'PHONE_HREF_BEFORE',
  'PHONE_HREF_AFTER',
  'PHONE_EDITS',
  'CONTACT_EDITS',
]);

/** Keys that never hold visitor-facing copy: the live text a correction replaces, and provenance. */
const SKIPPED_KEYS: ReadonlySet<string> = new Set(['from', 'alsoFrom', 'source', 'internalNote']);

// ----------------------------------------------------------------- walking ----

export type Scanned = { file: string; where: string; text: string };

/** Every string inside `value`, with the path it sits at; skips the keys that are no copy. */
function collect(value: unknown, file: string, where: string, out: Scanned[]): void {
  if (typeof value === 'string') {
    out.push({ file, where, text: value });
  } else if (Array.isArray(value)) {
    value.forEach((item, index) => collect(item, file, `${where}[${index}]`, out));
  } else if (value && typeof value === 'object') {
    for (const [key, item] of Object.entries(value)) {
      if (SKIPPED_KEYS.has(key)) continue;
      collect(item, file, `${where}.${key}`, out);
    }
  }
}

// ----------------------------------------------------------------- sources ----

/** Every seed module, by file name: a new `seed-content/*.ts` must be listed here (the facts test says so). */
export const SEED_MODULES: Record<string, Record<string, unknown>> = {
  'aanbod.ts': aanbod,
  'appointment.ts': appointment,
  'booking-cta.ts': bookingCta,
  'cadeaubon-promo.ts': cadeaubonPromo,
  'cadeaubon.ts': cadeaubon,
  'copy.ts': copy,
  'corrections-2026-10-27-copy.ts': correctionsCopy,
  'corrections-2026-10-27.ts': corrections,
  'faq.ts': faq,
  'legal.ts': legal,
  'location-section.ts': locationSection,
  'navigation.ts': navigation,
  'page-cleanup.ts': pageCleanup,
  'shared.ts': shared,
};

/** The e-mail templates (the customer's mails and the two internal ones). */
const EMAIL_SOURCES = [
  'lib/email/templates.ts',
  'lib/email/templates-assignment.ts',
  'lib/email/templates-followups.ts',
  'lib/gift-voucher/email.ts',
  'lib/offer-enquiry/email.ts',
];

/** The editorial fields of an offering (`OfferingContent`) that are copy: not the image, not the sort order. */
const OFFERING_COPY_KEYS = [
  'title',
  'summary',
  'intro',
  'goal',
  'contents',
  'extras',
  'extrasNote',
  'priceText',
  'metaDescription',
] as const;

/** The visitor-facing texts of the code; filled below. */
export const scanned: Scanned[] = [];

// 1. The seed modules: every export except the masters.
for (const [name, module] of Object.entries(SEED_MODULES)) {
  for (const [exported, value] of Object.entries(module)) {
    if (MASTER_EXPORTS.has(exported) || typeof value === 'function') continue;
    collect(value, `src/lib/studio/seed-content/${name}`, exported, scanned);
  }
}

// 2. The default offerings: the editorial fields, not the Duur (nothing else holds an asked-for offering's length).
for (const { content } of DEFAULT_OFFERS) {
  const fields = Object.fromEntries(OFFERING_COPY_KEYS.map((key) => [key, content[key]]));
  collect(fields, 'src/lib/offers/defaults.ts', `DEFAULT_OFFERS.${content.slug}`, scanned);
}

// 3. The default booking services (the location master is not copy) and the customer location's note.
collect(
  DEFAULT_SERVICES.map(({ name, choiceLabel, description }) => ({
    name,
    choiceLabel,
    description,
  })),
  'src/lib/booking/defaults.ts',
  'DEFAULT_SERVICES',
  scanned,
);
collect(CUSTOMER_LOCATION.notes, 'src/lib/booking/defaults.ts', 'CUSTOMER_LOCATION.notes', scanned);

// 4. The e-mails: the text of the templates themselves, line by line (what the code types, not
//    what a booking fills in: durations, times and addresses of a sample would be false hits).
for (const path of EMAIL_SOURCES) {
  withoutComments(readFileSync(`${SRC}${path}`, 'utf8'))
    .split('\n')
    .forEach((line, index) => {
      if (line.trim())
        scanned.push({ file: `src/${path}`, where: `line ${index + 1}`, text: line });
    });
}

// 5. The block defaults an editor starts from (every block type of the registry), and the share image's alt text.
collect(
  Object.entries(blockRegistry).map(([type, block]) => ({ type, ...block.defaultData })),
  'src/lib/cms/blocks.ts',
  'blockRegistry.defaultData',
  scanned,
);
collect(OG_IMAGE_ALT, 'src/lib/studio/og.ts', 'OG_IMAGE_ALT', scanned);

// ------------------------------------------------------- the seed script ----

export const SCRIPT = 'scripts/cms-seed.mts';

/** The single-quoted string literals between two markers of the seed script. */
function scriptStrings(from: string, to: string): string[] {
  const start = SEED_SCRIPT.indexOf(from);
  const end = SEED_SCRIPT.indexOf(to, start);
  if (start < 0 || end < 0) throw new Error(`seed script: no region ${from} … ${to}`);
  return [...SEED_SCRIPT.slice(start, end).matchAll(/'((?:[^'\\\n]|\\.)*)'/g)].map((m) => m[1]);
}

/**
 * The default settings of the seed script: they hold masters, so they are looked at for dashes
 * only, never for facts. The FAQ and the legal pages are seed modules, scanned with the others.
 */
export const SETTING_TEXTS = scriptStrings('const DEFAULT_SETTINGS', 'const REDIRECTS');

// ------------------------------------------------------------- code scan ----

/**
 * The visitor-facing sources whose strings and JSX text are scanned for a dash
 * between sentences (the components of the studio site, the root pages and the
 * routes of the studio). Not the admin (staff), not the legacy webshop.
 */
export const VISITOR_SOURCES = [
  ...sourceFiles(`${SRC}components/studio`),
  ...sourceFiles(`${SRC}app/(studio)`),
  `${SRC}app/layout.tsx`,
  `${SRC}app/not-found.tsx`,
  `${SRC}app/global-error.tsx`,
];
