import { authorizeCron } from '@/lib/booking/cron-auth';
import { runBookingFollowUps } from '@/lib/booking/follow-ups';
import { env } from '@/lib/env';

/**
 * `GET /api/cron/booking-mails` — the follow-up mail run: the reminder 12–36
 * hours before an appointment and the review request 20–72 hours after it
 * (`src/lib/booking/follow-ups.ts`, docs/booking-architecture.md §17).
 *
 * Called by Vercel Cron (`vercel.json`, daily at 07:00 UTC) with
 * `Authorization: Bearer <CRON_SECRET>`, which Vercel adds by itself; any
 * other scheduler or a curl does the same. Without `CRON_SECRET` the route
 * answers 503 and nothing is sent. `?dry=1` counts what is due and sends
 * nothing. The answer holds counts only, never an address.
 */

// Every call reads the database and the clock; never cached.
export const dynamic = 'force-dynamic';

const HEADERS = { 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex, nofollow' };

export async function GET(request: Request): Promise<Response> {
  const access = authorizeCron(request.headers.get('authorization'), env.CRON_SECRET);
  if (access === 'disabled') {
    return Response.json({ error: 'cron_disabled' }, { status: 503, headers: HEADERS });
  }
  if (access === 'denied') {
    return Response.json({ error: 'unauthorized' }, { status: 401, headers: HEADERS });
  }
  const dryRun = new URL(request.url).searchParams.get('dry') === '1';
  try {
    const run = await runBookingFollowUps({ dryRun });
    console.error(
      `[booking] follow_ups ${dryRun ? 'dry ' : ''}reminders ${run.reminders.sent}/${run.reminders.due} reviews ${run.reviews.sent}/${run.reviews.due}`,
    );
    return Response.json(run, { status: 200, headers: HEADERS });
  } catch {
    // A fixed code only: the error can carry SQL with bound customer data.
    console.error('[booking] follow_ups_failed');
    return Response.json({ error: 'failed' }, { status: 500, headers: HEADERS });
  }
}
