import { createHash, timingSafeEqual } from 'node:crypto';

/**
 * Who may call `/api/cron/booking-mails`: the holder of `CRON_SECRET`, sent
 * as `Authorization: Bearer <secret>` (what Vercel Cron does by itself when
 * the variable is set; Arend's scheduler or a curl does the same). Without the
 * variable the route is off. Compared in constant time over digests, so
 * neither the length nor the content leaks. Pure; tested in `cron-auth.test.ts`.
 */
export type CronAccess = 'ok' | 'disabled' | 'denied';

export function authorizeCron(
  authorization: string | null,
  secret: string | undefined,
): CronAccess {
  if (!secret || secret.length < 16) return 'disabled';
  const match = /^Bearer\s+(\S+)\s*$/i.exec(authorization ?? '');
  if (!match) return 'denied';
  const given = createHash('sha256').update(match[1]).digest();
  const expected = createHash('sha256').update(secret).digest();
  return timingSafeEqual(given, expected) ? 'ok' : 'denied';
}
