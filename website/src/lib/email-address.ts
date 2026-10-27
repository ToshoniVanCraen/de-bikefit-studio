/**
 * How the CMS compares and stores a login e-mail address: trimmed and in lower
 * case, so " Someone@Example.COM " and "someone@example.com" are one login. The one
 * helper for it (CLAUDE.md §3): sign-in and user management (`cms/auth.ts`,
 * `cms/users.ts`) and the scripts that look a login up (`cms:seed-booking`,
 * `cms:patch-aanbod-correcties`) all go through it. Pure: no I/O, no Next.
 */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}
