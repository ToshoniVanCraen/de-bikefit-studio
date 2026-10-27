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
 *    (`!`, with the replacement to add), the youth package would be offered by
 *    nobody, which blocks too, and `--apply` refuses before any write (no write
 *    call, so no session; no backup, no audit entry, no row);
 *  - a replacement provider who offers the fits: the dry run is clean, the apply
 *    takes Toshoni Van Craen off and gives the package to the replacement only, a
 *    second dry run finds nothing, the restore puts every table back;
 *  - his profile renamed "Toshoni V." on another login matches nobody: the dry
 *    run stops (`!`) instead of treating him as anybody else, and `--apply`
 *    refuses before any write;
 *  - a meta description and a meta title of neither state still block (`!`).
 *
 * Starts again from the section's clean slate with the fixture of 20 Oct 2026
 * (`seedBefore`), changed where staging differs; the section's clean-up gives the
 * database back.
 */
import { readdir } from 'node:fs/promises';
import * as orm from 'drizzle-orm';
import { AFSPRAAK_PAGE } from '@/lib/studio/seed-content/appointment';
import { runAanbodCorrectiesPatch } from '../lib/aanbod-correcties-patch.mjs';
import { withAdminSession } from '../lib/aanbod-rollout-run.mjs';
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
const SEEDED_AFSPRAAK_META =
  'Bikefits in Ninove gaan door op afspraak. Bel 0473 95 26 33, kies je fit en breng je fiets, schoenen en fietskleding mee.';
/** The same text after an editor's change: neither state. */
const EDITED_AFSPRAAK_META =
  'Bikefits in Ninove gaan door op afspraak. Bel ons, kies je fit en breng je fiets, schoenen en fietskleding mee.';
/** Staging's provider profile, and the login it has (the default of `cms:seed-booking`). */
const STAGING_NAME = 'Toshoni Van Craen';
const STAGING_LOGIN = 'toshoni@gmail.com';
/** A login that is not the seed's, for a profile renamed so that no rule knows it. */
const RENAMED_LOGIN = 'toshoni.v@selftest.local';
/** The stop when the database has providers and none of them is Toshoni. */
const NO_MATCH =
  'provider Toshoni: no provider profile matches (display name "Toshoni" or "Toshoni Van Craen", or the login of cms:seed-booking) — stop and report; check Beheer → Aanbieders, do not rename a profile blindly';

const FITS = ['volwassenenfit', 'jeugdfit', 'voetanalyse'];
const WRITES = ['insert', 'update', 'delete', 'execute', 'transaction', 'batch'];

export async function stagingChecks(env: {
  ctx: CorrectiesSectionContext;
  kit: CorrectiesKit;
  /** The tables as the section found them (`snapshotState`). */
  original: State;
}): Promise<void> {
  const { ctx, kit, original } = env;
  const { db, check, cookieJar } = ctx;
  const { schema, lines, run, backupPathOf, auditCount, sessions } = kit;
  const { subscriptions, serviceRow, pageRow } = kit;
  const { listPublicProviders } = await import('@/lib/booking/content');
  const has = (prefix: string, ...parts: string[]) =>
    lines.some((line) => line.startsWith(prefix) && parts.every((part) => line.includes(part)));
  /** The error a run ends with ('' when it ends well), so a refusal is a value. */
  const attempt = async (work: () => Promise<unknown>) => {
    try {
      await work();
      return '';
    } catch (error) {
      return error instanceof Error ? error.message : String(error);
    }
  };
  const backups = async () =>
    (await readdir(ctx.backupDir).catch(() => [] as string[])).sort().join();
  /**
   * `--apply` through the CLI's entry point on a handle that counts every write
   * call: the refusal ('' when it ran), and whether nothing moved (no write call,
   * sessions, audit entries, backup files, cookie and every table as they were).
   */
  const applyWatched = async () => {
    const writes: string[] = [];
    const watched = new Proxy(db, {
      get(target, property, receiver) {
        if (typeof property === 'string' && WRITES.includes(property)) writes.push(property);
        const value = Reflect.get(target, property, receiver);
        return typeof value === 'function' ? value.bind(target) : value;
      },
    });
    const before = [
      await sessions(),
      await auditCount(),
      await backups(),
      await fingerprint(db, schema),
    ];
    const refusal = await attempt(() =>
      runAanbodCorrectiesPatch(
        { apply: true, restore: null, backupDir: ctx.backupDir },
        { db: watched, driver: 'pglite', cookieJar, log: () => {} },
      ),
    );
    const after = [
      await sessions(),
      await auditCount(),
      await backups(),
      await fingerprint(db, schema),
    ];
    return {
      refusal,
      untouched:
        writes.length === 0 &&
        !cookieJar.has('cms_session') &&
        after.every((v, i) => v === before[i]),
      detail: `writes: ${writes.join() || 'none'} | ${refusal.split('\n').slice(0, 3).join(' ')}`,
    };
  };
  /** The page's own texts, saved and published the way an editor (or a seed) does. */
  const editPage = async (
    slug: string,
    texts: { metaTitle?: string; metaDescription?: string },
  ) => {
    const page = await pageRow(slug);
    if (!page) throw new Error(`17d staging: no page /${slug}`);
    await withAdminSession({ db, cookieJar }, ctx.admin.id, 'cms-selftest-17d', async () => {
      const repo = await import('@/lib/cms/repo');
      const saved = await repo.updatePage(page.id, texts);
      if (!saved.ok) throw new Error(`17d staging: /${slug}: ${saved.message}`);
      const published = await repo.publishPage(page.id);
      if (!published.ok) throw new Error(`17d staging: /${slug}: ${published.message}`);
    });
  };

  // --- staging as it was on 27 Oct 2026 ----------------------------------------------------------
  await restoreState(db, schema, original);
  const fx = await seedBefore(kit, ctx);
  const [{ userId }] = await db
    .select({ userId: schema.cmsProviders.userId })
    .from(schema.cmsProviders)
    .where(eq(schema.cmsProviders.id, fx.toshoniId));
  /** Toshoni's profile: its display name and the login of its user. */
  const setProfile = async (displayName: string, login: string) => {
    await db.update(schema.cmsUsers).set({ email: login }).where(eq(schema.cmsUsers.id, userId));
    await db
      .update(schema.cmsProviders)
      .set({ displayName })
      .where(eq(schema.cmsProviders.id, fx.toshoniId));
  };
  await setProfile(STAGING_NAME, STAGING_LOGIN);
  // One provider: what Winston offers in the fixture comes back later as the replacement.
  const replacement = await subscriptions(fx.winstonId);
  await db
    .delete(schema.cmsProviderServices)
    .where(eq(schema.cmsProviderServices.providerId, fx.winstonId));
  await editPage('afspraak', { metaDescription: SEEDED_AFSPRAAK_META });
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
    'staging: Toshoni Van Craen is found; the dry run stops on every fit he alone offers and on a package nobody would offer, saying what to add; his login is never printed',
    has('~ provider Toshoni Van Craen — 3 offering(s) removed: ') &&
      FITS.every((slug) =>
        planned.includes(
          `! provider Toshoni Van Craen: service ${slug} would be left without a provider — add a replacement provider for it in Beheer → Aanbieders first`,
        ),
      ) &&
      planned.includes(
        '! offering bikefit-huidige-fiets: Jeugd – volledig pakket would be offered by no provider — add a replacement provider for jeugdfit in Beheer → Aanbieders first',
      ) &&
      !planned.some((line) => /offered by \d|^= provider|provider list: cached/.test(line)) &&
      !planned.some((line) => line.includes(STAGING_LOGIN)) &&
      planned.at(-1) === '→ dry run: blocked — fix the items marked ! first',
    planned.filter((line) => /^!|provider/.test(line)).join(' | '),
  );

  // --- the apply refuses before any write ---------------------------------------------------------
  const refused = await applyWatched();
  check(
    'staging: --apply refuses with the same list before any write: no write call (not even a session), no backup, no audit entry, no cookie, no row; no package service, so none for Toshoni Van Craen',
    refused.refusal.startsWith('patch refused:') &&
      refused.refusal.includes(
        'provider Toshoni Van Craen: service jeugdfit would be left without a provider',
      ) &&
      !refused.refusal.includes(STAGING_LOGIN) &&
      refused.untouched &&
      (await fingerprint(db, schema)) === staging &&
      (await serviceRow('jeugdfit-pakket')) === null,
    refused.detail,
  );

  // --- a replacement provider who offers the fits ---------------------------------------------------
  for (const row of replacement) await db.insert(schema.cmsProviderServices).values(row);
  await run({ apply: false, restore: null });
  check(
    'staging with a replacement provider: the dry run is clean; Toshoni Van Craen’s offerings go, the package goes to the replacement',
    !lines.some((line) => line.startsWith('!')) &&
      has('~ provider Toshoni Van Craen — 3 offering(s) removed: ') &&
      has(
        '~ variant bikefit-huidige-fiets — ',
        'new service jeugdfit-pakket',
        'offered by 1 provider(s)',
      ) &&
      has('→ provider list: cached for up to 5 minutes, so Toshoni Van Craen leaves') &&
      lines.at(-1) === '→ dry run: run again with --apply to write',
    planLines(lines)
      .filter((line) => /^!|provider/.test(line))
      .join(' | '),
  );
  const beforeApply = await fingerprint(db, schema);
  const applyError = await attempt(() => run({ apply: true, restore: null }));
  const backupPath = backupPathOf();
  const pack = await serviceRow('jeugdfit-pakket');
  const packOffered = pack
    ? (
        await db
          .select({ providerId: schema.cmsProviderServices.providerId })
          .from(schema.cmsProviderServices)
          .where(eq(schema.cmsProviderServices.serviceId, pack.id))
      ).map((row) => row.providerId)
    : [];
  const afspraak = await pageRow('afspraak');
  const live = afspraak?.publishedSnapshot as { seo?: { metaDescription?: unknown } } | null;
  const target = AFSPRAAK_PAGE.metaDescription;
  check(
    'staging apply: Toshoni Van Craen offers nothing and leaves the public list (his profile stays); the package is offered by the replacement only; /afspraak has the new meta description, also live',
    applyError === '' &&
      lines.includes('✓ apply complete') &&
      Boolean(backupPath) &&
      (await subscriptions(fx.toshoniId)).length === 0 &&
      packOffered.join() === fx.winstonId &&
      (await listPublicProviders()).map((entry) => entry.displayName).join() === 'Winston' &&
      afspraak?.metaDescription === target &&
      live?.seo?.metaDescription === target,
    applyError || `package offered by ${packOffered.length}`,
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
    'staging restore: every table as before the apply; Toshoni Van Craen offers the fits again, the package service is gone, /afspraak has the seeded text again',
    restoreError === '' &&
      restored === beforeApply &&
      (await serviceRow('jeugdfit-pakket')) === null &&
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
