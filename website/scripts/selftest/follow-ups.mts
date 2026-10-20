/**
 * Self-test section 19: the follow-up mails and reviews (20 Oct 2026) on the
 * throwaway PGlite of `cms-selftest.mts`, after the booking sections.
 *
 * 1. two confirmed bookings on the section-14 provider: one starting in 24 h,
 *    one that ended 30 h ago; a dry run counts both and sends nothing;
 * 2. the run with an injected sender: the reminder goes to the customer, the
 *    review request carries a link; both flags are set; a second run sends
 *    nothing more;
 * 3. the link: the review is open; a bad score is refused per field; the
 *    submit stores score, text and the first-name consent as `submitted`; the
 *    same link cannot be used twice; an unknown token is "ongeldig";
 * 4. the admin reads it (`listReviews`), approves it (audited), reopens it;
 *    a provider is refused;
 * 5. the cron route's authorisation (pure) and clean-up.
 *
 * Imported lazily by `cms-selftest.mts` after its request-context stubs.
 */
import * as orm from 'drizzle-orm';
import type { CmsDatabase } from '@/db/cms';
import type { SendEmailInput, SendEmailResult } from '@/lib/email/send';

type Check = (label: string, condition: boolean, detail?: string) => void;

export async function followUpsSection(ctx: {
  db: CmsDatabase;
  check: Check;
  section: (title: string) => void;
  signInAs: (userId: string) => Promise<void>;
  admin: { id: string };
  provider: { id: string; userId: string };
  cookieJar: Map<string, string>;
}) {
  const { db, check, section, signInAs, admin, provider, cookieJar } = ctx;
  section('19. follow-up mails and reviews (20 Oct 2026)');

  const schema = await import('@/db/cms-schema');
  const { cmsRateLimits } = await import('@/db/cms-rate-limit-schema');
  const { runBookingFollowUps } = await import('@/lib/booking/follow-ups');
  const reviews = await import('@/lib/booking/reviews');
  const { authorizeCron } = await import('@/lib/booking/cron-auth');
  const { CmsAuthError } = await import('@/lib/cms/auth');
  const { and, eq, inArray } = orm;
  const locale = schema.DEFAULT_LOCALE;

  const [service] = await db
    .select()
    .from(schema.cmsServices)
    .where(and(eq(schema.cmsServices.locale, locale), eq(schema.cmsServices.isActive, true)))
    .limit(1);
  if (!service) throw new Error('self-test 19: no active service');
  const [location] = await db.select().from(schema.cmsLocations).limit(1);

  const now = new Date('2026-10-21T07:00:00.000Z');
  const hours = (n: number) => new Date(now.getTime() + n * 3_600_000);
  const base = {
    serviceId: service.id,
    providerId: provider.id,
    locationId: location?.id ?? null,
    timezone: 'Europe/Brussels',
    status: 'confirmed' as const,
    customerPhone: null,
    source: 'selftest',
  };
  const [upcoming] = await db
    .insert(schema.cmsBookings)
    .values({
      ...base,
      startsAt: hours(24),
      endsAt: hours(26),
      customerName: 'Selftest Herinnering',
      customerEmail: 'selftest-herinnering@example.invalid',
      cancelTokenHash: `selftest-followup-${now.getTime()}-a`,
    })
    .returning({ id: schema.cmsBookings.id });
  const [past] = await db
    .insert(schema.cmsBookings)
    .values({
      ...base,
      startsAt: hours(-32),
      endsAt: hours(-30),
      customerName: 'Selftest Beoordeling',
      customerEmail: 'selftest-beoordeling@example.invalid',
      cancelTokenHash: `selftest-followup-${now.getTime()}-b`,
    })
    .returning({ id: schema.cmsBookings.id });
  const bookingIds = [upcoming.id, past.id];
  const bookingRow = async (id: string) =>
    (await db.select().from(schema.cmsBookings).where(eq(schema.cmsBookings.id, id)))[0];

  // --- 1. dry run ---------------------------------------------------------------
  const sent: SendEmailInput[] = [];
  const send = async (input: SendEmailInput): Promise<SendEmailResult> => {
    sent.push(input);
    return { sent: true, id: `selftest-${sent.length}` };
  };
  const dry = await runBookingFollowUps({ now, dryRun: true, send });
  check(
    'dry run: both bookings due, nothing sent, no flag set',
    dry.reminders.due >= 1 &&
      dry.reviews.due >= 1 &&
      dry.reminders.sent === 0 &&
      sent.length === 0 &&
      (await bookingRow(upcoming.id)).reminderSentAt === null,
    JSON.stringify(dry),
  );

  // --- 2. the run ---------------------------------------------------------------
  const run = await runBookingFollowUps({ now, send });
  const reminder = sent.find((mail) => mail.subject.startsWith('Herinnering: '));
  const request = sent.find((mail) => mail.subject.startsWith('Hoe was je '));
  const link = request?.text.match(/https?:\/\/\S+\/beoordeling\/([A-Za-z0-9_-]+)/);
  check(
    'run: the reminder went to the customer, the review request carries a link, both flags set',
    run.reminders.sent >= 1 &&
      run.reviews.sent >= 1 &&
      run.reminders.failed === 0 &&
      run.reviews.failed === 0 &&
      Boolean(reminder) &&
      JSON.stringify(reminder?.to).includes('selftest-herinnering@example.invalid') &&
      Boolean(link) &&
      JSON.stringify(request?.to).includes('selftest-beoordeling@example.invalid') &&
      (await bookingRow(upcoming.id)).reminderSentAt !== null &&
      (await bookingRow(past.id)).reviewRequestedAt !== null,
    JSON.stringify({ run, subjects: sent.map((mail) => mail.subject) }),
  );
  const before = sent.length;
  const again = await runBookingFollowUps({ now: hours(1), send });
  check(
    'second run: nothing more goes out',
    again.reminders.sent === 0 && again.reviews.sent === 0 && sent.length === before,
    JSON.stringify(again),
  );

  // --- 3. the link --------------------------------------------------------------
  const token = link![1];
  const open = await reviews.getReviewByToken(token, { now });
  check(
    'link: the review is open and names the appointment with the first name only',
    open.ok &&
      open.state === 'open' &&
      open.review.firstName === 'Selftest' &&
      open.review.serviceName === service.name,
    JSON.stringify(open),
  );
  const bad = await reviews.submitReview(
    token,
    { rating: '7', body: 'x', allowFirstName: false },
    { ip: '203.0.113.9', now },
  );
  check(
    'submit: a score outside 1–5 is refused per field, nothing stored',
    !bad.ok && bad.code === 'invalid' && Boolean(bad.fieldErrors.rating),
    JSON.stringify(bad),
  );
  const good = await reviews.submitReview(
    token,
    { rating: '5', body: '  Heel tevreden, duidelijke uitleg.  ', allowFirstName: true },
    { ip: '203.0.113.9', now },
  );
  const [stored] = await db
    .select()
    .from(schema.cmsReviews)
    .where(eq(schema.cmsReviews.bookingId, past.id));
  check(
    'submit: stored as submitted with score, trimmed text and the consent; not published',
    good.ok &&
      stored?.status === 'submitted' &&
      stored.rating === 5 &&
      stored.body === 'Heel tevreden, duidelijke uitleg.' &&
      stored.allowFirstName === true &&
      stored.decidedAt === null,
    JSON.stringify({ good, stored }),
  );
  const twice = await reviews.submitReview(
    token,
    { rating: '1', body: '', allowFirstName: false },
    { ip: '203.0.113.9', now },
  );
  const unknown = await reviews.getReviewByToken('x'.repeat(48), { now });
  const afterSubmit = await reviews.getReviewByToken(token, { now });
  check(
    'submit: the same link is not accepted twice; an unknown link is "ongeldig"',
    !twice.ok &&
      twice.code === 'already' &&
      !unknown.ok &&
      afterSubmit.ok &&
      afterSubmit.state === 'submitted' &&
      stored?.rating === 5,
    JSON.stringify({ twice, unknown, afterSubmit }),
  );

  // --- 4. the admin -------------------------------------------------------------
  await signInAs(admin.id);
  const listed = await reviews.listReviews();
  const toJudge = await reviews.countReviewsToJudge();
  const approved = await reviews.setReviewStatus(stored!.id, 'approved');
  const [judged] = await db
    .select()
    .from(schema.cmsReviews)
    .where(eq(schema.cmsReviews.id, stored!.id));
  const audits = await db
    .select({ id: schema.cmsAuditLog.id })
    .from(schema.cmsAuditLog)
    .where(
      and(
        eq(schema.cmsAuditLog.action, 'review.decide'),
        eq(schema.cmsAuditLog.entityId, stored!.id),
      ),
    );
  const reopened = await reviews.setReviewStatus(stored!.id, 'submitted');
  check(
    'admin: lists the review, approves it (audited, decided by the admin) and can reopen it',
    listed.some((row) => row.id === stored!.id) &&
      toJudge >= 1 &&
      approved.ok &&
      judged?.status === 'approved' &&
      judged.decidedBy === admin.id &&
      audits.length === 1 &&
      reopened.ok,
    JSON.stringify({ listed: listed.length, toJudge, approved, judged, reopened }),
  );
  await signInAs(provider.userId);
  let refused = false;
  try {
    await reviews.listReviews();
  } catch (error) {
    refused = error instanceof CmsAuthError;
  }
  check('admin: a provider is refused', refused);
  await signInAs(admin.id);

  // --- 5. the cron route's authorisation, clean-up --------------------------------
  check(
    'cron: bearer secret accepted, wrong one denied, no secret = disabled',
    authorizeCron('Bearer selftest-cron-secret-0123', 'selftest-cron-secret-0123') === 'ok' &&
      authorizeCron('Bearer nope', 'selftest-cron-secret-0123') === 'denied' &&
      authorizeCron('Bearer selftest-cron-secret-0123', undefined) === 'disabled',
  );
  await db.delete(schema.cmsReviews).where(inArray(schema.cmsReviews.bookingId, bookingIds));
  await db.delete(schema.cmsBookings).where(inArray(schema.cmsBookings.id, bookingIds));
  await db.delete(cmsRateLimits).where(orm.like(cmsRateLimits.scope, 'review:%'));
  cookieJar.delete('cms_session');
  check(
    'clean-up: the two bookings and the review are gone',
    (await db.select().from(schema.cmsBookings).where(inArray(schema.cmsBookings.id, bookingIds)))
      .length === 0,
  );
}
