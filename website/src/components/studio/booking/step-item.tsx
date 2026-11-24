import { BookingHeading } from './heading-level';

/**
 * One step of the booking flow (redesign of 24 Nov 2026): the eyebrow "Stap
 * n", the heading (focus target when the step opens), a summary and
 * "Wijzigen" once done, the body while active. Split out of
 * `booking-widget.tsx`.
 */

export type BookingStep = 'service' | 'provider' | 'addons' | 'when' | 'details' | 'done';
export type StepState = 'done' | 'active' | 'upcoming';

export function StepItem({
  id,
  number,
  title,
  state,
  summary,
  onEdit,
  children,
}: {
  id: BookingStep;
  number: number;
  title: string;
  state: StepState;
  summary: string;
  onEdit?: () => void;
  children: React.ReactNode;
}) {
  return (
    <li className="studio-booking__step" data-state={state}>
      <div className="studio-booking__step-head">
        {/* The heading below says "Stap n: " to a screen reader already. */}
        <p className="studio-eyebrow studio-booking__step-num" aria-hidden="true">
          Stap {number}
        </p>
        <div className="studio-booking__step-main">
          <div className="studio-booking__step-heading">
            <BookingHeading
              className="studio-booking__step-title"
              tabIndex={-1}
              data-step-heading={id}
            >
              <span className="sr-only">Stap {number}: </span>
              {title}
            </BookingHeading>
            {state === 'done' && summary ? (
              <p className="studio-booking__step-summary">{summary}</p>
            ) : null}
          </div>
          {state === 'done' && onEdit ? (
            <button
              type="button"
              className="studio-booking__edit"
              onClick={onEdit}
              aria-label={`${title}: wijzigen`}
            >
              Wijzigen
            </button>
          ) : null}
        </div>
      </div>
      {state === 'active' ? <div className="studio-booking__step-body">{children}</div> : null}
    </li>
  );
}
