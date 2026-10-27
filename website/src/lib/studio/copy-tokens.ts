import { escapeHtml } from '@/lib/html';

/**
 * Copy tokens: placeholders an editor types in any text of a public page, an
 * offering, a booking text or an e-mail, resolved at render time from the master
 * of each fact, so a sentence never repeats a number or a name that lives
 * elsewhere ("a fact is typed once, in its master; copy refers to it", Toshoni,
 * 27 Oct 2026). Pure engine: no I/O, no Next, no `server-only`; tested in
 * `copy-tokens.test.ts`. The lookup it resolves against is built once per
 * request from the cached readers (`copy-token-lookup.ts`, the pure part in
 * `copy-token-values.ts`); the admin and the stored data keep the token as typed.
 *
 *   {{duur:<service-slug>}}                the service's planning duration ("2 uur", "1 u 30 min")
 *   {{prijs:<offering-slug>}}              the price line /aanbod shows for the offering
 *   {{prijs:<offering-slug>:<audience>}}   one variant's amount, "€ 275" (all, adult, youth, youth-package)
 *   {{extra:<offering-slug>}}              an extra: "€ 75 en 30 minuten extra"
 *   {{extra:<offering-slug>:<choice-key>}} one choice of an extra, same shape
 *   {{telefoon}} {{telefoon-href}} {{e-mail}} {{adres}} {{adres-studio}}
 *   {{bedrijf}} {{zetel}} {{kbo}} {{btw}}
 *   {{opvolging:volwassene}} {{opvolging:jeugd-pakket}} {{tweede-bezoek-gratis}} {{cadeaubon-geldigheid}}
 *
 * Rules the callers rely on:
 *  - **Single pass.** A token is replaced by its text and that text is never
 *    scanned again, so a value can neither loop nor smuggle a token in.
 *  - **Unknown stays as typed.** A name outside the set above, a wrong number of
 *    parts or a capital letter is not a token and is left exactly as written. A
 *    known token whose data is missing reads its fallback ("in overleg", "op
 *    aanvraag"; an empty setting reads empty), never the raw `{{…}}`.
 *  - **HTML-safe.** Under a key named `html` (rich text) and with `{ html: true }`
 *    the resolved text is escaped; everywhere else it is plain text.
 *  - A copy is returned; the stored block keeps its token.
 */

/** The facts that come straight from settings (`business`, `contact`, `rules`) or the studio location. */
export const FACT_TOKENS = [
  'telefoon',
  'telefoon-href',
  'e-mail',
  'adres',
  'adres-studio',
  'bedrijf',
  'zetel',
  'kbo',
  'btw',
  'opvolging:volwassene',
  'opvolging:jeugd-pakket',
  'tweede-bezoek-gratis',
  'cadeaubon-geldigheid',
] as const;
export type FactToken = (typeof FACT_TOKENS)[number];

export const DURATION_TOKEN_FALLBACK = 'in overleg';
export const PRICE_TOKEN_FALLBACK = 'op aanvraag';
export const EXTRA_TOKEN_FALLBACK = 'in overleg';

/** What a token resolves against. Plain data, built once per request. */
export type CopyTokenLookup = {
  /** Service slug → duration label, e.g. `volwassenenfit` → "2 uur". */
  durationBySlug: ReadonlyMap<string, string>;
  /** Offering slug → the price line of its card (`{{prijs:<slug>}}`). */
  priceLineBySlug: ReadonlyMap<string, string>;
  /** `variantPriceKey()` → one variant's amount in prose, "€ 275". */
  priceByVariant: ReadonlyMap<string, string>;
  /** Extra's slug → "€ 75 en 30 minuten extra"; only for an extra without choices. */
  extraBySlug: ReadonlyMap<string, string>;
  /** `extraChoiceKey()` → the same sentence for one choice of an extra. */
  extraChoiceByKey: ReadonlyMap<string, string>;
  /** The fact tokens; an empty string where the master holds nothing. */
  facts: Readonly<Record<FactToken, string>>;
};

/** A lookup that knows nothing: every data token reads its fallback, every fact is empty. */
export function emptyCopyTokenLookup(): CopyTokenLookup {
  return {
    durationBySlug: new Map(),
    priceLineBySlug: new Map(),
    priceByVariant: new Map(),
    extraBySlug: new Map(),
    extraChoiceByKey: new Map(),
    facts: Object.fromEntries(FACT_TOKENS.map((name) => [name, ''])) as Record<FactToken, string>,
  };
}

/** Key of `priceByVariant`. */
export function variantPriceKey(offeringSlug: string, audience: string): string {
  return `${offeringSlug}:${audience}`;
}

/** Key of `extraChoiceByKey`. */
export function extraChoiceKey(offeringSlug: string, choiceKey: string): string {
  return `${offeringSlug}:${choiceKey}`;
}

// ---------------------------------------------------------------------------
// Tokens as an editor types them (also what the admin help and the tests print)
// ---------------------------------------------------------------------------

/** `{{duur:<slug>}}` */
export function durationToken(serviceSlug: string): string {
  return `{{duur:${serviceSlug}}}`;
}

/** `{{prijs:<slug>}}`, or `{{prijs:<slug>:<audience>}}` with an audience. */
export function priceToken(offeringSlug: string, audience?: string): string {
  return audience ? `{{prijs:${offeringSlug}:${audience}}}` : `{{prijs:${offeringSlug}}}`;
}

/** `{{extra:<slug>}}`, or `{{extra:<slug>:<choice key>}}` with a choice. */
export function extraToken(offeringSlug: string, choiceKey?: string): string {
  return choiceKey ? `{{extra:${offeringSlug}:${choiceKey}}}` : `{{extra:${offeringSlug}}}`;
}

/** `{{telefoon}}`, `{{opvolging:volwassene}}`, … */
export function factToken(name: FactToken): string {
  return `{{${name}}}`;
}

// ---------------------------------------------------------------------------
// Grammar
// ---------------------------------------------------------------------------

/** `name` or `name:part` or `name:part:part`: lower-case letters, digits and hyphens. */
const TOKEN_BODY = String.raw`[a-z0-9][a-z0-9-]*(?::[a-z0-9][a-z0-9-]*)*`;
const TOKEN_SOURCE = String.raw`\{\{\s*(${TOKEN_BODY})\s*\}\}`;

/** A fresh global expression each time: a shared one would carry `lastIndex` between calls. */
const tokenPattern = () => new RegExp(TOKEN_SOURCE, 'g');

const FACT_NAMES: ReadonlySet<string> = new Set(FACT_TOKENS);

export type ParsedCopyToken =
  | { kind: 'duration'; slug: string }
  | { kind: 'price'; slug: string; audience: string | null }
  | { kind: 'extra'; slug: string; choice: string | null }
  | { kind: 'fact'; name: FactToken };

/**
 * The token a body (the text between the braces, trimmed) stands for, or `null`
 * when it is none of the set: unknown name, wrong number of parts.
 */
export function parseCopyToken(body: string): ParsedCopyToken | null {
  if (FACT_NAMES.has(body)) return { kind: 'fact', name: body as FactToken };
  const [name, first, second, ...rest] = body.split(':');
  if (!first || rest.length > 0) return null;
  switch (name) {
    case 'duur':
      return second === undefined ? { kind: 'duration', slug: first } : null;
    case 'prijs':
      return { kind: 'price', slug: first, audience: second ?? null };
    case 'extra':
      return { kind: 'extra', slug: first, choice: second ?? null };
    default:
      return null;
  }
}

function hasTokenIn(text: string): boolean {
  if (!text.includes('{{')) return false;
  for (const match of text.matchAll(tokenPattern())) {
    if (parseCopyToken(match[1])) return true;
  }
  return false;
}

/** True when any string anywhere in `value` holds a token of the set. */
export function hasCopyTokens(value: unknown): boolean {
  if (typeof value === 'string') return hasTokenIn(value);
  if (Array.isArray(value)) return value.some(hasCopyTokens);
  if (value && typeof value === 'object') return Object.values(value).some(hasCopyTokens);
  return false;
}

/** The service slugs the `{{duur:…}}` tokens in `value` refer to, each once. */
export function copyTokenSlugs(value: unknown): string[] {
  const slugs = new Set<string>();
  const visit = (item: unknown) => {
    if (typeof item === 'string') {
      if (!item.includes('{{')) return;
      for (const match of item.matchAll(tokenPattern())) {
        const token = parseCopyToken(match[1]);
        if (token?.kind === 'duration') slugs.add(token.slug);
      }
    } else if (Array.isArray(item)) {
      item.forEach(visit);
    } else if (item && typeof item === 'object') {
      Object.values(item).forEach(visit);
    }
  };
  visit(value);
  return [...slugs];
}

/** The offering slugs a text refers to by the line form `{{prijs:<slug>}}`, each once. */
export function priceLineSlugs(text: string): string[] {
  const slugs = new Set<string>();
  if (text.includes('{{')) {
    for (const match of text.matchAll(tokenPattern())) {
      const token = parseCopyToken(match[1]);
      if (token?.kind === 'price' && token.audience === null) slugs.add(token.slug);
    }
  }
  return [...slugs];
}

// ---------------------------------------------------------------------------
// Resolution
// ---------------------------------------------------------------------------

function textFor(token: ParsedCopyToken, lookup: CopyTokenLookup): string {
  switch (token.kind) {
    case 'duration':
      return lookup.durationBySlug.get(token.slug) ?? DURATION_TOKEN_FALLBACK;
    case 'price':
      return token.audience === null
        ? (lookup.priceLineBySlug.get(token.slug) ?? PRICE_TOKEN_FALLBACK)
        : (lookup.priceByVariant.get(variantPriceKey(token.slug, token.audience)) ??
            PRICE_TOKEN_FALLBACK);
    case 'extra':
      return token.choice === null
        ? (lookup.extraBySlug.get(token.slug) ?? EXTRA_TOKEN_FALLBACK)
        : (lookup.extraChoiceByKey.get(extraChoiceKey(token.slug, token.choice)) ??
            EXTRA_TOKEN_FALLBACK);
    case 'fact':
      return lookup.facts[token.name];
  }
}

export function resolveCopyTokensInText(
  text: string,
  lookup: CopyTokenLookup,
  options: { html?: boolean } = {},
): string {
  if (!text.includes('{{')) return text;
  return text.replace(tokenPattern(), (match, body: string) => {
    const token = parseCopyToken(body);
    if (!token) return match;
    const label = textFor(token, lookup);
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
