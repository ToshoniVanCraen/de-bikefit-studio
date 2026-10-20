'use client';

import { useActionState } from 'react';

import { Button } from '@/components/ui/button';
import type { CmsReviewStatus } from '@/db/cms-schema';
import { decideReviewAction } from '@/lib/cms/actions/reviews';
import { IDLE_STATE } from '@/lib/cms/actions/state';

/** The approve / reject / reopen buttons of one review (Beheer → Beoordelingen). */
export function ReviewDecisionForm({
  reviewId,
  status,
}: {
  reviewId: string;
  status: CmsReviewStatus;
}) {
  const [state, formAction, pending] = useActionState(decideReviewAction, IDLE_STATE);
  return (
    <form action={formAction} className="flex flex-col gap-2">
      <input type="hidden" name="reviewId" value={reviewId} />
      <div className="flex flex-wrap gap-2">
        {status === 'submitted' ? (
          <>
            <Button type="submit" name="decision" value="approved" size="sm" disabled={pending}>
              Goedkeuren
            </Button>
            <Button
              type="submit"
              name="decision"
              value="rejected"
              size="sm"
              variant="outline"
              disabled={pending}
            >
              Afwijzen
            </Button>
          </>
        ) : (
          <Button
            type="submit"
            name="decision"
            value="submitted"
            size="sm"
            variant="ghost"
            disabled={pending}
          >
            Opnieuw beoordelen
          </Button>
        )}
      </div>
      {state.message ? (
        <p
          className={`text-xs ${state.ok ? 'text-muted-foreground' : 'text-destructive'}`}
          role="status"
        >
          {state.message}
        </p>
      ) : null}
    </form>
  );
}
