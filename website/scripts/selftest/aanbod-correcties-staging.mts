/**
 * Self-test section 17d, part 6 (`aanbod-correcties.mts` calls it after the guards):
 * the state staging held at the dry run of 27 Oct 2026, where the patch stopped on
 * a text it should have accepted and missed the stop it should have made.
 *
 *  - `/afspraak` carries the meta description of the first seed (24 Sep 2026), which
 *    every `cms:seed -- --refresh-slug afspraak` since left alone: an old state, so
 *    it moves to the new text, and a second run finds nothing;
 *  - one provider, "Toshoni Van Craen", who logs in as the first provider of
 *    `cms:seed-booking` and alone offers the fits: the dry run names him and blocks
 *    (`!`, with the replacement to add), and `--apply` refuses before any write (no
 *    write call, so no session; no backup, no audit entry, no row);
 *  - a replacement provider who offers the fits: the dry run is clean, the apply
 *    takes Toshoni Van Craen off, makes no youth package and asks no guardian on
 *    Jeugdfit, a second dry run finds nothing, the restore puts every table back;
 *  - his profile renamed "Toshoni V." on another login matches nobody: the dry
 *    run stops (`!`) instead of treating him as anybody else, and `--apply`
 *    refuses before any write;
 *  - a meta description and a meta title of neither state still block (`!`).
 *
 * Starts again from the section's clean slate with the fixture of 20 Oct 2026
 * (`seedBefore`), changed where staging differs (`seedStaging`, which part 7,
 * `aanbod-correcties-retain.mts`, starts from too); the section's clean-up gives
 * the database back.
 */
import * as orm from 'drizzle-orm';
import { AFSPRAAK_PAGE } from '@/lib/studio/seed-content/appointment';
import { seedBefore } from './aanbod-correcties-fixture.mjs';
import {
  diffPrints,
  fingerprint,
  planLines,
  restoreState,
  type CorrectiesKit,
  type CorrectiesSectionContext,
  type State,
} from './aanbod-correcties-kit.mjs';

const { eq } = orm;

/** Staging's `/afspraak` meta description on 27 Oct 2026, exactly: the first seed's text. */
export const SEEDED_AFSPRAAK_META =
  'Bikefits in Ninove gaan door op afspraak. Bel 0473 95 26 33, kies je fit en breng je fiets, schoenen en fietskleding mee.';
/** The same text after an editor's change: neither state. */
const EDITED_AFSPRAAK_META =
  'Bikefits in Ninove gaan door op afspraak. Bel ons, kies je fit en breng je fiets, schoenen en fietskleding mee.';
/** Staging's provider profile, and the login it has (the default of `cms:seed-booking`). */
export const STAGING_NAME = 'Toshoni Van Craen';
export const STAGING_LOGIN = 'toshoni@gmail.com';
/** A login that is not the seed's, for a profile renamed so that no rule knows it. */
const RENAMED_LOGIN = 'toshoni.v@selftest.local';
/** The stop when the database has providers and none of them is Toshoni. */
const NO_MATCH =
  'provider Toshoni: no provider profile matches (display name "Toshoni" or "Toshoni Van Craen", or the login of cms:seed-booking) — stop and report; check Beheer → Aanbieders, do not rename a profile blindly';

const FITS = ['volwassenenfit', 'jeugdfit', 'voetanalyse'];

type StagingEnv = {
  ctx: CorrectiesSectionContext;
  kit: CorrectiesKit;
  /** The tables as the section found them (`snapshotState`). */
  original: State;
};

/**
 * Staging as it was on 27 Oct 2026, on the section's clean slate: the fixture, Toshoni's
 * profile as staging has it ("Toshoni Van Craen" on the seed's login), nobody else
 * offering anything (Winston's offerings are handed back, for a replacement) and the
 * first seed's meta description on `/afspraak`, published.
 */
export async function seedStaging(env: StagingEnv) {
  const { ctx, kit, original } = env;
  const { db } = ctx;
  const { schema, subscriptions, editPage, setProviderProfile } = kit;
  await restoreState(db, schema, original);
  const fx = await seedBefore(kit, ctx);
  await setProviderProfile(fx.toshoniId, STAGING_NAME, STAGING_LOGIN);
  // One provider: what Winston offers in the fixture comes back later as the replacement.
  const replacement = await subscriptions(fx.winstonId);
  await db
    .delete(schema.cmsProviderServices)
    .where(eq(schema.cmsProviderServices.providerId, fx.winstonId));
  await editPage('afspraak', { metaDescription: SEEDED_AFSPRAAK_META });
  return { fx, replacement };
}

export async function stagingChecks(env: StagingEnv): Promise<void> {
  const { ctx, kit } = env;
  const { db, check } = ctx;
  const { schema, lines, run, backupPathOf, attempt, applyWatched } = kit;
  const { subscriptions, serviceRow, pageRow, editPage, setProviderProfile } = kit;
  const { listPublicProviders } = await import('@/lib/booking/content');
  const has = (prefix: string, ...parts: string[]) =>
    lines.some((line) => line.startsWith(prefix) && parts.every((part) => line.includes(part)));

  // --- staging as it was on 27 Oct 2026 ----------------------------------------------------------
  const { fx, replacement } = await seedStaging(env);
  /** Toshoni's profile: its display name and the login of its user. */
  const setProfile = (displayName: string, login: string) =>
    setProviderProfile(fx.toshoniId, displayName, login);
  const staging = await fingerprint(db, schema);

  // --- the dry run ------------------------------------------------------------------------------
  await run({ apply: false, restore: null });
  const planned = [...lines];
  check(
    'staging: the seeded /afspraak meta description is an old state, planned to the new text; no blocker for the page',
    planned.some((line) =>
      line
        .trim()
        .startsWith(
          'metaDescription: "Bikefits in Ninove gaan door op afspraak. Bel 0473 95 26 33',
        ),
    ) &&
      has('~ page /afspraak — ', 'then publish') &&
      !planned.some((line) => line.startsWith('! page /afspraak')),
    planned.filter((line) => line.includes('afspraak')).join(' | '),
  );
  check(
    'staging: Toshoni Van Craen is found; the dry run stops on every fit he alone offers, saying what to add, and on nothing else; his login is never printed',
    has('~ provider Toshoni Van Craen — 3 offering(s) removed: ') &&
      planned
        .filter((line) => line.startsWith('!'))
        .sort()
        .join(' | ') ===
        FITS.map(
          (slug) =>
            `! provider Toshoni Van Craen: service ${slug} would be left without a provider — add a replacement provider for it in Beheer → Aanbieders first`,
        )
          .sort()
          .join(' | ') &&
      !planned.some((line) => /offered by \d|^= provider|provider list: cached/.test(line)) &&
      !planned.some((line) => line.includes(STAGING_LOGIN)) &&
      planned.at(-1) === '→ dry run: blocked — fix the items marked ! first',
    planned.filter((line) => /^!|provider/.test(line)).join(' | '),
  );

  // --- the apply refuses before any write ---------------------------------------------------------
  const refused = await applyWatched();
  check(
    'staging: --apply refuses with the same list before any write: no write call (not even a session), no backup, no audit entry, no cookie, no row; Jeugdfit still asks for a guardian',
    refused.refusal.startsWith('patch refused:') &&
      refused.refusal.includes(
        'provider Toshoni Van Craen: service jeugdfit would be left without a provider',
      ) &&
      !refused.refusal.includes(STAGING_LOGIN) &&
      refused.untouched &&
      (await fingerprint(db, schema)) === staging &&
      (await serviceRow('jeugdfit'))?.requiresGuardian === true,
    refused.detail,
  );

  // --- a replacement provider who offers the fits ---------------------------------------------------
  for (const row of replacement) await db.insert(schema.cmsProviderServices).values(row);
  await run({ apply: false, restore: null });
  check(
    'staging with a replacement provider: the dry run is clean; Toshoni Van Craen’s offerings go, Jeugdfit asks no guardian, no package is planned',
    !lines.some((line) => line.startsWith('!')) &&
      has('~ provider Toshoni Van Craen — 3 offering(s) removed: ') &&
      has('~ service jeugdfit — requiresGuardian: true → false') &&
      !planLines(lines).some((line) => /-pakket|volledig pakket|^. variant /.test(line)) &&
      has('→ provider list: cached for up to 5 minutes, so Toshoni Van Craen leaves') &&
      lines.at(-1) === '→ dry run: run again with --apply to write',
    planLines(lines)
      .filter((line) => /^!|provider/.test(line))
      .join(' | '),
  );
  const beforeApply = await fingerprint(db, schema);
  const applyError = await attempt(() => run({ apply: true, restore: null }));
  const backupPath = backupPathOf();
  const youth = await serviceRow('jeugdfit');
  const afspraak = await pageRow('afspraak');
  const live = afspraak?.publishedSnapshot as { seo?: { metaDescription?: unknown } } | null;
  const target = AFSPRAAK_PAGE.metaDescription;
  check(
    'staging apply: Toshoni Van Craen offers nothing and leaves the public list (his profile stays); the replacement keeps the fits; Jeugdfit asks no guardian; no package service; /afspraak has the new meta description, also live',
    applyError === '' &&
      lines.includes('✓ apply complete') &&
      Boolean(backupPath) &&
      (await subscriptions(fx.toshoniId)).length === 0 &&
      (await subscriptions(fx.winstonId)).length === replacement.length &&
      (await listPublicProviders()).map((entry) => entry.displayName).join() === 'Winston' &&
      youth?.requiresGuardian === false &&
      (await serviceRow('jeugdfit-pakket')) === null &&
      afspraak?.metaDescription === target &&
      live?.seo?.metaDescription === target,
    applyError || `guardian ${youth?.requiresGuardian}`,
  );
  await run({ apply: false, restore: null });
  check(
    'staging: a second dry run finds nothing to do',
    lines.at(-1) === '= dry run: nothing to do' &&
      planLines(lines).every((line) => line.startsWith('=')),
    planLines(lines)
      .filter((line) => !line.startsWith('='))
      .join(' | '),
  );
  const restoreError = backupPath
    ? await attempt(() => run({ apply: false, restore: backupPath }))
    : 'no backup';
  const restored = await fingerprint(db, schema);
  check(
    'staging restore: every table as before the apply; Toshoni Van Craen offers the fits again, Jeugdfit asks for a guardian again, /afspraak has the seeded text again',
    restoreError === '' &&
      restored === beforeApply &&
      (await serviceRow('jeugdfit'))?.requiresGuardian === true &&
      (await subscriptions(fx.toshoniId)).length === 3 &&
      (await pageRow('afspraak'))?.metaDescription === SEEDED_AFSPRAAK_META,
    restoreError || diffPrints(beforeApply, restored),
  );

  // --- a renamed profile on another login: nobody matches, so the patch stops ---------------------
  await setProfile('Toshoni V.', RENAMED_LOGIN);
  await run({ apply: false, restore: null });
  const unmatched = [...lines];
  const renamed = await applyWatched();
  check(
    'a profile renamed "Toshoni V." on another login matches nobody: the dry run stops (!), --apply refuses before any write (no write call, session, backup, audit entry or row); the login is never printed',
    unmatched.filter((line) => line.startsWith('!')).join(' | ') === `! ${NO_MATCH}` &&
      !unmatched.some((line) => line.startsWith('= provider') || line.includes(RENAMED_LOGIN)) &&
      unmatched.at(-1) === '→ dry run: blocked — fix the items marked ! first' &&
      renamed.refusal === `patch refused:\n  - ${NO_MATCH}` &&
      renamed.untouched,
    `${unmatched.filter((line) => line.startsWith('!')).join(' | ')} | ${renamed.detail}`,
  );
  await setProfile(STAGING_NAME, STAGING_LOGIN);

  // --- texts of neither state ---------------------------------------------------------------------
  await editPage('afspraak', { metaDescription: EDITED_AFSPRAAK_META });
  await editPage('', { metaTitle: 'Eigen titel van de redactie' });
  await run({ apply: false, restore: null });
  check(
    'a meta description and a meta title of neither state still block the dry run (!)',
    has(
      '! page /afspraak: meta description is "Bikefits in Ninove gaan door op afspraak. Bel ons',
    ) &&
      lines.includes(
        '! page /: meta title is "Eigen titel van de redactie", not the text it was rolled out with',
      ) &&
      lines.at(-1) === '→ dry run: blocked — fix the items marked ! first',
    lines.filter((line) => line.startsWith('!')).join(' | '),
  );
}
