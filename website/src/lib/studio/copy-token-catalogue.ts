/**
 * The copy tokens as the admin explains them (27 Oct 2026): one line each, in
 * Dutch, under the text fields of the block editor, the offering form and the
 * booking settings (`src/components/admin/copy-token-help.tsx`). Plain data,
 * no I/O; `copy-token-catalogue.test.ts` keeps it in step with the engine: every
 * example is a token `copy-tokens.ts` recognises and every fact token has a line.
 *
 * `token` shows the shape with `<…>` where an editor fills in a slug; `example`
 * is a real, recognised token. A slug is the last part of an address: a service's
 * slug (Beheer → Aanbod, per variant), an offering's slug (`/aanbod/<slug>`), a
 * choice's key (the label of an extra's choice in lower case with hyphens).
 */

export type CopyTokenHelpEntry = {
  token: string;
  /** What it prints and where the fact lives, in one line. */
  description: string;
  example: string;
};

const fact = (name: string, description: string): CopyTokenHelpEntry => ({
  token: `{{${name}}}`,
  description,
  example: `{{${name}}}`,
});

export const COPY_TOKEN_HELP: readonly CopyTokenHelpEntry[] = [
  {
    token: '{{duur:<dienst>}}',
    description: 'de duur van een dienst, zoals de afspraakpagina hem toont: “2 uur”',
    example: '{{duur:volwassenenfit}}',
  },
  {
    token: '{{prijs:<aanbod>}}',
    description: 'de prijsregel van een aanbod, zoals /aanbod hem toont',
    example: '{{prijs:zadelanalyse}}',
  },
  {
    token: '{{prijs:<aanbod>:<voor wie>}}',
    description:
      'één bedrag, bv. “€ 275”; voor wie is all, adult of youth (de prijs van die variant)',
    example: '{{prijs:bikefit-huidige-fiets:adult}}',
  },
  {
    token: '{{extra:<aanbod>}}',
    description: 'een extra zonder keuzes: “€ 85 en 30 minuten extra”',
    example: '{{extra:voetanalyse}}',
  },
  {
    token: '{{extra:<aanbod>:<keuze>}}',
    description:
      'één keuze van een extra, op dezelfde manier: “€ 75 en 30 minuten extra” (de sleutel van de keuze staat bij de keuze, bij het aanbod)',
    example: '{{extra:bikefit-tweede-fiets:zelfde-type}}',
  },
  fact('telefoon', 'het telefoonnummer (Instellingen → Contact)'),
  fact('telefoon-href', 'de telefoonlink, bv. tel:+32473952633, voor in een knop of link'),
  fact('e-mail', 'het e-mailadres (Instellingen → Contact); als link: mailto:{{e-mail}}'),
  fact('adres', 'het adres van de studio op één regel (Instellingen → Contact)'),
  fact('adres-studio', 'het adres van de standaardlocatie voor afspraken (Beheer → Locaties)'),
  fact('bedrijf', 'de juridische naam (Instellingen → Bedrijfsgegevens)'),
  fact('zetel', 'de maatschappelijke zetel op één regel (Instellingen → Bedrijfsgegevens)'),
  fact('kbo', 'het ondernemingsnummer (Instellingen → Bedrijfsgegevens)'),
  fact('btw', 'het btw-nummer (Instellingen → Bedrijfsgegevens)'),
  fact(
    'opvolging:volwassene',
    'hoe lang probleemopvolging bij een volwassene inbegrepen is: “zes maanden” (Instellingen → Regels)',
  ),
  fact(
    'tweede-bezoek-gratis',
    'tot wanneer een tweede bezoek gratis is: “zes maanden” (Instellingen → Regels)',
  ),
  fact(
    'cadeaubon-geldigheid',
    'hoe lang een cadeaubon geldig is: “een jaar” (Instellingen → Regels)',
  ),
];
