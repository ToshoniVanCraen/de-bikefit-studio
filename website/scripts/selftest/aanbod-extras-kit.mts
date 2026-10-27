/**
 * Shared helpers of self-test section 17c (`aanbod-extras.mts` and
 * `aanbod-extras-patch.mts`): the context `cms-selftest.mts` hands to the
 * section, and a few reads on the throwaway PGlite plus `run()`, which drives
 * `cms:patch-aanbod-extras` through the same entry point as the CLI and keeps
 * what it printed in `lines`.
 */
import * as orm from 'drizzle-orm';
import type { CmsDatabase } from '@/db/cms';
import { cmsOfferingAddons, cmsOfferings } from '@/db/cms-offering-schema';
import { runAanbodExtrasPatch } from '../lib/aanbod-extras-patch.mjs';

export type Check = (label: string, condition: boolean, detail?: string) => void;

export type ExtrasSectionContext = {
  db: CmsDatabase;
  check: Check;
  section: (title: string) => void;
  cookieJar: Map<string, string>;
  backupDir: string;
  admin: { id: string };
};

const { and, asc, eq } = orm;

export async function createExtrasKit(
  ctx: Pick<ExtrasSectionContext, 'db' | 'cookieJar' | 'backupDir'>,
) {
  const { db, cookieJar, backupDir } = ctx;
  const schema = await import('@/db/cms-schema');
  const locale = schema.DEFAULT_LOCALE;

  /** What the last `run()` printed, `symbol message` per line. */
  const lines: string[] = [];
  const log = (symbol: string, message: string) => {
    lines.push(`${symbol} ${message}`);
  };
  const run = (options: { apply: boolean; restore: string | null }) => {
    lines.length = 0;
    return runAanbodExtrasPatch(
      { ...options, backupDir },
      { db, driver: 'pglite', cookieJar, log },
    );
  };

  const offeringRow = async (slug: string) => {
    const [row] = await db
      .select()
      .from(cmsOfferings)
      .where(and(eq(cmsOfferings.locale, locale), eq(cmsOfferings.slug, slug)))
      .limit(1);
    return row ?? null;
  };

  /** The slugs an offering links to, in link order. */
  const linkSlugs = async (slug: string) => {
    const host = await offeringRow(slug);
    if (!host) return [];
    const links = await db
      .select({ addonId: cmsOfferingAddons.addonId })
      .from(cmsOfferingAddons)
      .where(eq(cmsOfferingAddons.offeringId, host.id))
      .orderBy(asc(cmsOfferingAddons.sortOrder));
    const rows = await db
      .select({ id: cmsOfferings.id, slug: cmsOfferings.slug })
      .from(cmsOfferings);
    return links.map((link) => rows.find((row) => row.id === link.addonId)?.slug ?? '?');
  };

  /** The number of link rows in the whole table. */
  const linkCount = async () =>
    (await db.select({ id: cmsOfferingAddons.offeringId }).from(cmsOfferingAddons)).length;

  const auditCount = async (action?: string) =>
    (
      await db
        .select({ id: schema.cmsAuditLog.id })
        .from(schema.cmsAuditLog)
        .where(action ? eq(schema.cmsAuditLog.action, action) : undefined)
    ).length;

  return { locale, lines, run, offeringRow, linkSlugs, linkCount, auditCount };
}

export type ExtrasKit = Awaited<ReturnType<typeof createExtrasKit>>;
