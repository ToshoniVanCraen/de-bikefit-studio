import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { sanitizeRichTextHtml } from '@/lib/cms/actions/sanitize';
import { AANBOD_PAGES } from './aanbod';
import { AFSPRAAK_PAGE } from './appointment';
import { CORRECTION_PAGE_SPECS } from './corrections-2026-10-27';
import { FAQ_ITEMS } from './faq';
import { PRIVACY_HTML, TERMS_HTML } from './legal';
import type { CleanupBlock, PageCleanupSpec } from './page-cleanup';

/**
 * Helpers the tests of the corrections of 27 Oct 2026 share
 * (`corrections-2026-10-27.test.ts`, `corrections-2026-10-27-copy.test.ts`,
 * `content-facts.test.ts`): the seed script read as text (only its settings
 * block is not a module), the seeds as the database stores them, and a spec
 * turned around. Not a test itself.
 */

/** `scripts/cms-seed.mts` as text (LF), for what still lives in the script: the default settings. */
export const SEED_SCRIPT = readFileSync(
  fileURLToPath(new URL('../../../../scripts/cms-seed.mts', import.meta.url)),
  'utf8',
).replace(/\r\n/g, '\n');

/** The corrections of one page (the first half and the copy half, merged). */
export function spec(slug: string): PageCleanupSpec {
  const found = CORRECTION_PAGE_SPECS.find((entry) => entry.slug === slug);
  if (!found) throw new Error(`no correction spec for "${slug}"`);
  return found;
}

/** The spec that undoes `forward`: the old content of an existing database from today's seed. */
export function inverse(forward: PageCleanupSpec): PageCleanupSpec {
  return {
    slug: forward.slug,
    edits: forward.edits.map((edit) => {
      switch (edit.kind) {
        case 'set':
        case 'replaceItem':
          return { ...edit, from: edit.to, to: edit.from };
        case 'replace':
        case 'replaceAll':
          return { ...edit, from: edit.to, to: edit.from };
        default:
          return edit;
      }
    }),
    metaDescription: forward.metaDescription && {
      from: forward.metaDescription.to,
      to: forward.metaDescription.from,
    },
    metaTitle: forward.metaTitle && { from: forward.metaTitle.to, to: forward.metaTitle.from },
  };
}

/** As stored in the database: rich text through the sanitiser. */
export function stored(blocks: readonly CleanupBlock[]): CleanupBlock[] {
  return blocks.map((block) =>
    typeof block.data.html === 'string'
      ? { type: block.type, data: { ...block.data, html: sanitizeRichTextHtml(block.data.html) } }
      : block,
  );
}

/** The blocks of a page as today's seeds define them, stored. */
export function seedBlocks(slug: string): CleanupBlock[] {
  if (slug === 'afspraak') return stored(AFSPRAAK_PAGE.blocks);
  if (slug === 'veelgestelde-vragen') {
    return [{ type: 'faq', data: { variant: 'default', collapsible: false, items: FAQ_ITEMS } }];
  }
  if (slug === 'algemene-voorwaarden') {
    return stored([
      { type: 'hero', data: { variant: 'pageHead', title: 'Algemene voorwaarden' } },
      { type: 'richText', data: { variant: 'default', title: '', html: TERMS_HTML } },
    ]);
  }
  if (slug === 'privacy') {
    return stored([
      { type: 'hero', data: { variant: 'pageHead', title: 'Privacyverklaring' } },
      { type: 'richText', data: { variant: 'default', title: '', html: PRIVACY_HTML } },
    ]);
  }
  const page = AANBOD_PAGES.find((entry) => entry.slug === slug);
  if (!page) throw new Error(`no seed page "${slug}"`);
  return stored(page.blocks);
}

/** Every string inside `value`, however deep. */
export function stringsIn(value: unknown): string[] {
  if (typeof value === 'string') return [value];
  if (Array.isArray(value)) return value.flatMap(stringsIn);
  if (value && typeof value === 'object') return Object.values(value).flatMap(stringsIn);
  return [];
}
