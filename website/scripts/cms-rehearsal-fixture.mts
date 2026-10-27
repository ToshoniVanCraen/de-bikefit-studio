/** Synthetic pre-27-Oct CMS rehearsal fixture. Never use on a live database. */
import { config } from 'dotenv';
import { and, eq, sql } from 'drizzle-orm';
import { installRequestContextStubs, cookieJar } from './lib/request-context.mjs';
import { KEPT_AANBOD_INTRO as SUBTITLE } from '@/lib/studio/seed-content/corrections-2026-10-27-copy';

config({ path: '.env.local' });
installRequestContextStubs();

const MARKER_KEY = 'rehearsal.fixture.guard';

function option(name: string): string {
  const at = process.argv.indexOf(name);
  if (at < 0 || !process.argv[at + 1] || process.argv[at + 1].startsWith('--')) {
    throw new Error(`${name} requires a value`);
  }
  return process.argv[at + 1];
}

function target() {
  const apply = process.argv.includes('--apply');
  const local = process.argv.includes('--local');
  const expectedHost = option('--expect-host');
  const expectedSite = option('--expect-site');
  const marker = process.env.CMS_REHEARSAL_MARKER;
  if (!marker || !/^[a-f0-9-]{36}$/i.test(marker))
    throw new Error('CMS_REHEARSAL_MARKER must be a branch-specific UUID');
  if (!process.env.CMS_SESSION_SECRET || !process.env.CMS_MFA_ENCRYPTION_KEY) {
    throw new Error('CMS_SESSION_SECRET and CMS_MFA_ENCRYPTION_KEY are required');
  }
  const site = new URL(process.env.NEXT_PUBLIC_SITE_URL ?? '');
  if (site.origin !== expectedSite || site.hostname !== new URL(expectedSite).hostname) {
    throw new Error('NEXT_PUBLIC_SITE_URL does not match --expect-site');
  }
  if (
    !local &&
    (!site.hostname.endsWith('.vercel.app') ||
      !site.hostname.includes('-git-') ||
      site.hostname === 'de-bikefit-studio.vercel.app')
  ) {
    throw new Error(
      'site must be a branch-specific -git- Vercel preview, never staging or production',
    );
  }
  if (local && site.hostname !== 'localhost' && site.hostname !== '127.0.0.1') {
    throw new Error('--local requires a localhost site');
  }
  const url = process.env.DATABASE_URL;
  if (
    local
      ? Boolean(url) || expectedHost !== 'pglite'
      : !url || new URL(url).hostname !== expectedHost
  ) {
    throw new Error('DATABASE_URL host does not match --expect-host (or --local is misconfigured)');
  }
  if (!local && !expectedHost.endsWith('.neon.tech'))
    throw new Error('remote host must be a Neon endpoint');
  return { apply, local, expectedHost, marker };
}

async function main() {
  const { apply, local, expectedHost, marker } = target();
  const [{ getCmsDb }, schema, offerings, mfa] = await Promise.all([
    import('@/db/cms'),
    import('@/db/cms-schema'),
    import('@/db/cms-offering-schema'),
    import('@/db/cms-mfa-schema'),
  ]);
  const db = await getCmsDb();
  const [guard] = await db
    .select({ value: schema.cmsSiteSettings.value })
    .from(schema.cmsSiteSettings)
    .where(
      and(eq(schema.cmsSiteSettings.locale, 'nl'), eq(schema.cmsSiteSettings.key, MARKER_KEY)),
    );
  const value = guard?.value as { marker?: string; state?: string } | undefined;
  if (value?.marker !== marker || !['empty', 'installed'].includes(value?.state ?? '')) {
    throw new Error('rehearsal marker missing or mismatched; no fixture write');
  }
  const rows = await db.execute(
    sql`SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name LIKE 'cms_%' ORDER BY table_name`,
  );
  const tables = ('rows' in rows ? rows.rows : rows) as Array<{ table_name: string }>;
  if (tables.length !== 33) throw new Error(`expected 33 CMS tables, found ${tables.length}`);
  const counts: Record<string, number> = {};
  for (const { table_name: table } of tables) {
    if (!/^cms_[a-z_]+$/.test(table)) throw new Error('unexpected CMS table name');
    const result = await db.execute(sql.raw(`SELECT count(*)::int AS n FROM "${table}"`));
    const counted = ('rows' in result ? result.rows : result) as Array<{ n: number }>;
    counts[table] = Number(counted[0].n);
  }
  if (value.state === 'installed') {
    if (counts.cms_providers !== 2 || counts.cms_offerings !== 9 || counts.cms_pages < 8) {
      throw new Error('installed marker exists but fixture shape drifted; no write');
    }
    console.log('= synthetic rehearsal fixture already installed; nothing written');
    return;
  }
  const occupied = Object.entries(counts).filter(
    ([table, count]) => count !== (table === 'cms_site_settings' ? 1 : 0),
  );
  if (occupied.length)
    throw new Error(`database is not schema-only: ${occupied.map(([t]) => t).join(', ')}`);
  console.log(
    `→ isolated ${local ? 'PGlite' : 'Neon'} target verified (${expectedHost}); 33 CMS tables expected, marker matched`,
  );
  console.log(
    '→ pre-27-Oct synthetic fixture: 9 offerings, direct new-bike/current-bike/analyses, two non-login providers, published pages',
  );
  if (!apply) {
    console.log('= dry run: no rows written; rerun with --apply after checking host and preview');
    return;
  }

  // A deliberately unusable actor: no valid password or TOTP secret, but script sessions can publish.
  const [admin] = await db
    .insert(schema.cmsUsers)
    .values({
      email: 'rehearsal-admin@example.invalid',
      name: 'Rehearsal Admin',
      role: 'admin',
      passwordHash: 'DISABLED-SYNTHETIC-LOGIN',
      mustChangePassword: false,
    })
    .returning({ id: schema.cmsUsers.id });
  await db.insert(mfa.cmsMfaFactors).values({
    userId: admin.id,
    secretEnc: 'DISABLED-SYNTHETIC-MFA',
    confirmedAt: new Date(),
  });
  const { createCorrectiesKit } = await import('./selftest/aanbod-correcties-kit.mjs');
  const { seedBefore } = await import('./selftest/aanbod-correcties-fixture.mjs');
  const kit = await createCorrectiesKit({
    db,
    cookieJar,
    admin: { id: admin.id, email: 'rehearsal-admin@example.invalid' },
    backupDir: '.rollout-backups',
  });
  const fx = await seedBefore(kit, {
    cookieJar,
    admin: { id: admin.id, email: 'rehearsal-admin@example.invalid' },
  });

  // The second profile is a generic fitter. Neither synthetic user can sign in.
  await db
    .update(schema.cmsProviders)
    .set({ displayName: 'Fitter' })
    .where(eq(schema.cmsProviders.id, fx.winstonId));
  await db
    .update(schema.cmsUsers)
    .set({ name: 'Fitter', email: 'fitter@rehearsal.invalid' })
    .where(eq(schema.cmsUsers.email, 'winston-17d@selftest.local'));
  await db
    .update(schema.cmsUsers)
    .set({ email: 'toshoni@rehearsal.invalid' })
    .where(eq(schema.cmsUsers.email, 'toshoni-17d@selftest.local'));
  for (const providerId of [fx.toshoniId, fx.winstonId]) {
    await db.insert(schema.cmsBusinessHours).values(
      [1, 2, 3, 4, 5].map((weekday) => ({
        providerId,
        weekday,
        startMinute: 540,
        endMinute: 1080,
      })),
    );
  }
  const direct = [
    {
      offer: 'bikefit-nieuwe-fiets',
      audience: 'adult',
      slug: 'bikefit-nieuwe-fiets-volwassene',
      name: 'Bikefit – aankoop nieuwe fiets – Volwassene',
      label: 'Volwassene',
      guardian: false,
    },
    {
      offer: 'bikefit-nieuwe-fiets',
      audience: 'youth',
      slug: 'bikefit-nieuwe-fiets-jeugd',
      name: 'Bikefit – aankoop nieuwe fiets – Jeugd',
      label: 'Jeugd',
      guardian: true,
    },
    {
      offer: 'zadelanalyse',
      audience: 'all',
      slug: 'zadelanalyse',
      name: 'Zadelanalyse',
      label: 'Zadelanalyse',
      guardian: false,
    },
    {
      offer: 'afstellen-schoenplaatjes',
      audience: 'all',
      slug: 'afstellen-schoenplaatjes',
      name: 'Afstellen schoenplaatjes',
      label: 'Afstellen schoenplaatjes',
      guardian: false,
    },
  ] as const;
  for (const item of direct) {
    const [service] = await db
      .insert(schema.cmsServices)
      .values({
        locale: 'nl',
        slug: item.slug,
        name: item.name,
        choiceLabel: item.label,
        description: 'Synthetische previewdienst',
        durationMinutes: 60,
        bufferAfterMinutes: 15,
        priceCents: null,
        showPrice: false,
        requiresGuardian: item.guardian,
      })
      .returning({ id: schema.cmsServices.id });
    const [offer] = await db
      .select({ id: offerings.cmsOfferings.id })
      .from(offerings.cmsOfferings)
      .where(eq(offerings.cmsOfferings.slug, item.offer));
    if (!offer) throw new Error(`missing offer ${item.offer}`);
    await db
      .update(offerings.cmsOfferings)
      .set({ bookingMode: 'direct' })
      .where(eq(offerings.cmsOfferings.id, offer.id));
    const variants = await db
      .update(offerings.cmsOfferingVariants)
      .set({ serviceId: service.id })
      .where(
        and(
          eq(offerings.cmsOfferingVariants.offeringId, offer.id),
          eq(offerings.cmsOfferingVariants.audience, item.audience),
        ),
      )
      .returning({ audience: offerings.cmsOfferingVariants.audience });
    if (variants.length !== 1)
      throw new Error(`expected one variant for ${item.offer}/${item.audience}`);
    for (const providerId of [fx.toshoniId, fx.winstonId]) {
      await db.insert(schema.cmsProviderServices).values({ providerId, serviceId: service.id });
    }
  }
  // The foot service was created by the old-state fixture; mirror the service/variant price split.
  await db
    .update(schema.cmsServices)
    .set({ priceCents: null, showPrice: false })
    .where(eq(schema.cmsServices.id, fx.voetanalyseServiceId));
  // The exact supplied public text is an editor-owned /aanbod field, preserved by the companion correction guard.
  const [hero] = await db
    .select()
    .from(schema.cmsBlocks)
    .where(
      and(eq(schema.cmsBlocks.pageId, fx.pageIds['aanbod']), eq(schema.cmsBlocks.type, 'hero')),
    );
  if (!hero) throw new Error('/aanbod hero missing');
  await db
    .update(schema.cmsBlocks)
    .set({ data: { ...hero.data, subtitle: SUBTITLE } })
    .where(eq(schema.cmsBlocks.id, hero.id));
  const { withAdminSession } = await import('./lib/aanbod-rollout-run.mjs');
  await withAdminSession({ db, cookieJar }, admin.id, 'synthetic-rehearsal-fixture', async () => {
    const repo = await import('@/lib/cms/repo');
    const published = await repo.publishPage(fx.pageIds['aanbod']);
    if (!published.ok) throw new Error(`/aanbod publish failed: ${published.message}`);
  });
  await db
    .update(schema.cmsSiteSettings)
    .set({ value: { marker, state: 'installed' } })
    .where(
      and(eq(schema.cmsSiteSettings.locale, 'nl'), eq(schema.cmsSiteSettings.key, MARKER_KEY)),
    );
  console.log(
    '✓ synthetic fixture installed; no customer rows, no real logins, no integration credentials',
  );
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(`✗ rehearsal fixture: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  });
