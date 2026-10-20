import { ReviewDecisionForm } from '@/components/admin/review-decision-form';
import { ForbiddenNotice } from '@/components/admin/forbidden';
import { PageHeading } from '@/components/admin/shell';
import { badgeTone } from '@/components/admin/tones';
import { Badge } from '@/components/ui/badge';
import type { CmsReviewStatus } from '@/db/cms-schema';
import { listReviews } from '@/lib/booking/reviews';
import { requireCmsUser } from '@/lib/cms/auth';
import { can } from '@/lib/cms/permissions';

export const metadata = { title: 'Beoordelingen' };

const STATUS: Record<
  Exclude<CmsReviewStatus, 'requested'>,
  { label: string; variant: 'warning' | 'success' | 'outline' }
> = {
  submitted: { label: 'Te beoordelen', variant: 'warning' },
  approved: { label: 'Goedgekeurd', variant: 'success' },
  rejected: { label: 'Afgewezen', variant: 'outline' },
};

/**
 * Beheer → Beoordelingen: what customers sent through the link of the mail
 * the day after their appointment (`docs/booking-architecture.md` §17).
 * Admins read, approve or reject; nothing here publishes anything yet.
 */
export default async function AdminReviewsPage() {
  const user = await requireCmsUser();
  if (!can(user.role, 'booking.manage')) return <ForbiddenNotice what="de beoordelingen" />;

  const reviews = await listReviews();
  const waiting = reviews.filter((review) => review.status === 'submitted').length;

  return (
    <>
      <PageHeading
        title="Beoordelingen"
        description={`Wat klanten antwoordden op de vraag de dag na hun afspraak. ${waiting} te beoordelen. Goedgekeurd betekent: mag ooit op de website, met voornaam, als de klant dat toeliet. Er verschijnt nog niets automatisch.`}
      />

      <div className="overflow-x-auto border border-border bg-card">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-border bg-muted text-xs text-muted-foreground">
            <tr>
              <th className="p-3">Ontvangen</th>
              <th className="p-3">Score</th>
              <th className="p-3">Beoordeling</th>
              <th className="p-3">Afspraak</th>
              <th className="p-3">Status</th>
              <th className="p-3">Beslissing</th>
            </tr>
          </thead>
          <tbody>
            {reviews.length === 0 ? (
              <tr>
                <td colSpan={6} className="p-6 text-center text-muted-foreground">
                  Nog geen beoordelingen.
                </td>
              </tr>
            ) : null}
            {reviews.map((review) => {
              const status = STATUS[review.status as keyof typeof STATUS] ?? STATUS.submitted;
              return (
                <tr key={review.id} className="border-b border-border align-top last:border-0">
                  <td className="p-3 text-xs whitespace-nowrap text-muted-foreground">
                    {review.submittedAt
                      ? new Date(review.submittedAt).toLocaleString('nl-BE', {
                          timeZone: 'Europe/Brussels',
                        })
                      : '—'}
                  </td>
                  <td className="p-3 font-ds-display text-2xl leading-none font-semibold tabular-nums">
                    {review.rating ?? '—'}
                    <span className="text-sm text-muted-foreground">/5</span>
                  </td>
                  <td className="p-3">
                    <p className="max-w-[48ch] whitespace-pre-line">
                      {review.body || <span className="text-muted-foreground">(geen tekst)</span>}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {review.customerName} · {review.customerEmail} ·{' '}
                      {review.allowFirstName ? 'voornaam mag online' : 'voornaam niet online'}
                    </p>
                  </td>
                  <td className="p-3 text-xs text-muted-foreground">
                    {review.serviceName}
                    {review.providerName ? ` · ${review.providerName}` : ''}
                    <br />
                    {new Date(review.appointmentAt).toLocaleDateString('nl-BE', {
                      timeZone: 'Europe/Brussels',
                    })}
                  </td>
                  <td className="p-3">
                    <Badge variant={status.variant} className={badgeTone(status.variant)}>
                      {status.label}
                    </Badge>
                  </td>
                  <td className="p-3">
                    <ReviewDecisionForm reviewId={review.id} status={review.status} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}
