/**
 * A number of months as the copy writes it: `6` → "zes maanden", `12` → "een
 * jaar", `24` → "twee jaar", any other number → "<n> maanden" ("18 maanden").
 * One month reads "1 maand". Plain module: no I/O, no Next, no `server-only`;
 * unit-tested in `months-in-words.test.ts`.
 *
 * It renders the four rule tokens (`{{opvolging:volwassene}}`,
 * `{{opvolging:jeugd-pakket}}`, `{{tweede-bezoek-gratis}}`,
 * `{{cadeaubon-geldigheid}}`) from the `rules` settings
 * (`src/lib/cms/site-settings.ts`), so a sentence like "Een cadeaubon is
 * {{cadeaubon-geldigheid}} geldig na aankoop." follows Instellingen → Regels.
 */

/**
 * The rules settings hold whole months, from a month to five years: the range
 * of the schema (`site-settings.ts`) and of the number fields in Beheer →
 * Instellingen → Regels, here so the client form needs no schema to know it.
 */
export const RULE_MONTHS_MIN = 1;
export const RULE_MONTHS_MAX = 60;

const WORDS: Readonly<Record<number, string>> = {
  6: 'zes maanden',
  12: 'een jaar',
  24: 'twee jaar',
};

export function monthsInWords(months: number): string {
  const known = WORDS[months];
  if (known) return known;
  return months === 1 ? '1 maand' : `${months} maanden`;
}
