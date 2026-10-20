'use server';

import { revalidatePath } from 'next/cache';

import { REVIEW_DECISIONS, setReviewStatus, type ReviewDecision } from '@/lib/booking/reviews';

import { runAction } from './run';
import { actionError, actionOk, field, type ActionState } from './state';

const LABELS: Record<ReviewDecision, string> = {
  approved: 'Beoordeling goedgekeurd. Ze verschijnt pas op de website als we dat inbouwen.',
  rejected: 'Beoordeling afgewezen.',
  submitted: 'Beoordeling staat weer open.',
};

/** Beheer → Beoordelingen: approve, reject or reopen one review (admins). */
export async function decideReviewAction(
  _prevState: ActionState,
  form: FormData,
): Promise<ActionState> {
  return runAction(async () => {
    const reviewId = field(form, 'reviewId');
    const decision = field(form, 'decision') as ReviewDecision;
    if (!reviewId || !REVIEW_DECISIONS.includes(decision)) return actionError('Onbekende keuze.');
    const result = await setReviewStatus(reviewId, decision);
    if (!result.ok) return actionError(result.message);
    revalidatePath('/admin/reviews');
    return actionOk(LABELS[decision]);
  });
}
