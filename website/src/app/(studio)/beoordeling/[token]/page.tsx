import type { Metadata } from 'next';

import { ReviewForm } from '@/components/studio/review-form';
import { getReviewByToken, type ReviewByTokenResult } from '@/lib/booking/reviews';
import { formatDateLong } from '@/lib/booking/time';
import { getSiteSettings } from '@/lib/cms/content';
import { defaultLocale } from '@/lib/studio/locale';
import { applyTitleTemplate } from '@/lib/studio/seo';

/**
 * `/beoordeling/[token]` — the review link from the mail sent the day after
 * an appointment (`src/lib/booking/follow-ups.ts`).
 *
 * Shows the appointment (service, date, first name only) and the form
 * (`ReviewForm` → `submitReviewAction`); after a submit, or for a link that
 * was already used, a thank-you. Never indexed, rendered per request, and
 * `no-referrer` so the token in the URL is not passed on.
 */
export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  const settings = await getSiteSettings(defaultLocale);
  return {
    title: { absolute: applyTitleTemplate(settings.seo.titleTemplate, 'Hoe was het?') },
    robots: { index: false, follow: false, googleBot: { index: false, follow: false } },
    referrer: 'no-referrer',
  };
}

export default async function ReviewPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const settings = await getSiteSettings(defaultLocale);
  const { phoneLabel, phoneHref } = settings.contact;

  let lookup: ReviewByTokenResult;
  try {
    lookup = await getReviewByToken(token);
  } catch {
    // A fixed event code only: the error carries the SQL params (the token's hash).
    console.error('[booking] review_page_lookup_failed');
    lookup = { ok: false, message: 'Er ging iets mis. Probeer het later opnieuw.' };
  }

  if (!lookup.ok) {
    return (
      <section className="studio-booking-page">
        <div className="studio-booking-page__inner">
          <p className="studio-eyebrow">Beoordeling</p>
          <h1 className="studio-booking-page__title">Deze link werkt niet</h1>
          <p className="studio-booking-page__lede">{lookup.message}</p>
          <p className="studio-booking__confirm-text">
            Controleer of je de volledige link uit onze e-mail gebruikt.
            {phoneLabel && phoneHref ? (
              <>
                {' '}
                Lukt het niet? Bel ons op <a href={phoneHref}>{phoneLabel}</a>.
              </>
            ) : null}
          </p>
        </div>
      </section>
    );
  }

  const { review } = lookup;
  const when = formatDateLong(review.appointmentAt, 'Europe/Brussels');

  if (lookup.state === 'submitted') {
    return (
      <section className="studio-booking-page">
        <div className="studio-booking-page__inner">
          <p className="studio-eyebrow">Beoordeling</p>
          <h1 className="studio-booking-page__title">
            Bedankt{review.firstName ? `, ${review.firstName}` : ''}!
          </h1>
          <p className="studio-booking-page__lede">
            Je beoordeling van je {review.serviceName.toLowerCase()} op {when} is al binnen. We
            lezen ze met aandacht.
          </p>
        </div>
      </section>
    );
  }

  return (
    <section className="studio-booking-page">
      <div className="studio-booking-page__inner">
        <p className="studio-eyebrow">Beoordeling</p>
        <h1 className="studio-booking-page__title">
          Hoe was het{review.firstName ? `, ${review.firstName}` : ''}?
        </h1>
        <p className="studio-booking-page__lede">
          Je was op {when} bij ons voor {review.serviceName}
          {review.providerName ? ` bij ${review.providerName}` : ''}. Twee minuten van je tijd
          helpen ons vooruit.
        </p>
        <ReviewForm
          token={token}
          firstName={review.firstName}
          phoneLabel={phoneLabel}
          phoneHref={phoneHref}
        />
      </div>
    </section>
  );
}
