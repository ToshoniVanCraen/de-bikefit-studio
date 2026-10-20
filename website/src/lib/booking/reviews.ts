import 'server-only';

import { and, desc, eq, ne } from 'drizzle-orm';

import { getCmsDb } from '@/db/cms';
import { cmsReviews, type CmsReview } from '@/db/cms-schema';
import { recordAudit, requirePermission } from '@/lib/cms/auth';
import type { RepoResult } from '@/lib/cms/repo';
import { reserveRateLimit, type RateLimitScope } from '@/lib/rate-limit';

import { firstNameOf, parseRating, reviewInputProblems } from './follow-ups-policy';
import { hashCancelToken, looksLikeToken } from './public-booking';

/**
 * Reviews (Toshoni, 20 Oct 2026): what the customer sees and sends through
 * the e-mailed link, and what an admin reads and judges in Beheer →
 * Beoordelingen. Nothing here publishes anything: an approved review is a
 * flag the site may use later, with the customer's first name and only when
 * the customer allowed it.
 *
 * Public side: the token comes from the mail, is looked up by its hash, and
 * works once (`requested` → `submitted`) and for 30 days. The submit is
 * rate-limited per IP and per link. Admin side: `booking.manage` (admins).
 */

const INVALID_LINK = 'Deze link is ongeldig of verlopen.';

export type PublicReview = {
  firstName: string;
  serviceName: string;
  providerName: string;
  /** ISO instant. */
  appointmentAt: string;
};

export type ReviewByTokenResult =
  { ok: true; state: 'open' | 'submitted'; review: PublicReview } | { ok: false; message: string };

async function findByToken(token: string): Promise<CmsReview | null> {
  if (!looksLikeToken(token)) return null;
  const db = await getCmsDb();
  const [row] = await db
    .select()
    .from(cmsReviews)
    .where(eq(cmsReviews.tokenHash, hashCancelToken(token)))
    .limit(1);
  return row ?? null;
}

function toPublic(row: CmsReview): PublicReview {
  return {
    firstName: firstNameOf(row.customerName),
    serviceName: row.serviceName,
    providerName: row.providerName,
    appointmentAt: new Date(row.appointmentAt).toISOString(),
  };
}

export async function getReviewByToken(
  token: string,
  context: { now?: Date } = {},
): Promise<ReviewByTokenResult> {
  const row = await findByToken(token);
  if (!row) return { ok: false, message: INVALID_LINK };
  if (row.status !== 'requested') return { ok: true, state: 'submitted', review: toPublic(row) };
  const now = context.now ?? new Date();
  if (new Date(row.tokenExpiresAt).getTime() < now.getTime()) {
    return { ok: false, message: INVALID_LINK };
  }
  return { ok: true, state: 'open', review: toPublic(row) };
}

export type SubmitReviewInput = { rating: unknown; body: unknown; allowFirstName: boolean };

export type SubmitReviewResult =
  | { ok: true; message: string }
  | {
      ok: false;
      code: 'invalid' | 'not_found' | 'already' | 'rate_limited' | 'error';
      message: string;
      fieldErrors: Record<string, string>;
    };

function rateLimitScopes(ip: string | null, tokenHash: string): RateLimitScope[] {
  const scopes: RateLimitScope[] = [
    { key: `review:link:${tokenHash.slice(0, 32)}`, limit: 5, windowMs: 3_600_000 },
  ];
  if (ip) scopes.push({ key: `review:ip:${ip}`, limit: 10, windowMs: 3_600_000 });
  return scopes;
}

export async function submitReview(
  token: string,
  input: SubmitReviewInput,
  context: { ip: string | null; now?: Date },
): Promise<SubmitReviewResult> {
  const fieldErrors = reviewInputProblems(input);
  if (Object.keys(fieldErrors).length > 0) {
    return { ok: false, code: 'invalid', message: 'Kijk de velden even na.', fieldErrors };
  }
  const row = await findByToken(token);
  if (!row) return { ok: false, code: 'not_found', message: INVALID_LINK, fieldErrors: {} };
  const now = context.now ?? new Date();
  if (row.status !== 'requested') {
    return {
      ok: false,
      code: 'already',
      message: 'Je beoordeling is al binnen. Bedankt!',
      fieldErrors: {},
    };
  }
  if (new Date(row.tokenExpiresAt).getTime() < now.getTime()) {
    return { ok: false, code: 'not_found', message: INVALID_LINK, fieldErrors: {} };
  }

  const db = await getCmsDb();
  const reserved = await reserveRateLimit(
    db,
    rateLimitScopes(context.ip, row.tokenHash),
    now.getTime(),
  );
  if (!reserved.ok) {
    return {
      ok: false,
      code: 'rate_limited',
      message: 'Even geduld: probeer het over een paar minuten opnieuw.',
      fieldErrors: {},
    };
  }

  const rating = parseRating(input.rating)!;
  const body = typeof input.body === 'string' ? input.body.trim() : '';
  const updated = await db
    .update(cmsReviews)
    .set({
      rating,
      body,
      allowFirstName: Boolean(input.allowFirstName),
      status: 'submitted',
      submittedAt: now,
      updatedAt: now,
    })
    .where(and(eq(cmsReviews.id, row.id), eq(cmsReviews.status, 'requested')))
    .returning({ id: cmsReviews.id });
  if (updated.length === 0) {
    return {
      ok: false,
      code: 'already',
      message: 'Je beoordeling is al binnen. Bedankt!',
      fieldErrors: {},
    };
  }
  return { ok: true, message: 'Bedankt! Je beoordeling is goed aangekomen.' };
}

// ---------------------------------------------------------------------------
// Admin
// ---------------------------------------------------------------------------

export const REVIEW_DECISIONS = ['approved', 'rejected', 'submitted'] as const;
export type ReviewDecision = (typeof REVIEW_DECISIONS)[number];

/** Submitted and judged reviews, newest first; `requested` rows (no answer yet) stay out. */
export async function listReviews(options: { limit?: number } = {}): Promise<CmsReview[]> {
  await requirePermission('booking.manage');
  const db = await getCmsDb();
  return db
    .select()
    .from(cmsReviews)
    .where(ne(cmsReviews.status, 'requested'))
    .orderBy(desc(cmsReviews.submittedAt), desc(cmsReviews.createdAt))
    .limit(options.limit ?? 200);
}

/** How many submitted reviews wait for a decision (the dashboard and the nav badge). */
export async function countReviewsToJudge(): Promise<number> {
  await requirePermission('booking.manage');
  const db = await getCmsDb();
  const rows = await db
    .select({ id: cmsReviews.id })
    .from(cmsReviews)
    .where(eq(cmsReviews.status, 'submitted'));
  return rows.length;
}

/** Approve, reject, or put back to "submitted" (undo); audited. Never publishes. */
export async function setReviewStatus(
  reviewId: string,
  status: ReviewDecision,
): Promise<RepoResult<true>> {
  const actor = await requirePermission('booking.manage');
  if (!REVIEW_DECISIONS.includes(status)) return { ok: false, message: 'Onbekende keuze.' };
  const db = await getCmsDb();
  const now = new Date();
  const [row] = await db
    .update(cmsReviews)
    .set({
      status,
      decidedAt: status === 'submitted' ? null : now,
      decidedBy: status === 'submitted' ? null : actor.id,
      updatedAt: now,
    })
    .where(and(eq(cmsReviews.id, reviewId), eq(cmsReviews.status, 'submitted')))
    .returning({ id: cmsReviews.id });
  if (!row) {
    // A judged review goes back to "submitted" first; anything else is not there.
    const [existing] = await db
      .select({ id: cmsReviews.id, status: cmsReviews.status })
      .from(cmsReviews)
      .where(eq(cmsReviews.id, reviewId))
      .limit(1);
    if (!existing || existing.status === 'requested') {
      return { ok: false, message: 'Deze beoordeling bestaat niet (meer).' };
    }
    if (status === 'submitted') {
      await db
        .update(cmsReviews)
        .set({ status, decidedAt: null, decidedBy: null, updatedAt: now })
        .where(eq(cmsReviews.id, reviewId));
    } else {
      await db
        .update(cmsReviews)
        .set({ status, decidedAt: now, decidedBy: actor.id, updatedAt: now })
        .where(eq(cmsReviews.id, reviewId));
    }
  }
  await recordAudit(db, actor, {
    action: 'review.decide',
    entityType: 'cms_review',
    entityId: reviewId,
    summary: `beoordeling → ${status}`,
  });
  return { ok: true, data: true };
}
