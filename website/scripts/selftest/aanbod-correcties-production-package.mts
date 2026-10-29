/** Production-shaped legacy package row: explicit, backed-up soft retirement, never deletion. */
import * as orm from 'drizzle-orm';
import { cmsOfferings, cmsOfferingVariants } from '@/db/cms-offering-schema';
import { parsePublishedSnapshot } from '@/lib/cms/blocks';
import { KEPT_AANBOD_INTRO } from '@/lib/studio/seed-content/corrections-2026-10-27-copy';
import { readCorrectiesBackup } from '../lib/aanbod-correcties-backup.mjs';
import { withAdminSession } from '../lib/aanbod-rollout-run.mjs';
import { seedBefore } from './aanbod-correcties-fixture.mjs';
import {
  fingerprint,
  restoreState,
  type CorrectiesKit,
  type CorrectiesSectionContext,
  type State,
} from './aanbod-correcties-kit.mjs';

const { and, eq, inArray, isNull } = orm;
const slug = 'bikefit-nieuwe-fiets-jeugd-pakket';

export async function productionPackageChecks(env: {
  ctx: CorrectiesSectionContext;
  kit: CorrectiesKit;
  original: State;
}) {
  const { ctx, kit, original } = env;
  const { db, check, cookieJar } = ctx;
  const {
    schema,
    lines,
    run,
    attempt,
    backupPathOf,
    serviceRow,
    pageRow,
    applyWatched,
    auditCount,
  } = kit;
  await restoreState(db, schema, original);
  const fixture = await seedBefore(kit, ctx);

  // Production's editor subtitle must survive the same run that retires the service.
  const head = (
    await db
      .select()
      .from(schema.cmsBlocks)
      .where(eq(schema.cmsBlocks.pageId, fixture.pageIds.aanbod))
  ).find(
    (block) => block.type === 'hero' && (block.data as { variant?: string }).variant === 'pageHead',
  );
  if (!head) throw new Error('17d production package: /aanbod page head missing');
  await withAdminSession(
    { db, cookieJar },
    ctx.admin.id,
    'cms-selftest-17d-production-package',
    async () => {
      const repo = await import('@/lib/cms/repo');
      const saved = await repo.updateBlock(head.id, {
        ...(head.data as Record<string, unknown>),
        subtitle: KEPT_AANBOD_INTRO,
      });
      if (!saved.ok) throw new Error(`17d production package: ${saved.message}`);
      const published = await repo.publishPage(fixture.pageIds.aanbod);
      if (!published.ok) throw new Error(`17d production package: ${published.message}`);
    },
  );

  const [legacy] = await db
    .insert(schema.cmsServices)
    .values({
      locale: 'nl',
      slug,
      name: 'Bikefit – aankoop nieuwe fiets – Jeugd – volledig pakket',
      durationMinutes: 120,
      isActive: true,
    })
    .returning();
  await db
    .insert(schema.cmsProviderServices)
    .values({ providerId: fixture.winstonId, serviceId: legacy.id });
  const before = await fingerprint(db, schema);
  const modes = async () =>
    (
      await db
        .select({ slug: cmsOfferings.slug, mode: cmsOfferings.bookingMode })
        .from(cmsOfferings)
        .where(
          inArray(cmsOfferings.slug, [
            'bikefit-nieuwe-fiets',
            'voetanalyse',
            'zadelanalyse',
            'afstellen-schoenplaatjes',
          ]),
        )
    ).sort((a, b) => a.slug.localeCompare(b.slug));
  const beforeModes = await modes();
  const { listPublicServices } = await import('@/lib/booking/content');
  const subtitle = async () => {
    const draft = (
      await db.select().from(schema.cmsBlocks).where(eq(schema.cmsBlocks.id, head.id))
    )[0];
    const live = parsePublishedSnapshot((await pageRow('aanbod'))?.publishedSnapshot)?.blocks.find(
      (block) => block.id === head.id,
    );
    return [
      (draft?.data as { subtitle?: unknown })?.subtitle,
      (live?.data as { subtitle?: unknown })?.subtitle,
    ];
  };

  await run({ apply: false, restore: null });
  const refused = await applyWatched();
  check(
    'production package: without explicit flag, dry run blocks and apply writes nothing',
    lines.some((line) =>
      line.includes(`active service ${slug} needs explicit --reconcile-prod-youth-service`),
    ) &&
      refused.refusal.includes(`active service ${slug}`) &&
      refused.untouched &&
      (await fingerprint(db, schema)) === before,
    refused.detail,
  );

  await run({ apply: false, restore: null, reconcilePackageService: true });
  check(
    'production package: explicit dry run plans only in-place deactivation and changes no row',
    lines.includes(
      `~ legacy package service ${slug} — isActive: true → false (service row retained)`,
    ) &&
      !lines.some((line) => line.startsWith('!')) &&
      (await fingerprint(db, schema)) === before,
  );

  const audits = await auditCount('patch.aanbod-correcties.apply');
  const error = await attempt(() =>
    run({ apply: true, restore: null, reconcilePackageService: true }),
  );
  const backupPath = backupPathOf();
  const backup = backupPath ? await readCorrectiesBackup(backupPath) : null;
  check(
    'production package: backup precedes soft deactivation; subscriptions and booking modes remain',
    error === '' &&
      Boolean(backupPath) &&
      backup?.services.updated.some(
        (entry) =>
          entry.id === legacy.id &&
          entry.fields.includes('isActive') &&
          entry.row.isActive === true,
      ) === true &&
      (await serviceRow(slug))?.isActive === false &&
      !(await listPublicServices('nl')).some((service) => service.id === legacy.id) &&
      (
        await db
          .select()
          .from(schema.cmsProviderServices)
          .where(eq(schema.cmsProviderServices.serviceId, legacy.id))
      ).length === 1 &&
      JSON.stringify(await modes()) === JSON.stringify(beforeModes) &&
      (await subtitle()).every((value) => value === KEPT_AANBOD_INTRO) &&
      (await auditCount('patch.aanbod-correcties.apply')) === audits + 1,
    error,
  );

  await run({ apply: false, restore: null });
  check(
    'production package: ordinary second dry run is idempotent after deactivation',
    lines.at(-1) === '= dry run: nothing to do' && !lines.some((line) => line.startsWith('!')),
  );
  await run({ apply: true, restore: null, reconcilePackageService: true });
  check(
    'production package: second apply writes no backup or audit',
    lines.includes('= nothing written') &&
      !lines.some((line) => line.includes('backup written')) &&
      (await auditCount('patch.aanbod-correcties.apply')) === audits + 1,
  );

  if (!backupPath) return;
  const inactive = await fingerprint(db, schema);
  await db
    .update(schema.cmsServices)
    .set({ name: 'Changed by editor' })
    .where(eq(schema.cmsServices.id, legacy.id));
  const changed = await fingerprint(db, schema);
  const changedError = await attempt(() => run({ apply: false, restore: backupPath }));
  check(
    'production package: restore rejects changed identity before any correction write',
    changedError.includes('legacy package restore: service identity or references changed') &&
      (await fingerprint(db, schema)) === changed,
    changedError,
  );
  await db
    .update(schema.cmsServices)
    .set({ name: legacy.name })
    .where(eq(schema.cmsServices.id, legacy.id));
  const [unlinked] = await db
    .select()
    .from(cmsOfferingVariants)
    .where(isNull(cmsOfferingVariants.serviceId));
  if (!unlinked) throw new Error('17d production package: no unlinked variant for restore guard');
  await db
    .update(cmsOfferingVariants)
    .set({ serviceId: legacy.id })
    .where(
      and(
        eq(cmsOfferingVariants.offeringId, unlinked.offeringId),
        eq(cmsOfferingVariants.audience, unlinked.audience),
      ),
    );
  const linked = await fingerprint(db, schema);
  const linkedError = await attempt(() => run({ apply: false, restore: backupPath }));
  check(
    'production package: restore rejects new variant link before any correction write',
    linkedError.includes('legacy package restore: service identity or references changed') &&
      (await fingerprint(db, schema)) === linked,
    linkedError,
  );
  await db
    .update(cmsOfferingVariants)
    .set({ serviceId: null })
    .where(
      and(
        eq(cmsOfferingVariants.offeringId, unlinked.offeringId),
        eq(cmsOfferingVariants.audience, unlinked.audience),
      ),
    );
  check(
    'production package: refused restores left baseline inactive state unchanged',
    (await fingerprint(db, schema)) === inactive,
  );
  const restoreError = await attempt(() => run({ apply: false, restore: backupPath }));
  check(
    'production package: restore reactivates the same row and returns the exact visible state',
    restoreError === '' &&
      (await serviceRow(slug))?.isActive === true &&
      (await fingerprint(db, schema)) === before &&
      (await subtitle()).every((value) => value === KEPT_AANBOD_INTRO),
    restoreError,
  );
}
