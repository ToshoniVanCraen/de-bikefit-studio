/**
 * The first booking provider `npm run cms:seed-booking` creates when no
 * `PROVIDER_EMAIL` / `PROVIDER_NAME` is given: Toshoni's login and display name.
 * Shared by that seed and by `cms:patch-aanbod-correcties`, which recognises him by
 * this login (`aanbod-correcties-youth.mts`). Plain data, no I/O.
 *
 * Script-only on purpose: a personal login has no place in a module the site
 * bundles. Compare it, never print it (CLAUDE.md §4).
 */
export const FIRST_PROVIDER = { email: 'toshoni@gmail.com', displayName: 'Toshoni' } as const;
