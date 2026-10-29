import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { DEFAULT_SERVICES } from '@/lib/booking/defaults';
import { DEFAULT_OFFERS } from '@/lib/offers/defaults';
import {
  SCRIPT,
  SEED_MODULES,
  SETTING_TEXTS,
  SRC,
  VISITOR_SOURCES,
  scanned,
  withoutComments,
  type Scanned,
} from './content-scan-kit';
import { hasSentenceDash } from './seed-content/corrections-2026-10-27-copy';

/**
 * Guard for "a fact is typed once, in its master; copy refers to it" and for
 * "no dash between two sentences" (Toshoni, 27 Oct 2026).
 *
 * Every visitor-facing text that lives in code (`content-scan-kit.ts` collects
 * them) is scanned for the literals that
 * belong to a master: an amount in euros, a duration, the phone number, an
 * e-mail address, the street address, a follow-up or validity window, the company
 * identity. The seeds (the FAQ and the legal pages among them), the defaults
 * (offerings, booking services, the block defaults an editor starts from) and
 * the e-mail templates must say `{{prijs:…}}`, `{{duur:…}}`, `{{telefoon}}`,
 * `{{e-mail}}`, `{{adres}}`, `{{opvolging:…}}`, `{{bedrijf}}`, ... instead (the
 * engine: `copy-tokens.ts`; the masters: Instellingen, the variants, the services).
 * A failure names the file and the sentence. The e-mail templates are read as
 * source text, line by line: what the code types, not what a booking fills in.
 *
 * What may stay literal is the MASTER itself, nothing else; the allowlist is
 * `MASTER_EXPORTS`, `SKIPPED_KEYS` and the collecting choices (`content-scan-kit.ts`)
 * and `ALLOWED` below, and it is complete:
 *  - the contact constants the settings are seeded from (`PHONE_LABEL`, `PHONE_HREF`,
 *    `CONTACT_EMAIL`), the studio address (`STUDIO_CONTACT_ADDRESS`, the booking
 *    location), the phone correction's spellings, and the legal identity
 *    (`LEGAL_IDENTITY`: not copy, not scanned);
 *  - the `from` side of the corrections (and `FITS_OF_20_OCT` in `aanbod-prices.ts`,
 *    not scanned): the live text they replace;
 *  - the Duur of an offering that is asked for (`duration`): nothing else holds it;
 *  - the voucher amounts (block data) in the voucher's own texts;
 *  - the 48 hours of art. 6 of the terms: the policy itself, written where it is stated;
 *  - the address of the Gegevensbeschermingsautoriteit in the privacy statement;
 *  - the RPR division of the registered office ("RPR Brussel, Nederlandstalige
 *    afdeling"): the business setting has no field for it (`LEGAL_IDENTITY.rpr` is a
 *    constant), so the legal texts type it;
 *  - the settings block of the seed script: looked at for dashes only.
 */

// ----------------------------------------------------------------- facts ----

type Fact = { name: string; pattern: RegExp; master: string };

const FACTS: Fact[] = [
  {
    name: 'a euro amount',
    pattern: /€\s?\d/,
    master: '{{prijs:<offering>:<audience>}} or {{extra:…}}',
  },
  {
    name: 'a duration',
    pattern: /\b\d+(?:[.,]\d+)?\s?(?:uur|minuten|min)\b/i,
    master: '{{duur:<service>}} or {{extra:…}}',
  },
  {
    name: 'the phone number',
    pattern: /\+32|\b0?473[ .]?95[ .]?26[ .]?33\b/,
    master: '{{telefoon}} and {{telefoon-href}}',
  },
  {
    name: 'an e-mail address',
    pattern: /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+\.[A-Za-z0-9.-]+/,
    master: '{{e-mail}}',
  },
  {
    name: 'the street address',
    pattern: /Halsesteenweg|Weversstraat|Neigem|\b9403\b|\b1730 Asse\b/,
    master: '{{adres}} or {{zetel}}',
  },
  {
    name: 'a follow-up or validity window',
    pattern: /\bzes maanden\b|\been jaar\b/i,
    master: '{{opvolging:…}}, {{tweede-bezoek-gratis}} or {{cadeaubon-geldigheid}}',
  },
  {
    name: 'the company identity',
    pattern: /Qarakter|1036[. ]?912[. ]?281/,
    master: '{{bedrijf}}, {{kbo}} or {{btw}}',
  },
  {
    name: 'the RPR division',
    pattern: /RPR|Nederlandstalige afdeling/,
    master: 'no master yet: only the legal texts type it (see ALLOWED)',
  },
];

/** The facts a text types, with a few words around each. */
function factsIn(text: string): Array<{ fact: Fact; context: string }> {
  const found: Array<{ fact: Fact; context: string }> = [];
  for (const fact of FACTS) {
    const match = fact.pattern.exec(text);
    if (!match) continue;
    const from = Math.max(0, match.index - 50);
    const to = Math.min(text.length, match.index + match[0].length + 50);
    found.push({ fact, context: text.slice(from, to).replace(/\s+/g, ' ').trim() });
  }
  return found;
}

// -------------------------------------------------------------- allowlist ----

/** The facts that may stay literal for a given text, with the reason. */
const ALLOWED: ReadonlyArray<{ fact: string; when: RegExp; why: string }> = [
  {
    fact: 'a euro amount',
    when: /cadeau/i,
    why: 'the three voucher amounts are block data (GIFT_VOUCHER_DEFAULT_AMOUNTS) and stay literal in the voucher texts',
  },
  {
    fact: 'a duration',
    when: /<strong>48 uur<\/strong>/,
    why: 'art. 6 of the terms states the cancellation policy; it is the one place that says it',
  },
  {
    fact: 'an e-mail address',
    when: /contact@apd-gba\.be/,
    why: 'the address of the Gegevensbeschermingsautoriteit (privacy statement): somebody else’s',
  },
  {
    fact: 'the RPR division',
    when: /RPR Brussel, Nederlandstalige afdeling/,
    why: 'the court division of the registered office has no master (LEGAL_IDENTITY.rpr is a constant, not a setting): the legal texts type it',
  },
];

function allowed(factName: string, text: string): boolean {
  return ALLOWED.some((entry) => entry.fact === factName && entry.when.test(text));
}

// ------------------------------------------------------------------ tests ----

describe('copy refers to the master: no literal fact in the visitor-facing texts', () => {
  it('lists every seed module (a new one has to be added to SEED_MODULES, so it is scanned too)', () => {
    const dir = fileURLToPath(new URL('./seed-content', import.meta.url));
    const onDisk = readdirSync(dir).filter(
      (name) =>
        name.endsWith('.ts') && !/\.test\.ts$/.test(name) && name !== 'corrections-test-kit.ts',
    );
    expect(Object.keys(SEED_MODULES).sort()).toEqual(onDisk.sort());
  });

  it('scans the seeds, the defaults, the FAQ and legal texts and the e-mails', () => {
    // Not vacuous: a lot of text is looked at, from every source.
    expect(scanned.length).toBeGreaterThan(600);
    const files = new Set(scanned.map((entry) => entry.file));
    for (const file of [
      'src/lib/studio/seed-content/aanbod.ts',
      'src/lib/studio/seed-content/appointment.ts',
      'src/lib/studio/seed-content/cadeaubon.ts',
      'src/lib/studio/seed-content/corrections-2026-10-27.ts',
      'src/lib/studio/seed-content/faq.ts',
      'src/lib/studio/seed-content/legal.ts',
      'src/lib/offers/defaults.ts',
      'src/lib/booking/defaults.ts',
      'src/lib/email/templates.ts',
      'src/lib/email/templates-followups.ts',
      'src/lib/gift-voucher/email.ts',
      'src/lib/cms/blocks.ts',
    ]) {
      expect(files.has(file), file).toBe(true);
    }
  });

  it('types no amount, duration, number, address, window or identity that has a master', () => {
    const violations = scanned.flatMap(({ file, where, text }) =>
      factsIn(text)
        .filter(({ fact }) => !allowed(fact.name, text))
        .map(
          ({ fact, context }) =>
            `${file} (${where}): types ${fact.name}, use ${fact.master}: “${context}”`,
        ),
    );
    expect(violations).toEqual([]);
  });

  it('knows what it looks for (the scanner itself)', () => {
    const sentences: Array<[string, string]> = [
      ['a euro amount', 'Vanaf € 75 per fiets.'],
      ['a duration', 'Dat duurt 30 minuten.'],
      ['a duration', 'Reken op 2,5 uur.'],
      ['the phone number', 'Bel +32 473 95 26 33.'],
      ['the phone number', 'Bel 0473 95 26 33.'],
      ['an e-mail address', 'Mail info@debikefitstudio.be.'],
      ['the street address', 'Halsesteenweg 406 a'],
      ['a follow-up or validity window', 'Opvolging tot zes maanden na je fit.'],
      ['a follow-up or validity window', 'Een jaar geldig na aankoop.'],
      ['the company identity', 'Qarakter BV'],
      ['the company identity', 'BE 1036.912.281'],
      ['the RPR division', 'RPR Brussel, Nederlandstalige afdeling'],
    ];
    for (const [name, sentence] of sentences) {
      expect(
        factsIn(sentence).map(({ fact }) => fact.name),
        sentence,
      ).toContain(name);
    }
    // Tokens and the texts around the masters are fine.
    for (const sentence of [
      'Vanaf {{prijs:bikefit-tweede-fiets:all}} per fiets.',
      'Bel {{telefoon}} of mail {{e-mail}}.',
      'Opvolging tot {{opvolging:volwassene}} na je fit.',
      'Om de 18 tot 24 maanden, of telkens als er iets verandert.',
      'In Ninove, op afspraak.',
    ]) {
      expect(factsIn(sentence), sentence).toEqual([]);
    }
  });

  it('allows only what the allowlist names: the voucher amounts, the 48 hours, the authority’s address, the RPR division', () => {
    expect(ALLOWED.map((entry) => entry.fact)).toEqual([
      'a euro amount',
      'a duration',
      'an e-mail address',
      'the RPR division',
    ]);
    expect(allowed('a euro amount', 'Kies een cadeaubon van € 75 of € 150.')).toBe(true);
    expect(allowed('a euro amount', 'Een bikefit kost € 275.')).toBe(false);
    expect(allowed('a duration', 'tot <strong>48 uur</strong> voor het tijdstip')).toBe(true);
    expect(allowed('a duration', 'Dat duurt 48 uur.')).toBe(false);
    expect(allowed('an e-mail address', 'contact@apd-gba.be')).toBe(true);
    expect(allowed('an e-mail address', 'info@debikefitstudio.be')).toBe(false);
    expect(
      allowed('the RPR division', 'nummer {{kbo}}, RPR Brussel, Nederlandstalige afdeling, via'),
    ).toBe(true);
    expect(allowed('the RPR division', 'RPR Gent, Nederlandstalige afdeling')).toBe(false);
    // The allowance is for that one fact: a company name typed next to it is still caught.
    const text = 'Qarakter BV (RPR Brussel, Nederlandstalige afdeling)';
    expect(factsIn(text).filter(({ fact }) => !allowed(fact.name, text))).toHaveLength(1);
  });

  it('keeps the masters themselves where they belong: the Duur of an asked-for offering, the services, the studio address', () => {
    // The asked-for offerings' Duur is the one place their length is typed (a service-backed one is a token).
    const durations = Object.fromEntries(
      DEFAULT_OFFERS.map(({ content }) => [content.slug, content.duration]),
    );
    expect(durations['bikefit-nieuwe-fiets']).toBe('{{duur:volwassenenfit}}');
    expect(durations['voetanalyse']).toBe('30 minuten');
    // The booking services carry the minutes and the prices as numbers.
    expect(DEFAULT_SERVICES.map((service) => service.durationMinutes)).toEqual([120, 120]);
    expect(DEFAULT_SERVICES.map((service) => service.priceCents)).toEqual([27500, 15000]);
  });
});

describe('no dash between two sentences (Toshoni, 27 Oct 2026)', () => {
  it('in any scanned text (the block defaults an editor starts from included) and the seed script’s settings', () => {
    const texts: Scanned[] = [
      ...scanned,
      ...SETTING_TEXTS.map((text) => ({ file: SCRIPT, where: 'DEFAULT_SETTINGS', text })),
    ];
    const violations = texts
      .filter(({ text }) => hasSentenceDash(text))
      .map(({ file, where, text }) => `${file} (${where}): “${text.slice(0, 120)}”`);
    expect(violations).toEqual([]);
  });

  it('in the strings and the text of the components and routes a visitor sees', () => {
    expect(VISITOR_SOURCES.length).toBeGreaterThan(40);
    const violations = VISITOR_SOURCES.flatMap((path) =>
      withoutComments(readFileSync(path, 'utf8'))
        .split('\n')
        .flatMap((line, index) =>
          hasSentenceDash(line)
            ? [`${path.replace(SRC, 'src/')}:${index + 1}: “${line.trim().slice(0, 120)}”`]
            : [],
        ),
    );
    expect(violations).toEqual([]);
  });

  it('the scanner lets names through and stops a dash between sentences', () => {
    expect(hasSentenceDash('Bikefit – huidige fiets en Jeugd – eenmalig')).toBe(false);
    expect(hasSentenceDash('Dat hangt af — van de fit.')).toBe(true);
    expect(hasSentenceDash('Dat hangt af – van de fit.')).toBe(true);
    expect(hasSentenceDash('Register T-01–T-04')).toBe(false);
    expect(
      withoutComments('const a = 1; // niet — dit\n/* of — dit */ const b = "wel — dit";'),
    ).toBe('const a = 1; \n const b = "wel — dit";');
  });
});
