import { describe, expect, it } from 'vitest';
import {
  firstNameOf,
  isDueForReminder,
  isDueForReview,
  parseRating,
  reminderWindow,
  reviewInputProblems,
  reviewTokenExpiry,
  reviewWindow,
  type FollowUpBooking,
} from './follow-ups-policy';

const NOW = new Date('2026-10-21T07:00:00.000Z');
const hours = (n: number) => new Date(NOW.getTime() + n * 3_600_000);

function booking(overrides: Partial<FollowUpBooking> = {}): FollowUpBooking {
  return {
    status: 'confirmed',
    assignment: 'assigned',
    startsAt: hours(24),
    endsAt: hours(26),
    reminderSentAt: null,
    reviewRequestedAt: null,
    ...overrides,
  };
}

describe('follow-up windows', () => {
  it('reminds 12–36 hours ahead and asks for a review 20–72 hours after', () => {
    expect(reminderWindow(NOW)).toEqual({ from: hours(12), to: hours(36) });
    expect(reviewWindow(NOW)).toEqual({ from: hours(-72), to: hours(-20) });
    expect(reviewTokenExpiry(NOW)).toEqual(hours(30 * 24));
  });

  it('a confirmed, assigned, unreminded booking in the window is due; everything else is not', () => {
    expect(isDueForReminder(booking(), NOW)).toBe(true);
    expect(isDueForReminder(booking({ startsAt: hours(12) }), NOW)).toBe(true);
    expect(isDueForReminder(booking({ startsAt: hours(36) }), NOW)).toBe(false);
    expect(isDueForReminder(booking({ startsAt: hours(11) }), NOW)).toBe(false);
    expect(isDueForReminder(booking({ status: 'cancelled' }), NOW)).toBe(false);
    expect(isDueForReminder(booking({ assignment: 'pending' }), NOW)).toBe(false);
    expect(isDueForReminder(booking({ reminderSentAt: hours(-1) }), NOW)).toBe(false);
  });

  it('a booking that ended the day before is due for a review request, once', () => {
    const past = { startsAt: hours(-26), endsAt: hours(-24) };
    expect(isDueForReview(booking(past), NOW)).toBe(true);
    expect(isDueForReview(booking({ ...past, status: 'completed' }), NOW)).toBe(true);
    expect(isDueForReview(booking({ ...past, status: 'no_show' }), NOW)).toBe(false);
    expect(isDueForReview(booking({ ...past, status: 'cancelled' }), NOW)).toBe(false);
    expect(isDueForReview(booking({ ...past, reviewRequestedAt: hours(-2) }), NOW)).toBe(false);
    expect(isDueForReview(booking({ startsAt: hours(-21), endsAt: hours(-19) }), NOW)).toBe(false);
    expect(isDueForReview(booking({ startsAt: hours(-80), endsAt: hours(-73) }), NOW)).toBe(false);
  });
});

describe('review input', () => {
  it('parses a rating of 1 to 5 and nothing else', () => {
    expect(parseRating('4')).toBe(4);
    expect(parseRating(5)).toBe(5);
    expect(parseRating('0')).toBeNull();
    expect(parseRating('6')).toBeNull();
    expect(parseRating('3.5')).toBeNull();
    expect(parseRating(undefined)).toBeNull();
  });

  it('reports the problems per field in Dutch', () => {
    expect(reviewInputProblems({ rating: '5', body: 'Top.' })).toEqual({});
    expect(reviewInputProblems({ rating: '', body: '' })).toEqual({
      rating: 'Kies een score van 1 tot 5.',
    });
    expect(reviewInputProblems({ rating: '2', body: 'x'.repeat(1001) }).body).toMatch(/1000/);
    expect(reviewInputProblems({ rating: '2', body: 'a\u0007b' }).body).toMatch(/tekens/);
    expect(firstNameOf('  Anna Peeters ')).toBe('Anna');
    expect(firstNameOf('')).toBe('');
  });
});
