'use client';

import { useId, useRef, useState } from 'react';

import { submitReviewAction } from '@/lib/booking/public-actions';
import {
  REVIEW_BODY_MAX,
  REVIEW_RATINGS,
  reviewInputProblems,
} from '@/lib/booking/follow-ups-policy';
import type { SubmitReviewResult } from '@/lib/booking/reviews';
import { LEGAL_LINKS } from '@/lib/studio/legal';

/**
 * The review form behind the e-mailed link (`/beoordeling/[token]`): a score
 * of 1–5, a few words, and whether the first name may appear with it. Posts
 * to `submitReviewAction`; the outcome replaces the form. The same classes as
 * the booking and enquiry forms. The token never leaves the page except in
 * that POST.
 */

const RATING_LABELS: Record<number, string> = {
  1: 'Niet goed',
  2: 'Matig',
  3: 'Oké',
  4: 'Goed',
  5: 'Uitstekend',
};

export function ReviewForm({
  token,
  firstName,
  phoneLabel,
  phoneHref,
}: {
  token: string;
  firstName: string;
  phoneLabel: string;
  phoneHref: string;
}) {
  const formId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const pendingRef = useRef(false);
  const [rating, setRating] = useState('');
  const [body, setBody] = useState('');
  const [allowFirstName, setAllowFirstName] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState('');
  const [pending, setPending] = useState(false);
  const [done, setDone] = useState<string | null>(null);

  async function submit() {
    if (pendingRef.current) return;
    const problems = reviewInputProblems({ rating, body });
    if (Object.keys(problems).length > 0) {
      setErrors(problems);
      setFormError('Kijk de velden even na.');
      return;
    }
    pendingRef.current = true;
    setPending(true);
    setFormError('');
    let result: SubmitReviewResult;
    try {
      result = await submitReviewAction(token, { rating, body, allowFirstName });
    } catch {
      result = {
        ok: false,
        code: 'error',
        message: 'Er ging iets mis. Probeer het opnieuw.',
        fieldErrors: {},
      };
    } finally {
      pendingRef.current = false;
      setPending(false);
    }
    if (result.ok) {
      setDone(result.message);
      requestAnimationFrame(() =>
        rootRef.current?.querySelector<HTMLElement>('[data-done-heading]')?.focus(),
      );
      return;
    }
    setErrors(result.fieldErrors);
    setFormError(result.message);
  }

  if (done) {
    return (
      <div className="studio-booking" ref={rootRef}>
        <div className="studio-booking__confirm" role="status">
          <h2 className="studio-booking__confirm-title" tabIndex={-1} data-done-heading>
            Bedankt{firstName ? `, ${firstName}` : ''}!
          </h2>
          <p className="studio-booking__confirm-text">{done}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="studio-booking" ref={rootRef}>
      <form
        className="studio-booking__form"
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        <fieldset
          className="studio-booking__fieldset"
          data-invalid={errors.rating ? 'true' : undefined}
        >
          <legend className="studio-booking__legend-title">Hoe was het? *</legend>
          <div role="radiogroup" aria-describedby={`${formId}-rating-hint`}>
            {REVIEW_RATINGS.map((value) => (
              <label key={value} className="studio-booking__label">
                <input
                  type="radio"
                  name="rating"
                  value={value}
                  checked={rating === String(value)}
                  onChange={() => {
                    setRating(String(value));
                    setErrors((current) => ({ ...current, rating: '' }));
                  }}
                />{' '}
                {value} · {RATING_LABELS[value]}
              </label>
            ))}
          </div>
          <p id={`${formId}-rating-hint`} className="studio-booking__hint">
            1 is niet goed, 5 is uitstekend.
          </p>
          {errors.rating ? (
            <p className="studio-booking__error" role="alert">
              {errors.rating}
            </p>
          ) : null}
        </fieldset>

        <div className="studio-booking__field" data-invalid={errors.body ? 'true' : undefined}>
          <label className="studio-booking__label" htmlFor={`${formId}-body`}>
            Wat wil je kwijt? (optioneel)
          </label>
          <textarea
            id={`${formId}-body`}
            name="body"
            className="studio-booking__input"
            rows={5}
            maxLength={REVIEW_BODY_MAX}
            value={body}
            onChange={(event) => {
              setBody(event.target.value);
              setErrors((current) => ({ ...current, body: '' }));
            }}
            aria-describedby={`${formId}-body-hint`}
          />
          <p id={`${formId}-body-hint`} className="studio-booking__hint">
            Wat je opviel, wat beter kon, wat je anderen zou vertellen. Maximaal {REVIEW_BODY_MAX}{' '}
            tekens.
          </p>
          {errors.body ? (
            <p className="studio-booking__error" role="alert">
              {errors.body}
            </p>
          ) : null}
        </div>

        <div className="studio-booking__field">
          <label className="studio-booking__label">
            <input
              type="checkbox"
              name="allowFirstName"
              checked={allowFirstName}
              onChange={(event) => setAllowFirstName(event.target.checked)}
            />{' '}
            Mijn voornaam mag bij deze beoordeling op de website staan.
          </label>
          <p className="studio-booking__hint">
            Zonder vinkje blijft je beoordeling bij ons. Ook met vinkje zetten we niets automatisch
            online: we lezen elke beoordeling eerst zelf.
          </p>
        </div>

        {formError ? (
          <p className="studio-booking__alert" role="alert">
            {formError}
            {phoneLabel && phoneHref ? (
              <>
                {' '}
                Lukt het niet? Bel ons op <a href={phoneHref}>{phoneLabel}</a>.
              </>
            ) : null}
          </p>
        ) : null}

        <div className="studio-booking__actions">
          <button type="submit" className="studio-btn" disabled={pending}>
            {pending ? 'Versturen…' : 'Verstuur mijn beoordeling'}
          </button>
        </div>
        <p className="studio-booking__hint">
          We bewaren je beoordeling bij je afspraak. Lees hoe we met je gegevens omgaan in onze{' '}
          <a href={LEGAL_LINKS.privacy} target="_blank" rel="noopener noreferrer">
            privacyverklaring
          </a>{' '}
          en{' '}
          <a href={LEGAL_LINKS.terms} target="_blank" rel="noopener noreferrer">
            algemene voorwaarden
          </a>
          .
        </p>
      </form>
    </div>
  );
}
