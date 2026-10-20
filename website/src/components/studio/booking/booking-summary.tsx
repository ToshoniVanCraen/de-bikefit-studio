import { durationLabel, instantToTime, instantToYmd, longDate } from './dates';

/**
 * "Wat / Wanneer / Waar / Met wie" as a definition list. Pure markup, so the
 * client confirmation panel and the server-rendered `/afspraak/bevestigd` and
 * `/afspraak/annuleren/[token]` pages all show a booking the same way.
 * Extra rows (e.g. where the confirmation mail went) come in as children.
 */
export function BookingSummaryList({
  serviceName,
  addons = [],
  durationMinutes,
  startsAt,
  endsAt,
  timezone,
  where,
  providerName,
  children,
}: {
  serviceName: string;
  /** Titles of the extras booked with it; each on its own line under "Wat". */
  addons?: string[];
  /** The whole appointment, extras included. */
  durationMinutes: number | null;
  startsAt: string;
  endsAt: string;
  timezone: string;
  where: string;
  providerName: string;
  children?: React.ReactNode;
}) {
  return (
    <dl className="studio-booking__summary">
      {serviceName ? (
        <div>
          <dt>Wat</dt>
          <dd>
            {serviceName}
            {durationMinutes ? ` · ${durationLabel(durationMinutes)}` : ''}
            {addons.map((addon) => (
              <span key={addon} className="studio-booking__summary-extra">
                + {addon}
              </span>
            ))}
          </dd>
        </div>
      ) : null}
      <div>
        <dt>Wanneer</dt>
        <dd>
          {longDate(instantToYmd(startsAt, timezone))}, {instantToTime(startsAt, timezone)}–
          {instantToTime(endsAt, timezone)}
        </dd>
      </div>
      {where ? (
        <div>
          <dt>Waar</dt>
          <dd>{where}</dd>
        </div>
      ) : null}
      {providerName ? (
        <div>
          <dt>Met wie</dt>
          <dd>{providerName}</dd>
        </div>
      ) : null}
      {children}
    </dl>
  );
}
