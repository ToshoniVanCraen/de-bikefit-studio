/**
 * The writing half of `npm run cms:patch-site-redesign`: the backup (written FIRST: no backup, no
 * write), the apply of an unblocked plan, and the restore of a backup.
 *
 *   backup   every page the apply touches (row and draft blocks, which also brings back the
 *            published snapshot) and the image of every offering it changes, as they are now;
 *            read back by zod
 *   apply    per page through the real repo (sanitiser, block schema, audit, cache bust): the
 *            blocks that go, the blocks that change, the new blocks at their place, then publish
 *            (the live page changes last); per offering only the `image` column, with an
 *            `offering.update` audit entry (`updateOffering` would also rewrite the booking
 *            services of a fit that is booked online)
 *   restore  the pages through the rollout restore (row, draft blocks and snapshot as they were,
 *            audited), the offerings' images, one `patch.site-redesign.restore` entry
 *
 * neon-http has no transactions: each page is written in an order that leaves valid data when a
 * run stops halfway, and a repeated run finds the finished pages as intended.
 */
import { z } from 'zod';
import { cmsOfferings } from '@/db/cms-offering-schema';
import type { BlockType } from '@/lib/cms/blocks';
import { restoreAanbodRollout, type RolloutBackup, type RolloutDeps } from './aanbod-rollout.mjs';
import type { RedesignPagePlan, RedesignPlan } from './site-redesign-plan.mjs';

export const REDESIGN_CACHE_TAGS = ['cms', 'cms:pages', 'cms:offerings'];

const rowSchema = z.record(z.string(), z.unknown());

export const redesignBackupSchema = z.object({
  kind: z.literal('site-redesign-backup'),
  version: z.literal(1),
  createdAt: z.string(),
  locale: z.string(),
  driver: z.string(),
  pages: z.array(z.object({ row: rowSchema, blocks: z.array(rowSchema) })),
  offerings: z.array(z.object({ id: z.string(), slug: z.string(), image: z.unknown() })),
  guards: z.record(z.string(), z.number()),
});
export type RedesignBackup = z.infer<typeof redesignBackupSchema>;

const toJson = (row: object) => JSON.parse(JSON.stringify(row)) as Record<string, unknown>;

/** Everything the apply is about to change, as it is now. */
export function buildRedesignBackup(plan: RedesignPlan, driver: string): RedesignBackup {
  return redesignBackupSchema.parse({
    kind: 'site-redesign-backup',
    version: 1,
    createdAt: new Date().toISOString(),
    locale: plan.locale,
    driver,
    pages: plan.pages
      .filter((page) => page.action === 'update' && page.row)
      .map((page) => ({ row: toJson(page.row as object), blocks: page.blocks.map(toJson) })),
    offerings: plan.offerings
      .filter((offering) => offering.action === 'update' && offering.row)
      .map((offering) => ({
        id: offering.row!.id,
        slug: offering.slug,
        image: offering.row!.image ?? null,
      })),
    guards: plan.guards,
  });
}

export async function readRedesignBackup(file: string): Promise<RedesignBackup> {
  const { readFile } = await import('node:fs/promises');
  return redesignBackupSchema.parse(JSON.parse(await readFile(file, 'utf8')));
}

function must<T>(label: string, result: { ok: true; data: T } | { ok: false; message: string }): T {
  if (!result.ok) throw new Error(`${label}: ${result.message}`);
  return result.data;
}

/** Blocks, then publish: the live snapshot of a page changes last. */
async function applyPage(deps: RolloutDeps, page: RedesignPagePlan) {
  const { row } = page;
  if (!row) return;
  const { repo } = deps;
  const label = `page ${page.path}`;
  for (const block of page.ops.deletes) {
    must(`${label} (${block.type})`, await repo.deleteBlock(block.id as string));
  }
  for (const { block, data } of page.ops.updates) {
    must(`${label} (${block.type})`, await repo.updateBlock(block.id as string, data));
  }
  // In the order of the final page: every earlier block is in place when one is added.
  for (const insert of page.ops.inserts) {
    const added = must(
      `${label} (${insert.type})`,
      await repo.addBlock(row.id, insert.type as BlockType, insert.index),
    );
    must(`${label} (${insert.type})`, await repo.updateBlock(added.id, insert.data));
  }
  if (page.publish) must(label, await repo.publishPage(row.id));
  deps.log('~', `${label} — ${page.changes.length} change(s), published`);
}

export type RedesignSummary = { pages: string[]; offerings: string[] };

/** Runs an unblocked plan: the pages in order, then the offerings' photographs. */
export async function applyRedesign(
  deps: RolloutDeps,
  plan: RedesignPlan,
): Promise<RedesignSummary> {
  const summary: RedesignSummary = { pages: [], offerings: [] };
  for (const page of plan.pages.filter((item) => item.action === 'update')) {
    await applyPage(deps, page);
    summary.pages.push(page.path);
  }
  const { eq } = deps.orm;
  for (const offering of plan.offerings.filter((item) => item.action === 'update')) {
    if (!offering.row || !offering.image) continue;
    await deps.db
      .update(cmsOfferings)
      .set({ image: offering.image, updatedBy: deps.actor.id, updatedAt: new Date() })
      .where(eq(cmsOfferings.id, offering.row.id));
    await deps.auth.recordAudit(deps.db, deps.actor, {
      action: 'offering.update',
      entityType: 'cms_offering',
      entityId: offering.row.id,
      summary: `${offering.slug}: image (patch site-redesign)`,
    });
    summary.offerings.push(offering.slug);
    deps.log('~', `offering ${offering.slug} — ${offering.changes.join('; ')}`);
  }
  deps.repo.revalidateContent({ tags: REDESIGN_CACHE_TAGS });
  return summary;
}

/** Puts back every page and offering image the backup lists. */
export async function restoreRedesign(deps: RolloutDeps, backup: RedesignBackup): Promise<void> {
  if (backup.locale !== deps.locale) {
    throw new Error(`backup is for locale ${backup.locale}, database runs ${deps.locale}`);
  }
  const rollout: RolloutBackup = {
    kind: 'aanbod-rollout-backup',
    version: 1,
    createdAt: backup.createdAt,
    locale: backup.locale,
    driver: backup.driver,
    pages: backup.pages,
    menus: [],
    redirects: [],
    created: { pageSlugs: [], redirectPaths: [] },
    guards: backup.guards,
  };
  if (backup.pages.length > 0) await restoreAanbodRollout(deps, rollout);

  const { eq } = deps.orm;
  for (const entry of backup.offerings) {
    await deps.db
      .update(cmsOfferings)
      .set({
        image: (entry.image ?? null) as (typeof cmsOfferings.$inferInsert)['image'],
        updatedBy: deps.actor.id,
        updatedAt: new Date(),
      })
      .where(eq(cmsOfferings.id, entry.id));
    deps.log('~', `offering ${entry.slug} — image restored`);
  }
  await deps.auth.recordAudit(deps.db, deps.actor, {
    action: 'patch.site-redesign.restore',
    entityType: 'cms_rollout',
    summary: 'redesign van 24 november 2026 teruggezet',
    metadata: {
      pages: backup.pages.map((page) => String(page.row.slug)),
      offerings: backup.offerings.map((entry) => entry.slug),
    },
  });
  deps.repo.revalidateContent({ tags: REDESIGN_CACHE_TAGS });
}
