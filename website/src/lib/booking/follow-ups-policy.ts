/**
 * The rules of the two follow-up mails (Toshoni, 20 Oct 2026): a reminder
 * before the appointment and, the day after, a request to leave a review.
 * Pure: windows, due-checks, the review link's lifetime and the review
 * input's validation; tested in `follow-ups-policy.test.ts`. The I/O is in
 * `follow-ups.ts` (the run) and `reviews.ts` (the review itself).
 *
 * Windows rather than exact offsets, so the run may come hourly or once a
 * day (Vercel's cron on the Hobby plan runs daily): a booking is reminded at
 * the first run that finds its start between 12 and 36 hours away, and asked
 * for a review at the first run that finds its end between 20 and 72 hours
 * ago. The flags on the booking make each mail go out once.
 */

const HOUR_MS = 3_600_000;
const DAY_MS = 24 * HOUR_MS;

/** Hours before the start in which the reminder goes out. */
export const REMINDER_HOURS = { min: 12, max: 36 } as const;
/** Hours after the end in which the review request goes out. */
export const REVIEW_HOURS = { min: 20, max: 72 } as const;
/** How long the review link works. */
export const REVIEW_LINK_DAYS = 30;
export const REVIEW_BODY_MAX = 1000;
export const REVIEW_RATINGS = [1, 2, 3, 4, 5] as const;

export type FollowUpWindow = { from: Date; to: Date };

/** Bookings whose start lies in `[from, to)` are due for a reminder. */
export function reminderWindow(now: Date): FollowUpWindow {
  return {
    from: new Date(now.getTime() + REMINDER_HOURS.min * HOUR_MS),
    to: new Date(now.getTime() + REMINDER_HOURS.max * HOUR_MS),
  };
}

/** Bookings whose end lies in `[from, to)` are due for a review request. */
export function reviewWindow(now: Date): FollowUpWindow {
  return {
    from: new Date(now.getTime() - REVIEW_HOURS.max * HOUR_MS),
    to: new Date(now.getTime() - REVIEW_HOURS.min * HOUR_MS),
  };
}

export type FollowUpBooking = {
  status: string;
  assignment: string;
  startsAt: Date;
  endsAt: Date;
  reminderSentAt: Date | null;
  reviewRequestedAt: Date | null;
};

function inWindow(at: Date, window: FollowUpWindow): boolean {
  return at.getTime() >= window.from.getTime() && at.getTime() < window.to.getTime();
}

/** Confirmed, assigned to a provider, not reminded yet, starting 12–36 hours from now. */
export function isDueForReminder(booking: FollowUpBooking, now: Date): boolean {
  return (
    booking.status === 'confirmed' &&
    booking.assignment === 'assigned' &&
    booking.reminderSentAt === null &&
    inWindow(booking.startsAt, reminderWindow(now))
  );
}

/** Took place (confirmed or completed), not asked yet, ended 20–72 hours ago. */
export function isDueForReview(booking: FollowUpBooking, now: Date): boolean {
  return (
    (booking.status === 'confirmed' || booking.status === 'completed') &&
    booking.reviewRequestedAt === null &&
    inWindow(booking.endsAt, reviewWindow(now))
  );
}

export function reviewTokenExpiry(now: Date): Date {
  return new Date(now.getTime() + REVIEW_LINK_DAYS * DAY_MS);
}

/** "Anna Peeters" → "Anna"; '' stays ''. */
export function firstNameOf(name: string): string {
  return name.trim().split(/\s+/)[0] ?? '';
}

/** 1–5 as a number or a numeric string; anything else → null. */
export function parseRating(value: unknown): number | null {
  const number = typeof value === 'number' ? value : Number(String(value ?? '').trim());
  return Number.isInteger(number) && number >= 1 && number <= 5 ? number : null;
}

/** Validation of what the customer sends; Dutch, per field. */
export function reviewInputProblems(input: {
  rating: unknown;
  body: unknown;
}): Record<string, string> {
  const problems: Record<string, string> = {};
  if (parseRating(input.rating) === null) problems.rating = 'Kies een score van 1 tot 5.';
  const body = typeof input.body === 'string' ? input.body.trim() : '';
  if (body.length > REVIEW_BODY_MAX) {
    problems.body = `Hou het bij maximaal ${REVIEW_BODY_MAX} tekens.`;
  } else if (/\p{Cc}/u.test(body.replace(/[\n\r\t]/g, ''))) {
    problems.body = 'Je tekst bevat tekens die we niet kunnen opslaan.';
  }
  return problems;
}
