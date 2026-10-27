/** Exact production /aanbod editor copy through dry run, apply, public snapshot and refusal. */
import * as orm from 'drizzle-orm';
import { parsePublishedSnapshot } from '@/lib/cms/blocks';
import { KEPT_AANBOD_INTRO } from '@/lib/studio/seed-content/corrections-2026-10-27-copy';
import { withAdminSession } from '../lib/aanbod-rollout-run.mjs';
import { seedBefore } from './aanbod-correcties-fixture.mjs';
import {
  fingerprint,
  planLines,
  restoreState,
  type CorrectiesKit,
  type CorrectiesSectionContext,
  type State,
} from './aanbod-correcties-kit.mjs';

const { eq } = orm;

export async function productionCopyChecks(env: {
  ctx: CorrectiesSectionContext;
  kit: CorrectiesKit;
  original: State;
}) {
  const { ctx, kit, original } = env;
  const { db, check, cookieJar } = ctx;
  const { schema, lines, run, attempt, backupPathOf, pageRow, applyWatched } = kit;
  await restoreState(db, schema, original);
  const fixture = await seedBefore(kit, ctx);
  const blocks = await db
    .select()
    .from(schema.cmsBlocks)
    .where(eq(schema.cmsBlocks.pageId, fixture.pageIds.aanbod));
  const head = blocks.find(
    (block) => block.type === 'hero' && (block.data as { variant?: string }).variant === 'pageHead',
  );
  if (!head) throw new Error('17d production copy: /aanbod page head missing');
  const setSubtitle = async (subtitle: string) => {
    await withAdminSession(
      { db, cookieJar },
      ctx.admin.id,
      'cms-selftest-17d-production-copy',
      async () => {
        const repo = await import('@/lib/cms/repo');
        const saved = await repo.updateBlock(head.id, {
          ...(head.data as Record<string, unknown>),
          subtitle,
        });
        if (!saved.ok) throw new Error(`17d production copy: ${saved.message}`);
        const published = await repo.publishPage(fixture.pageIds.aanbod);
        if (!published.ok) throw new Error(`17d production copy: ${published.message}`);
      },
    );
  };
  const subtitleOf = async () => {
    const draft = (
      await db.select().from(schema.cmsBlocks).where(eq(schema.cmsBlocks.id, head.id))
    )[0];
    const page = await pageRow('aanbod');
    const live = parsePublishedSnapshot(page?.publishedSnapshot)?.blocks.find(
      (block) => block.id === head.id,
    );
    return {
      draft: (draft?.data as { subtitle?: unknown })?.subtitle,
      live: (live?.data as { subtitle?: unknown })?.subtitle,
    };
  };

  await setSubtitle(KEPT_AANBOD_INTRO);
  const before = await fingerprint(db, schema);
  await run({ apply: false, restore: null });
  check(
    'production copy: dry run keeps the exact subtitle, plans other /aanbod edits, and has no blocker',
    lines.some((line) =>
      line.startsWith('= page /aanbod — kept as it is: hero (page head).subtitle'),
    ) &&
      lines.some((line) => line.startsWith('~ page /aanbod — ')) &&
      !lines.some((line) => line.startsWith('!')) &&
      (await fingerprint(db, schema)) === before,
    lines.filter((line) => line.includes('page /aanbod')).join(' | '),
  );

  const error = await attempt(() => run({ apply: true, restore: null }));
  const backupPath = backupPathOf();
  const after = await subtitleOf();
  check(
    'production copy: apply publishes other corrections but preserves 258-character subtitle in draft and snapshot',
    error === '' &&
      Boolean(backupPath) &&
      lines.includes('✓ apply complete') &&
      after.draft === KEPT_AANBOD_INTRO &&
      after.live === KEPT_AANBOD_INTRO,
    error || JSON.stringify({ draft: after.draft, live: after.live }),
  );

  await run({ apply: false, restore: null });
  check(
    'production copy: second dry run is idempotent and still reports the retained field',
    lines.at(-1) === '= dry run: nothing to do' &&
      planLines(lines).every((line) => line.startsWith('=')) &&
      lines.some((line) => line.startsWith('= page /aanbod — kept as it is:')),
  );

  if (!backupPath) return;
  const restoreError = await attempt(() => run({ apply: false, restore: backupPath }));
  check(
    'production copy: restore returns exact draft and published snapshot',
    restoreError === '' &&
      (await fingerprint(db, schema)) === before &&
      (await subtitleOf()).draft === KEPT_AANBOD_INTRO &&
      (await subtitleOf()).live === KEPT_AANBOD_INTRO,
    restoreError,
  );

  await setSubtitle(`${KEPT_AANBOD_INTRO} `);
  await run({ apply: false, restore: null });
  const blocked = await applyWatched();
  check(
    'production copy: a third subtitle blocks dry run and apply before any write',
    lines.some((line) => line.startsWith('! page /aanbod: hero (page head).subtitle: expected')) &&
      blocked.refusal.includes('page /aanbod: hero (page head).subtitle: expected') &&
      blocked.untouched,
    blocked.detail,
  );
}
