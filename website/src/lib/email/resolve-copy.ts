import 'server-only';
import {
  emptyCopyTokenLookup,
  hasCopyTokens,
  resolveCopyTokens,
  resolveCopyTokensInText,
  type CopyTokenLookup,
} from '@/lib/studio/copy-tokens';
import { defaultLocale } from '@/lib/studio/locale';

/**
 * Copy tokens in outgoing mail (27 Oct 2026): an e-mail never shows `{{…}}`.
 * Template text (the "wat breng ik mee" paragraph, the follow-up mails), the
 * booking settings' confirmation text and the service names all reach
 * `sendEmail()` as plain strings; this module resolves the tokens in them at
 * the one place every mail passes, so no template has to remember to.
 *
 * `resolveMailCopy()` is what `sendEmail()` calls on subject, text (plain) and
 * html (escaped). `resolveCopyText()` is for the calendar file of a booking
 * (`booking/notifications.ts`): its text is resolved BEFORE `buildIcs()`
 * escapes and folds it, never after.
 *
 * The lookup is the site's (`copy-token-lookup.ts`, read from the cached
 * readers, settings and offerings included) and is loaded lazily, only when a
 * mail holds a token: the mail core has no static dependency on the readers,
 * and a mail without a token costs nothing. When the lookup cannot be built the
 * tokens read their fallbacks ("in overleg", "op aanvraag", an empty fact), so
 * a mail still goes out without a raw `{{…}}`.
 *
 * Resolution also runs over text a visitor typed (a note, a message). Every
 * token prints a public fact of the site, never a secret, so a visitor who
 * types one gets the studio's phone number back and nothing more.
 */

type MailText = { subject: string; html: string; text: string };

async function mailLookup(): Promise<CopyTokenLookup> {
  try {
    const { getCopyTokenLookup } = await import('@/lib/studio/copy-token-lookup');
    return await getCopyTokenLookup(defaultLocale);
  } catch {
    // A fixed code, never the error: a failed query's message holds its SQL and bound values.
    console.error('[email] copy_tokens_unavailable');
    return emptyCopyTokenLookup();
  }
}

/** The mail with its tokens resolved: plain text in the subject and text part, escaped in the html part. */
export async function resolveMailCopy<T extends MailText>(mail: T): Promise<T> {
  if (!hasCopyTokens([mail.subject, mail.text, mail.html])) return mail;
  const lookup = await mailLookup();
  return {
    ...mail,
    subject: resolveCopyTokensInText(mail.subject, lookup),
    text: resolveCopyTokensInText(mail.text, lookup),
    html: resolveCopyTokensInText(mail.html, lookup, { html: true }),
  };
}

/** Any plain strings (a calendar event's summary, description, location) with their tokens resolved. */
export async function resolveCopyText<T>(value: T): Promise<T> {
  if (!hasCopyTokens(value)) return value;
  return resolveCopyTokens(value, await mailLookup());
}
