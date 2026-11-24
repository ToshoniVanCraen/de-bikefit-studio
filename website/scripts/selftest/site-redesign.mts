/**
 * Self-test section 17e: `cms:patch-site-redesign` (the redesign of 24 Nov 2026) on the throwaway
 * PGlite of `cms-selftest.mts`, after the corrections section (17d). The database is put in the
 * state staging and production hold (`site-redesign-fixture.mts`: the frozen pages of 31 Oct
 * 2026, the offerings with their generated images), the patch is driven through the entry point
 * of the CLI, and the database is given back as it was found:
 *
 *  1. the dry run plans every page and offering, writes nothing (no write call, no session, no
 *     audit entry) and blocks nothing; the editor's photo on an offering stays (`=`);
 *  2. apply writes the backup first, then the pages and the offerings, verifies on the public
 *     readers; the published pages show the new blocks, `/veelgestelde-vragen` has the
 *     `beginners` group, and every page is, block for block, the freshly seeded one (the seed
 *     definition as the repo stores it: sanitiser and block schema) — the proof that the seeds
 *     and the patch agree;
 *  3. a second dry run finds nothing to do, a second apply writes nothing;
 *  4. restore returns exactly the state before (fingerprint), apply again reaches the same end;
 *  5. a field an editor changed is a `!` line, the apply is refused before any write, and the
 *     editor's text is still there;
 *  6. clean-up: every table is put back, and checked.
 *
 * Imported lazily by `cms-selftest.mts` after its request-context stubs.
 */
import * as orm from 'drizzle-orm';
import { canonicalData } from '@/lib/studio/seed-content/page-restructure';
import {
  normalizeBlock,
  OFFERING_IMAGE_TARGETS,
  REDESIGN_SLUGS,
  redesignTarget,
} from '@/lib/studio/seed-content/site-redesign';
import { runSiteRedesignPatch } from '../lib/site-redesign-patch.mjs';
import {
  diffPrints,
  fingerprint,
  planLines,
  restoreState,
  snapshotState,
  type CorrectiesSectionContext,
} from './aanbod-correcties-kit.mjs';
import { EDITOR_PHOTO, seedRedesignBefore } from './site-redesign-fixture.mjs';

const { eq } = orm;
const WRITES = ['insert', 'update', 'delete', 'execute', 'transaction', 'batch'];
const path = (slug: string) => (slug ? `/${slug}` : '/');

export async function siteRedesignSection(ctx: CorrectiesSectionContext) {
  const { db, check, section, cookieJar, backupDir, admin } = ctx;
  section(
    '17e. site redesign (24 Nov 2026): pages and offering photographs, from the state of 31 Oct',
  );
  const schema = await import('@/db/cms-schema');
  const locale = schema.DEFAULT_LOCALE;
  const { getPublishedPage } = await import('@/lib/cms/content');
  const { loadOfferCatalogue } = await import('@/lib/cms/offers-content');

  const lines: string[] = [];
  const run = (options: { apply: boolean; restore: string | null }, handle = db) => {
    lines.length = 0;
    return runSiteRedesignPatch(
      { ...options, backupDir },
      {
        db: handle,
        driver: 'pglite',
        cookieJar,
        log: (symbol, text) => lines.push(`${symbol} ${text}`),
      },
    );
  };
  /** A handle that records every write call. */
  const watch = () => {
    const calls: string[] = [];
    const handle = new Proxy(db, {
      get(target, property, receiver) {
        if (typeof property === 'string' && WRITES.includes(property)) calls.push(property);
        const value = Reflect.get(target, property, receiver);
        return typeof value === 'function' ? value.bind(target) : value;
      },
    });
    return { calls, handle };
  };
  const sessions = async () => (await db.select().from(schema.cmsSessions)).length;
  const audits = async (action?: string) =>
    (
      await db
        .select({ id: schema.cmsAuditLog.id })
        .from(schema.cmsAuditLog)
        .where(action ? eq(schema.cmsAuditLog.action, action) : undefined)
    ).length;
  const draftOf = async (pageId: string) =>
    (
      await db
        .select()
        .from(schema.cmsBlocks)
        .where(eq(schema.cmsBlocks.pageId, pageId))
        .orderBy(orm.asc(schema.cmsBlocks.sortOrder))
    ).map((block) => normalizeBlock(block));
  const plain = (blocks: ReadonlyArray<{ type: string; data: unknown } | null>) =>
    blocks.map((block) => canonicalData(block));

  const original = await snapshotState(db, schema);
  const originalPrint = await fingerprint(db, schema);

  try {
    const pageIds = await seedRedesignBefore({ db, schema, locale }, ctx);
    const before = await fingerprint(db, schema);
    check(
      'fixture: the eight pages of 31 Oct 2026, published; the offerings with their generated images, one editor’s photo, one without',
      Object.keys(pageIds).length === 8 &&
        (await getPublishedPage(locale, 'veelgestelde-vragen')) !== null,
      Object.keys(pageIds).map(path).join(' '),
    );

    // --- 1: the dry run ------------------------------------------------------------------------
    const dry = watch();
    const sessionsBefore = await sessions();
    const auditBefore = await audits();
    await run({ apply: false, restore: null }, dry.handle);
    const planned = [...lines];
    const has = (prefix: string, ...parts: string[]) =>
      planned.some((line) => line.startsWith(prefix) && parts.every((part) => line.includes(part)));
    check(
      'dry run: no write call reaches the database; no session, no audit entry, no cookie, nothing changed',
      dry.calls.length === 0 &&
        (await sessions()) === sessionsBefore &&
        (await audits()) === auditBefore &&
        !cookieJar.has('cms_session') &&
        (await fingerprint(db, schema)) === before,
      dry.calls.join(),
    );
    check(
      'dry run: every page planned and then published; the three conversions; the FAQ groups',
      REDESIGN_SLUGS.every((slug) => has(`~ page ${path(slug)} — `, 'then publish')) &&
        has('    replace cta "Goede begeleiding begint bij de juiste mensen." with imageText') &&
        has('    replace imageText "Waarom is een bikefit belangrijk?" with hero') &&
        has('    replace richText "Voor je komt" with imageText "Voor je komt"') &&
        has('    insert welcome "Weinig of geen fietservaring?" after hero "Meer plezier."') &&
        has('    faq.items: 8 → 13 item(s), 13 changed'),
      planLines(planned).join(' | '),
    );
    check(
      'dry run: eight offerings get their photograph (one had none), the editor’s photo stays, the guards line, no blocker',
      planned.filter((line) => line.startsWith('~ offering ')).length === 8 &&
        has('~ offering bikefit-tweede-fiets — image: no image → ') &&
        has('= offering coaching — kept as it is: the image /images/team/') &&
        has('= guards: pages 8, blocks ') &&
        has('→ after the apply: blocks ') &&
        !planned.some((line) => line.startsWith('!')) &&
        planned.at(-1)?.includes('run again with --apply') === true,
      planned.filter((line) => /offering|guards|after/.test(line)).join(' | '),
    );

    // --- 2: apply --------------------------------------------------------------------------------
    const applyAudits = await audits('patch.site-redesign.apply');
    await run({ apply: true, restore: null });
    const applied = [...lines];
    const backupPath = applied
      .find((line) => line.startsWith('✓ backup written: '))
      ?.slice('✓ backup written: '.length);
    check(
      'apply: backup first, then the pages, verified on the public readers, row counts as planned; audited once; session revoked',
      Boolean(backupPath) &&
        applied.findIndex((line) => line.startsWith('✓ backup written')) <
          applied.findIndex((line) => line.startsWith('~ page')) &&
        applied.some((line) =>
          line.startsWith('✓ published pages and offer photographs verified'),
        ) &&
        applied.some((line) => line.startsWith('✓ row counts as planned (blocks ')) &&
        applied.includes('✓ apply complete') &&
        (await audits('patch.site-redesign.apply')) === applyAudits + 1 &&
        (await sessions()) === sessionsBefore &&
        !cookieJar.has('cms_session'),
      applied.filter((line) => /^[✓!]/.test(line)).join(' | '),
    );
    const afterApply = await fingerprint(db, schema);

    const faq = await getPublishedPage(locale, 'veelgestelde-vragen');
    const faqItems = (
      faq?.snapshot.blocks.find((block) => block.type === 'faq')?.data as {
        items?: Array<{ group: string; groupAnchor: string }>;
      }
    )?.items;
    const home = await getPublishedPage(locale, '');
    check(
      'published: the home page opens on hero, welcome, keuzehulp; /veelgestelde-vragen has the "beginners" group first',
      home?.snapshot.blocks
        .slice(0, 3)
        .map((block) => block.type)
        .join() === 'hero,welcome,chooser' &&
        faqItems?.[0]?.groupAnchor === 'beginners' &&
        faqItems.length === 13,
      `${home?.snapshot.blocks.map((block) => block.type).join(' → ')}`,
    );
    const mismatched: string[] = [];
    for (const slug of REDESIGN_SLUGS) {
      const draft = plain(await draftOf(pageIds[slug]));
      const live = await getPublishedPage(locale, slug);
      const published = plain((live?.snapshot.blocks ?? []).map((block) => normalizeBlock(block)));
      const seeded = plain(redesignTarget(slug));
      if (
        canonicalData(draft) !== canonicalData(seeded) ||
        canonicalData(published) !== canonicalData(seeded)
      ) {
        mismatched.push(path(slug));
      }
    }
    check(
      'the patched pages equal the freshly seeded ones, block for block (draft and published; ids and timestamps aside)',
      mismatched.length === 0,
      mismatched.join(', '),
    );
    const catalogue = await loadOfferCatalogue(locale);
    const shown = (slug: string) => catalogue.bySlug[slug]?.content.image.url;
    check(
      'offerings: each shows its photograph, the editor’s photo on coaching stays',
      OFFERING_IMAGE_TARGETS.filter((target) => target.slug !== 'coaching').every(
        (target) => shown(target.slug) === target.image.url,
      ) && shown('coaching') === EDITOR_PHOTO.url,
      OFFERING_IMAGE_TARGETS.map((target) => `${target.slug}: ${shown(target.slug)}`).join(', '),
    );

    // --- 3: a second run finds nothing ----------------------------------------------------------
    await run({ apply: false, restore: null });
    check(
      'a second dry run finds nothing to do: every line is as intended, no change, no blocker',
      lines.at(-1)?.includes('nothing to do') === true &&
        planLines(lines).every((line) => line.startsWith('=')),
      planLines(lines)
        .filter((line) => !line.startsWith('='))
        .join(' | '),
    );
    await run({ apply: true, restore: null });
    check(
      'a second apply writes nothing: no backup, no audit entry',
      lines.some((line) => line.includes('nothing to do')) &&
        !lines.some((line) => line.includes('backup written')) &&
        (await audits('patch.site-redesign.apply')) === applyAudits + 1 &&
        (await fingerprint(db, schema)) === afterApply,
    );

    // --- 4: restore, and apply again -------------------------------------------------------------
    if (backupPath) await run({ apply: false, restore: backupPath });
    const restored = await fingerprint(db, schema);
    check(
      'restore: pages, their published snapshots and the offerings’ images are as before',
      restored === before && (await audits('patch.site-redesign.restore')) === 1,
      diffPrints(before, restored),
    );
    await run({ apply: true, restore: null });
    const again = await fingerprint(db, schema);
    check(
      'apply after the restore reaches the same end state',
      again === afterApply,
      diffPrints(afterApply, again),
    );

    // --- 5: an editor's change blocks, and stays --------------------------------------------------
    if (backupPath) await run({ apply: false, restore: backupPath });
    const [faqHead] = await db
      .select()
      .from(schema.cmsBlocks)
      .where(eq(schema.cmsBlocks.pageId, pageIds['veelgestelde-vragen']))
      .orderBy(orm.asc(schema.cmsBlocks.sortOrder))
      .limit(1);
    const own = 'Onze eigen inleiding, door de redactie geschreven.';
    const { withAdminSession } = await import('../lib/aanbod-rollout-run.mjs');
    await withAdminSession({ db, cookieJar }, admin.id, 'cms-selftest-17e', async () => {
      const repo = await import('@/lib/cms/repo');
      const saved = await repo.updateBlock(faqHead.id, { ...faqHead.data, subtitle: own });
      if (!saved.ok) throw new Error(`17e: ${saved.message}`);
      const published = await repo.publishPage(pageIds['veelgestelde-vragen']);
      if (!published.ok) throw new Error(`17e: ${published.message}`);
    });
    const edited = await fingerprint(db, schema);
    await run({ apply: false, restore: null });
    const blockedDry = [...lines];
    const refusedRun = watch();
    let refusal = '';
    try {
      await run({ apply: true, restore: null }, refusedRun.handle);
    } catch (error) {
      refusal = error instanceof Error ? error.message : String(error);
    }
    const [faqHeadAfter] = await db
      .select()
      .from(schema.cmsBlocks)
      .where(eq(schema.cmsBlocks.id, faqHead.id));
    check(
      'an editor’s text in a field the redesign changes is a ! line; the apply is refused before any write and the text stays',
      blockedDry.some(
        (line) =>
          line.startsWith(
            '! page /veelgestelde-vragen: hero "Veelgestelde vragen".subtitle: expected ""',
          ) && line.includes(own.slice(0, 20)),
      ) &&
        blockedDry.at(-1)?.includes('blocked') === true &&
        refusal.startsWith('patch refused:') &&
        refusedRun.calls.length === 0 &&
        (faqHeadAfter.data as { subtitle?: string }).subtitle === own &&
        (await fingerprint(db, schema)) === edited,
      `${blockedDry.filter((line) => line.startsWith('!')).join(' | ')} | writes: ${refusedRun.calls.join() || 'none'}`,
    );
  } finally {
    // --- 6: clean-up -------------------------------------------------------------------------------
    await restoreState(db, schema, original);
    cookieJar.delete('cms_session');
  }
  check(
    'clean-up: pages, offerings and the other tables are as the sections before left them',
    (await fingerprint(db, schema)) === originalPrint,
  );
}
