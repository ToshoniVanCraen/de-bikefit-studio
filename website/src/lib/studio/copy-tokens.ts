import { escapeHtml } from '@/lib/html';

/**
 * Copy tokens: placeholders an editor can type in any text or rich-text field
 * of a public page, resolved on the public site at render time from live
 * data, so a sentence never repeats a number that lives elsewhere.
 *
 * One token so far (Toshoni, 20 Oct 2026: "Reken op de tijd" must follow the
 * offer): `{{duur:<service-slug>}}` → the planning duration of that bookable
 * service, as the booking widget shows it ("2 uur", "1 u 30 min"), or
 * "in overleg" when no such active, offered service exists. The admin shows
 * the token as typed. Pure; tested in `copy-tokens.test.ts`; applied by
 * `BlockRenderer` (`src/components/studio/blocks/index.tsx`) to every string
 * of every block, HTML-escaped under a key named `html`.
 */

const TOKEN_SOURCE = String.raw`\{\{\s*duur:([a-z0-9-]+)\s*\}\}`;
const TOKEN_RE = new RegExp(TOKEN_SOURCE);
const TOKENS_RE = new RegExp(TOKEN_SOURCE, 'g');

export const DURATION_TOKEN_FALLBACK = 'in overleg';

export type CopyTokenLookup = {
  /** Service slug → duration label, e.g. `volwassenenfit` → "2 uur". */
  durationBySlug: ReadonlyMap<string, string>;
};

/** `{{duur:<slug>}}` as an editor types it. */
export function durationToken(serviceSlug: string): string {
  return `{{duur:${serviceSlug}}}`;
}

/** True when any string anywhere in `value` holds a token. */
export function hasCopyTokens(value: unknown): boolean {
  if (typeof value === 'string') return TOKEN_RE.test(value);
  if (Array.isArray(value)) return value.some(hasCopyTokens);
  if (value && typeof value === 'object') return Object.values(value).some(hasCopyTokens);
  return false;
}

/** The slugs the tokens in `value` refer to, each once. */
export function copyTokenSlugs(value: unknown): string[] {
  const slugs = new Set<string>();
  const visit = (item: unknown) => {
    if (typeof item === 'string') {
      for (const match of item.matchAll(TOKENS_RE)) slugs.add(match[1]);
    } else if (Array.isArray(item)) {
      item.forEach(visit);
    } else if (item && typeof item === 'object') {
      Object.values(item).forEach(visit);
    }
  };
  visit(value);
  return [...slugs];
}

export function resolveCopyTokensInText(
  text: string,
  lookup: CopyTokenLookup,
  options: { html?: boolean } = {},
): string {
  return text.replace(TOKENS_RE, (_match, slug: string) => {
    const label = lookup.durationBySlug.get(slug) ?? DURATION_TOKEN_FALLBACK;
    return options.html ? escapeHtml(label) : label;
  });
}

/**
 * Every string in `value`, tokens resolved; a string under a key named `html`
 * is treated as HTML (the resolved label is escaped). Returns a copy.
 */
export function resolveCopyTokens<T>(value: T, lookup: CopyTokenLookup): T {
  return walk(value, lookup, false) as T;
}

function walk(value: unknown, lookup: CopyTokenLookup, html: boolean): unknown {
  if (typeof value === 'string') return resolveCopyTokensInText(value, lookup, { html });
  if (Array.isArray(value)) return value.map((item) => walk(item, lookup, html));
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value)) out[key] = walk(item, lookup, key === 'html');
    return out;
  }
  return value;
}
