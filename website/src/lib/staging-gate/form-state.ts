/**
 * Shape of the staging gate's login form state, shared by the server action
 * (`./actions.ts`) and the client form under `src/app/staging-toegang/`.
 * Client-safe on purpose: no `server-only`, no database, no Node APIs.
 * Design: `docs/staging-gate.md` §3.
 */
/** Form field names the login action reads. */
export const GATE_FIELD_IDENTIFIER = 'identifier';
export const GATE_FIELD_PASSWORD = 'password';
export const GATE_FIELD_NEXT = 'next';

/** Exact copy from Max's functional brief (2026-10-18). */
export const GATE_COPY = {
  title: 'Stagingomgeving',
  explanation: 'Deze testomgeving is alleen toegankelijk voor uitgenodigde reviewers.',
  identifierLabel: 'E-mailadres of gebruikersnaam',
  passwordLabel: 'Wachtwoord',
  submit: 'Inloggen',
  help: 'Toegang nodig of lukt inloggen niet? Neem contact op met Toshoni.',
  cmsDistinction: 'Dit is niet de login voor het CMS.',
  expired: 'Je sessie is verlopen. Log opnieuw in om verder te gaan.',
  loggedOut: 'Je bent uitgelogd.',
  logout: 'Uitloggen',
  invalid: 'Aanmelden is niet gelukt. Controleer je gegevens.',
  tooMany: 'Te veel pogingen. Probeer het over een kwartier opnieuw.',
  missingFields: 'Vul je e-mailadres of gebruikersnaam en je wachtwoord in.',
  busy: 'Het is even druk. Probeer het over een minuut opnieuw.',
  failed: 'Er ging iets mis. Probeer het opnieuw.',
} as const;

/** Fixed, non-secret UI states after the dedicated login POST redirects back. */
export function gateLoginFailureMessage(value: unknown): string | null {
  if (value === 'ongeldig') return GATE_COPY.invalid;
  if (value === 'limiet') return GATE_COPY.tooMany;
  if (value === 'ontbreekt') return GATE_COPY.missingFields;
  if (value === 'druk') return GATE_COPY.busy;
  if (value === 'mislukt') return GATE_COPY.failed;
  return null;
}
