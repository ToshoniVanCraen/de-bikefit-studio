import { formatDateShort, formatTime } from '@/lib/booking/time';
import { formatDuration } from '@/lib/booking/format';
import { REVIEW_LINK_DAYS } from '@/lib/booking/follow-ups-policy';
import {
  BRING_ALONG,
  button,
  layout,
  legalFooterHtml,
  legalFooterText,
  paragraph,
  rowsHtml,
  rowsText,
  whenLabel,
  whereLines,
  type BookingEmailData,
  type RenderedEmail,
  type Row,
} from './templates';

/**
 * The two follow-up mails (Toshoni, 20 Oct 2026), in the style of
 * `templates.ts`: the reminder 12–36 hours before an appointment and the
 * request for a review 20–72 hours after it (`src/lib/booking/follow-ups.ts`).
 * Service messages about a booking, with the same footer. Plain module.
 */

function joinText(lines: string[]): string {
  return lines.filter((line, i, all) => !(line === '' && all[i - 1] === '')).join('\n');
}

export function bookingReminderEmail(data: BookingEmailData): RenderedEmail {
  const subject = `Herinnering: ${data.serviceName} op ${formatDateShort(data.startsAt, data.timezone)} om ${formatTime(data.startsAt, data.timezone)}`;
  const heading = 'Je afspraak komt eraan';
  const rows: Row[] = [
    ['Wat', `${data.serviceName} (${formatDuration(data.durationMinutes)})`],
    ['Wanneer', whenLabel(data)],
    ['Bij', data.providerName],
    ['Waar', whereLines(data).join('\n')],
  ];
  const intro = `Hallo ${data.customerName}, een korte herinnering aan je afspraak:`;
  const phoneLine = data.contactPhoneLabel
    ? `Lukt het toch niet, of loop je uit? Bel ons even op ${data.contactPhoneLabel}, dan zoeken we een ander moment.`
    : 'Lukt het toch niet, of loop je uit? Laat het ons even weten, dan zoeken we een ander moment.';

  const text = joinText([
    intro,
    '',
    rowsText(rows),
    '',
    BRING_ALONG,
    '',
    phoneLine,
    '',
    'Tot dan!',
    data.siteName,
    '',
    legalFooterText(data),
  ]);

  const html = layout(
    data.siteName,
    heading,
    [
      paragraph(intro),
      rowsHtml(rows),
      paragraph(BRING_ALONG),
      paragraph(phoneLine),
      paragraph('Tot dan!'),
    ].join(''),
    legalFooterHtml(data),
  );

  return { subject, html, text };
}

export function reviewRequestEmail(
  data: BookingEmailData,
  options: { reviewUrl: string },
): RenderedEmail {
  const when = formatDateShort(data.startsAt, data.timezone);
  const subject = `Hoe was je ${data.serviceName.toLowerCase()}?`;
  const heading = 'Hoe was het?';
  const intro = `Hallo ${data.customerName}, op ${when} was je bij ons voor ${data.serviceName}. We horen graag hoe het was: één score, een paar woorden als je wil. Twee minuten, één link.`;
  const promise =
    'Je beoordeling komt niet automatisch op de website: we lezen ze eerst zelf. Enkel als je dat goed vindt, verschijnt ze later met je voornaam. Zo niet, blijft ze bij ons.';
  const validity = `De link werkt ${REVIEW_LINK_DAYS} dagen.`;

  const text = joinText([
    intro,
    '',
    `Laat weten hoe het was: ${options.reviewUrl}`,
    '',
    promise,
    validity,
    '',
    'Bedankt, en tot een volgende keer!',
    data.siteName,
    '',
    legalFooterText(data),
  ]);

  const html = layout(
    data.siteName,
    heading,
    [
      paragraph(intro),
      button(options.reviewUrl, 'Laat weten hoe het was'),
      paragraph(promise),
      paragraph(validity),
      paragraph('Bedankt, en tot een volgende keer!'),
    ].join(''),
    legalFooterHtml(data),
  );

  return { subject, html, text };
}
