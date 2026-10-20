import 'server-only';

import { and, asc, eq, gte, inArray, isNull, lt } from 'drizzle-orm';

import { getCmsDb } from '@/db/cms';
import { cmsBookings, cmsReviews, DEFAULT_LOCALE, type CmsBooking } from '@/db/cms-schema';
import { sendEmail, type SendEmailInput, type SendEmailResult } from '@/lib/email/send';
import { bookingReminderEmail, reviewRequestEmail } from '@/lib/email/templates-followups';
import { siteUrl } from '@/lib/env';

import {
  isDueForReminder,
  isDueForReview,
  reminderWindow,
  reviewTokenExpiry,
  reviewWindow,
} from './follow-ups-policy';
import { customerRecipients, emailData, loadBookingContext } from './notifications';
import { generateCancelToken, hashCancelToken } from './public-booking';

/**
 * The follow-up mail run (Toshoni, 20 Oct 2026): the reminder 12–36 hours
 * before an appointment and the review request 20–72 hours after it, for the
 * bookings that have not had theirs yet. Triggered by `GET
 * /api/cron/booking-mails` (Vercel Cron, daily) with `CRON_SECRET`; any
 * cadence works because the windows overlap and the flags on the booking
 * (`reminder_sent_at`, `review_requested_at`) make each mail go out once.
 *
 * A review request creates (or renews) the booking's `cms_reviews` row with
 * a fresh link token; the token itself is only in the mail, its hash in the
 * row. A mail that was not accepted leaves the flag empty, so the next run
 * tries again; the log gets a fixed code and the sender's reason, never an
 * address. `send` is injectable for the self-test.
 */

export type FollowUpCounts = { due: number; sent: number; failed: number };

export type FollowUpRun = {
  now: string;
  dryRun: boolean;
  reminders: FollowUpCounts;
  reviews: FollowUpCounts;
};

export type FollowUpOptions = {
  now?: Date;
  /** Count what is due, send nothing, flag nothing. */
  dryRun?: boolean;
  /** Bookings handled per kind per run (the rest waits for the next run). */
  limit?: number;
  send?: (input: SendEmailInput) => Promise<SendEmailResult>;
};

export function reviewUrlFor(token: string): string {
  return `${siteUrl()}/beoordeling/${token}`;
}

export async function runBookingFollowUps(options: FollowUpOptions = {}): Promise<FollowUpRun> {
  const now = options.now ?? new Date();
  const dryRun = options.dryRun ?? false;
  const limit = options.limit ?? 50;
  const send = options.send ?? sendEmail;
  const db = await getCmsDb();

  const reminderRange = reminderWindow(now);
  const remindable = await db
    .select()
    .from(cmsBookings)
    .where(
      and(
        eq(cmsBookings.status, 'confirmed'),
        eq(cmsBookings.assignment, 'assigned'),
        isNull(cmsBookings.reminderSentAt),
        gte(cmsBookings.startsAt, reminderRange.from),
        lt(cmsBookings.startsAt, reminderRange.to),
      ),
    )
    .orderBy(asc(cmsBookings.startsAt))
    .limit(limit);
  const reminders: FollowUpCounts = { due: remindable.length, sent: 0, failed: 0 };

  const reviewRange = reviewWindow(now);
  const reviewable = await db
    .select()
    .from(cmsBookings)
    .where(
      and(
        inArray(cmsBookings.status, ['confirmed', 'completed']),
        isNull(cmsBookings.reviewRequestedAt),
        gte(cmsBookings.endsAt, reviewRange.from),
        lt(cmsBookings.endsAt, reviewRange.to),
      ),
    )
    .orderBy(asc(cmsBookings.endsAt))
    .limit(limit);
  const reviews: FollowUpCounts = { due: reviewable.length, sent: 0, failed: 0 };

  if (dryRun) return { now: now.toISOString(), dryRun, reminders, reviews };

  for (const booking of remindable) {
    if (!isDueForReminder(booking, now)) continue;
    const result = await sendReminder(booking, send);
    if (result.sent) {
      await db
        .update(cmsBookings)
        .set({ reminderSentAt: now, updatedAt: now })
        .where(eq(cmsBookings.id, booking.id));
      reminders.sent += 1;
    } else {
      reminders.failed += 1;
      console.error(`[booking] reminder_not_sent (${result.reason})`);
    }
  }

  for (const booking of reviewable) {
    if (!isDueForReview(booking, now)) continue;
    const result = await sendReviewRequest(booking, now, send);
    if (result.sent) {
      await db
        .update(cmsBookings)
        .set({ reviewRequestedAt: now, updatedAt: now })
        .where(eq(cmsBookings.id, booking.id));
      reviews.sent += 1;
    } else {
      reviews.failed += 1;
      console.error(`[booking] review_request_not_sent (${result.reason})`);
    }
  }

  return { now: now.toISOString(), dryRun, reminders, reviews };
}

async function sendReminder(
  booking: CmsBooking,
  send: NonNullable<FollowUpOptions['send']>,
): Promise<SendEmailResult> {
  const ctx = await loadBookingContext(booking.id);
  if (!ctx) return { sent: false, reason: 'no_context' };
  const data = await emailData(ctx);
  return send({ to: customerRecipients(ctx.booking), ...bookingReminderEmail(data) });
}

async function sendReviewRequest(
  booking: CmsBooking,
  now: Date,
  send: NonNullable<FollowUpOptions['send']>,
): Promise<SendEmailResult> {
  const ctx = await loadBookingContext(booking.id);
  if (!ctx) return { sent: false, reason: 'no_context' };
  const data = await emailData(ctx);
  const token = generateCancelToken();
  const db = await getCmsDb();
  const row = {
    locale: ctx.service.locale || DEFAULT_LOCALE,
    bookingId: booking.id,
    tokenHash: hashCancelToken(token),
    tokenExpiresAt: reviewTokenExpiry(now),
    customerName: booking.customerName,
    customerEmail: booking.customerEmail,
    serviceName: ctx.service.name,
    providerName: ctx.provider.displayName,
    appointmentAt: booking.startsAt,
    updatedAt: now,
  };
  // One review per booking: a renewed request replaces the link of an
  // earlier one that never arrived, never a submitted review.
  await db
    .insert(cmsReviews)
    .values(row)
    .onConflictDoUpdate({
      target: cmsReviews.bookingId,
      set: { tokenHash: row.tokenHash, tokenExpiresAt: row.tokenExpiresAt, updatedAt: now },
      setWhere: eq(cmsReviews.status, 'requested'),
    });
  return send({
    to: customerRecipients(ctx.booking),
    ...reviewRequestEmail(data, { reviewUrl: reviewUrlFor(token) }),
  });
}
