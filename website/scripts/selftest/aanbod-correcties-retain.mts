/**
 * Self-test section 17d, part 7 (`aanbod-correcties.mts` calls it after part 6):
 * `--staging-retain-toshoni`, Toshoni's decision for staging of 27 Oct 2026, 15:12:
 * Toshoni Van Craen stays a provider and keeps every offering. On staging's state
 * (`seedStaging`) with every other provider row taken out, so that he is the only
 * one, as on staging:
 *
 *  - the dry run in that mode is clean: no youth package, his line says he is
 *    kept, no subscription moves; without the flag the same database still stops;
 *  - the apply keeps every offering he had and asks no guardian on Jeugdfit; the
 *    verify finds him in the public provider list; the backup and the audit entry record the
 *    mode; then a dry run finds nothing, a second apply writes nothing, and a dry
 *    run without the flag would take him off again (it stops);
 *  - the restore of that backup gives the state before back, his offerings intact;
 *  - the flag next to a restore is refused; with a second provider (production's
 *    shape) it stops the dry run (`!`) and the apply refuses before any write.
 *
 * The sections before 17d leave providers with bookings, which a delete refuses
 * (`restrict`): {@link shelveProvidersExcept} takes them out with what hangs on them
 * and every row is back before this returns; the section's clean-up does the rest.
 */
import * as orm from 'drizzle-orm';
import type { CmsDatabase } from '@/db/cms';
import { cmsBookingAddons } from '@/db/cms-offering-schema';
import { readCorrectiesBackup } from '../lib/aanbod-correcties-backup.mjs';
import { canonicalJson } from '../lib/aanbod-correcties-targets.mjs';
import {
  diffPrints,
  fingerprint,
  planLines,
  type CorrectiesKit,
  type CorrectiesSectionContext,
  type State,
} from './aanbod-correcties-kit.mjs';
import { seedStaging, STAGING_LOGIN, STAGING_NAME } from './aanbod-correcties-staging.mjs';

const { eq, inArray, ne } = orm;

type Schema = typeof import('@/db/cms-schema');

const RETAIN = 'staging-retain';
const MODE_LINE =
  '→ provider mode: staging retain — Toshoni stays a provider with every offering (staging only)';
const BLOCKED = '→ dry run: blocked — fix the items marked ! first';
/** The stop on a database with a second provider, as production has. */
const TWO_PROVIDERS =
  'provider Toshoni: --staging-retain-toshoni is for a database whose only provider is Toshoni (staging); this one has 2 provider(s) — run without it';

/** Rows as one comparable string: each row as canonical JSON, sorted. */
const printOf = (tables: Record<string, readonly object[]>) =>
  canonicalJson(
    Object.fromEntries(
      Object.entries(tables).map(([name, rows]) => [
        name,
        rows.map((row) => canonicalJson(row)).sort(),
      ]),
    ),
  );

/**
 * Every provider but `keepId` out of the database, with what hangs on them: their
 * hours, exceptions and subscriptions, and their bookings with the bookings' extra's
 * and the link a review has to one. `putBack` writes every row back as it was;
 * `print` and `printNow` compare the two states.
 */
async function shelveProvidersExcept(db: CmsDatabase, schema: Schema, keepId: string) {
  const { cmsProviders, cmsBusinessHours, cmsAvailabilityExceptions } = schema;
  const { cmsProviderServices, cmsBookings, cmsReviews } = schema;
  const read = async () => {
    const providers = await db.select().from(cmsProviders).where(ne(cmsProviders.id, keepId));
    const ids = providers.map((row) => row.id);
    const bookings =
      ids.length > 0
        ? await db.select().from(cmsBookings).where(inArray(cmsBookings.providerId, ids))
        : [];
    const bookingIds = bookings.map((row) => row.id);
    const byBooking = bookingIds.length > 0;
    return {
      ids,
      bookingIds,
      providers,
      hours:
        ids.length > 0
          ? await db
              .select()
              .from(cmsBusinessHours)
              .where(inArray(cmsBusinessHours.providerId, ids))
          : [],
      exceptions:
        ids.length > 0
          ? await db
              .select()
              .from(cmsAvailabilityExceptions)
              .where(inArray(cmsAvailabilityExceptions.providerId, ids))
          : [],
      subscriptions:
        ids.length > 0
          ? await db
              .select()
              .from(cmsProviderServices)
              .where(inArray(cmsProviderServices.providerId, ids))
          : [],
      bookings,
      extras: byBooking
        ? await db
            .select()
            .from(cmsBookingAddons)
            .where(inArray(cmsBookingAddons.bookingId, bookingIds))
        : [],
      reviews: byBooking
        ? await db
            .select({ id: cmsReviews.id, bookingId: cmsReviews.bookingId })
            .from(cmsReviews)
            .where(inArray(cmsReviews.bookingId, bookingIds))
        : [],
    };
  };
  const shelf = await read();
  const printNow = async () => {
    const { ids, bookingIds, ...rows } = await read();
    void ids;
    void bookingIds;
    return printOf(rows);
  };
  const print = await printNow();
  // Bookings first: a provider that has some cannot be deleted. Their extra's go with them.
  if (shelf.bookingIds.length > 0) {
    await db.delete(cmsBookings).where(inArray(cmsBookings.id, shelf.bookingIds));
  }
  if (shelf.ids.length > 0) {
    await db.delete(cmsProviders).where(inArray(cmsProviders.id, shelf.ids));
  }
  const putBack = async () => {
    const { providers, hours, exceptions, subscriptions, bookings, extras, reviews } = shelf;
    if (providers.length > 0) await db.insert(cmsProviders).values(providers);
    if (hours.length > 0) await db.insert(cmsBusinessHours).values(hours);
    if (exceptions.length > 0) await db.insert(cmsAvailabilityExceptions).values(exceptions);
    if (subscriptions.length > 0) await db.insert(cmsProviderServices).values(subscriptions);
    if (bookings.length > 0) await db.insert(cmsBookings).values(bookings);
    if (extras.length > 0) await db.insert(cmsBookingAddons).values(extras);
    for (const review of reviews) {
      await db
        .update(cmsReviews)
        .set({ bookingId: review.bookingId })
        .where(eq(cmsReviews.id, review.id));
    }
  };
  return {
    count: shelf.ids.length,
    bookings: shelf.bookingIds.length,
    print,
    printNow,
    putBack,
  };
}

export async function retainChecks(env: {
  ctx: CorrectiesSectionContext;
  kit: CorrectiesKit;
  /** The tables as the section found them (`snapshotState`). */
  original: State;
}): Promise<void> {
  const { ctx, kit } = env;
  const { db, check } = ctx;
  const { schema, lines, run, attempt, applyWatched, backupPathOf, auditCount } = kit;
  const { subscriptions, serviceRow } = kit;
  const { listPublicProviders } = await import('@/lib/booking/content');
  const has = (prefix: string, ...parts: string[]) =>
    lines.some((line) => line.startsWith(prefix) && parts.every((part) => line.includes(part)));
  const blockers = () => lines.filter((line) => line.startsWith('!'));

  // --- staging as it is on 27 Oct 2026: Toshoni Van Craen is the only provider row ----------------
  const { fx } = await seedStaging(env);
  const shelf = await shelveProvidersExcept(db, schema, fx.toshoniId);
  try {
    const his = await subscriptions(fx.toshoniId);
    const providerCount = (await db.select().from(schema.cmsProviders)).length;
    const staging = await fingerprint(db, schema);

    // --- the dry run with the flag ----------------------------------------------------------------
    await run({ apply: false, restore: null, providerMode: RETAIN });
    const planned = [...lines];
    check(
      `staging, ${STAGING_NAME} the only provider row (${shelf.count} others set aside): with --staging-retain-toshoni the dry run is clean; no youth package, Jeugdfit asks no guardian, he is kept with his ${his.length} offerings, no subscription moves; his login is never printed`,
      providerCount === 1 &&
        his.length === 3 &&
        planned[0] === MODE_LINE &&
        blockers().length === 0 &&
        has('~ service jeugdfit — requiresGuardian: true → false') &&
        !planLines(planned).some((line) => /-pakket|volledig pakket|^. variant /.test(line)) &&
        planned.includes(
          `= provider ${STAGING_NAME} — kept as provider (--staging-retain-toshoni): ${his.length} offering(s) stay`,
        ) &&
        !planned.some((line) => /offering\(s\) removed|provider list: cached/.test(line)) &&
        planned.some(
          (line) =>
            line.startsWith('= guards: ') &&
            line.includes(', providers 1, ') &&
            line.endsWith(`, subscriptions ${his.length}`),
        ) &&
        planned.some(
          (line) =>
            line.startsWith('→ after the apply: blocks ') &&
            !/variants|services|subscriptions/.test(line),
        ) &&
        !planned.some((line) => line.includes(STAGING_LOGIN)) &&
        planned.at(-1) === '→ dry run: run again with --apply to write',
      planLines(planned)
        .filter((line) => /^!|provider|service jeugdfit/.test(line))
        .concat(planned.filter((line) => line.startsWith('→ after')))
        .join(' | '),
    );

    // Without the flag the same database still stops (part 6 has the rest).
    await run({ apply: false, restore: null });
    check(
      'without the flag the same database still stops: every fit he alone offers',
      lines[0] !== MODE_LINE &&
        has(`! provider ${STAGING_NAME}: service jeugdfit would be left without a provider`) &&
        lines.at(-1) === BLOCKED,
      blockers().join(' | '),
    );

    // --- the apply with the flag ------------------------------------------------------------------
    const applyAudits = await auditCount('patch.aanbod-correcties.apply');
    const applyError = await attempt(() =>
      run({ apply: true, restore: null, providerMode: RETAIN }),
    );
    const applied = [...lines];
    const backupPath = backupPathOf();
    const youth = await serviceRow('jeugdfit');
    const after = await subscriptions(fx.toshoniId);
    const keptAll = his.every((row) =>
      after.some(
        (entry) => entry.serviceId === row.serviceId && entry.locationId === row.locationId,
      ),
    );
    const listed = (await listPublicProviders()).map((provider) => provider.displayName);
    check(
      `retain apply: verified; ${STAGING_NAME} keeps every offering he had, and nothing more, and stays in the public provider list; Jeugdfit asks no guardian; no package service`,
      applyError === '' &&
        applied.includes('✓ apply complete') &&
        applied.some(
          (line) => line.startsWith('✓ row counts as planned (') && !line.includes('subscriptions'),
        ) &&
        applied.includes(
          `✓ provider ${STAGING_NAME} kept (--staging-retain-toshoni): in the public provider list, with every offering he had`,
        ) &&
        !applied.some((line) => line.startsWith(`~ provider ${STAGING_NAME}`)) &&
        keptAll &&
        after.length === his.length &&
        listed.join() === STAGING_NAME &&
        youth?.requiresGuardian === false &&
        (await serviceRow('jeugdfit-pakket')) === null,
      applyError ||
        `${after.length} offerings, listed: ${listed.join()}, guardian ${youth?.requiresGuardian}`,
    );
    const backup = backupPath ? await readCorrectiesBackup(backupPath) : null;
    const audits = await db
      .select({ metadata: schema.cmsAuditLog.metadata })
      .from(schema.cmsAuditLog)
      .where(eq(schema.cmsAuditLog.action, 'patch.aanbod-correcties.apply'));
    check(
      'retain apply: the backup and the audit entry record the mode; the backup removes none of his offerings and holds the guardian rule of Jeugdfit for a restore',
      backup?.providerMode === RETAIN &&
        backup.subscriptions.providerId === fx.toshoniId &&
        backup.subscriptions.removed.length === 0 &&
        backup.services.updated.some(
          (entry) => entry.slug === 'jeugdfit' && entry.fields.includes('requiresGuardian'),
        ) &&
        audits.length === applyAudits + 1 &&
        audits.filter((entry) => entry.metadata?.providerMode === RETAIN).length === 1,
      `backup ${backup?.providerMode}, removed ${backup?.subscriptions.removed.length}`,
    );

    // --- idempotent ---------------------------------------------------------------------------------
    await run({ apply: false, restore: null, providerMode: RETAIN });
    check(
      'retain: a dry run after the apply finds nothing to do; he is still kept',
      lines.at(-1) === '= dry run: nothing to do' &&
        planLines(lines).every((line) => line.startsWith('=')) &&
        lines.includes(
          `= provider ${STAGING_NAME} — kept as provider (--staging-retain-toshoni): ${his.length} offering(s) stay`,
        ),
      planLines(lines)
        .filter((line) => !line.startsWith('='))
        .join(' | '),
    );
    const appliedPrint = await fingerprint(db, schema);
    await run({ apply: true, restore: null, providerMode: RETAIN });
    check(
      'retain: a second apply writes nothing: no backup, no audit entry, no row',
      lines.includes('= nothing written') &&
        !lines.some((line) => line.includes('backup written')) &&
        (await auditCount('patch.aanbod-correcties.apply')) === applyAudits + 1 &&
        (await fingerprint(db, schema)) === appliedPrint,
    );
    await run({ apply: false, restore: null });
    check(
      'after a retain apply a dry run WITHOUT the flag would take him off again, and stops (so every staging run carries the flag)',
      has(`~ provider ${STAGING_NAME} — ${his.length} offering(s) removed: `) &&
        has(`! provider ${STAGING_NAME}: service jeugdfit would be left without a provider`) &&
        // Nothing else is pending, so the verdict carries `=`, as it always has.
        lines.at(-1) === '= dry run: blocked — fix the items marked ! first',
      `${blockers().join(' | ')} | ${lines.at(-1)}`,
    );

    // --- restore: takes no mode, gives the state before back --------------------------------------
    const refusedMode = backupPath
      ? await attempt(() => run({ apply: false, restore: backupPath, providerMode: RETAIN }))
      : 'no backup';
    check(
      'the flag next to --restore is refused before anything is read or written',
      refusedMode.startsWith('--staging-retain-toshoni and --restore cannot be combined') &&
        (await fingerprint(db, schema)) === appliedPrint,
      refusedMode,
    );
    const restoreError = backupPath
      ? await attempt(() => run({ apply: false, restore: backupPath }))
      : 'no backup';
    const restored = await fingerprint(db, schema);
    const back = await subscriptions(fx.toshoniId);
    check(
      `retain restore: every table as before the apply; ${STAGING_NAME} offers exactly what he did, Jeugdfit asks for a guardian again`,
      restoreError === '' &&
        restored === staging &&
        (await serviceRow('jeugdfit'))?.requiresGuardian === true &&
        canonicalJson(back) === canonicalJson(his),
      restoreError || diffPrints(staging, restored),
    );

    // --- production's shape: a second provider ------------------------------------------------------
    const [second] = await db
      .insert(schema.cmsUsers)
      .values({
        email: 'tweede-17d@selftest.local',
        name: 'Tweede aanbieder',
        role: 'provider',
        passwordHash: 'not-a-hash',
      })
      .returning({ id: schema.cmsUsers.id });
    await db
      .insert(schema.cmsProviders)
      .values({ userId: second.id, displayName: 'Tweede aanbieder' });
    try {
      await run({ apply: false, restore: null, providerMode: RETAIN });
      const twoLines = [...lines];
      const refused = await applyWatched(RETAIN);
      check(
        'with a second provider (production has one) the flag stops the dry run (!) and --apply refuses before any write: no write call, session, backup, audit entry or row',
        twoLines.filter((line) => line.startsWith('!')).join(' | ') === `! ${TWO_PROVIDERS}` &&
          twoLines.at(-1) === BLOCKED &&
          refused.refusal === `patch refused:\n  - ${TWO_PROVIDERS}` &&
          refused.untouched,
        `${twoLines.filter((line) => line.startsWith('!')).join(' | ')} | ${refused.detail}`,
      );
    } finally {
      await db.delete(schema.cmsUsers).where(eq(schema.cmsUsers.id, second.id)); // and its provider
    }
  } finally {
    await shelf.putBack();
  }
  check(
    `the ${shelf.count} providers set aside are back with their hours, offerings, bookings, extra's and reviews, as they were`,
    (await shelf.printNow()) === shelf.print,
    `${shelf.bookings} booking(s) set aside and back`,
  );
}
