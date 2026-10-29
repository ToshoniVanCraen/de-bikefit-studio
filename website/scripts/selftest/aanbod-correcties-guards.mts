/**
 * Self-test section 17d, part 5 (`aanbod-correcties.mts` calls it after the restore):
 * what must block, and what must not.
 *
 * Each guard changes one row the way an editor could, expects the named `!` line
 * and the verdict "blocked" (the apply refuses the same way, and writes nothing),
 * and puts the row back. A database that already holds the withdrawn youth package
 * (an earlier run of the patch of 27 Oct 2026) blocks the same way. Then a state
 * the patch has to accept as it is, a service text the repo wrote on 20 Oct 2026,
 * and the apply from there, which must reach the end state of the first apply.
 */
import * as orm from 'drizzle-orm';
import { cmsOfferings, cmsOfferingVariants } from '@/db/cms-offering-schema';
import type { seedBefore } from './aanbod-correcties-fixture.mjs';
import {
  diffPrints,
  fingerprint,
  planLines,
  type CorrectiesKit,
  type CorrectiesSectionContext,
} from './aanbod-correcties-kit.mjs';

const { and, eq } = orm;

export async function guardChecks(env: {
  ctx: CorrectiesSectionContext;
  kit: CorrectiesKit;
  fx: Awaited<ReturnType<typeof seedBefore>>;
  /** The fingerprint after the first apply: the end state the last apply has to reach again. */
  afterApply: string;
}): Promise<void> {
  const { ctx, kit, fx, afterApply } = env;
  const { db, check } = ctx;
  const { schema, locale, lines, run, serviceRow, offeringRow } = kit;

  // --- 5: what must block ----------------------------------------------------------------------
  /**
   * The dry run names the blocker (`!`) and ends "blocked". The apply refuses on any
   * blocker the same way, so it is tried once (`refuses`): nothing is written, no backup.
   */
  const blockedBy = async (label: string, expected: string, refuses = false) => {
    await run({ apply: false, restore: null });
    const blockers = lines.filter((line) => line.startsWith('!'));
    const blocked = lines.at(-1)?.includes('dry run: blocked') === true;
    let refused = !refuses;
    const printBefore = refuses ? await fingerprint(db, schema) : '';
    if (refuses) {
      try {
        await run({ apply: true, restore: null });
      } catch (error) {
        refused = error instanceof Error && error.message.includes('patch refused');
      }
    }
    check(
      `guard: ${label} blocks the dry run (!)${refuses ? ' and the apply; nothing is written' : ''}`,
      blockers.some((line) => line.includes(expected)) &&
        blocked &&
        refused &&
        (!refuses ||
          ((await fingerprint(db, schema)) === printBefore &&
            !lines.some((line) => line.includes('backup written')))),
      blockers.join(' | '),
    );
  };

  const winstonVoet = and(
    eq(schema.cmsProviderServices.providerId, fx.winstonId),
    eq(schema.cmsProviderServices.serviceId, fx.voetanalyseServiceId),
  );
  await db.delete(schema.cmsProviderServices).where(winstonVoet);
  await blockedBy(
    'a service Toshoni is the only provider of',
    'service voetanalyse would be left without a provider',
  );
  await db
    .insert(schema.cmsProviderServices)
    .values({ providerId: fx.winstonId, serviceId: fx.voetanalyseServiceId });

  const fit = await offeringRow('bikefit-huidige-fiets');
  await db
    .update(cmsOfferings)
    .set({ contents: ['Eigen tekst van de redactie.'] })
    .where(eq(cmsOfferings.id, fit!.id));
  await blockedBy(
    'an offering text an editor wrote',
    'offering bikefit-huidige-fiets: contents holds neither the old nor the new text',
  );
  await db
    .update(cmsOfferings)
    .set({ contents: fit!.contents })
    .where(eq(cmsOfferings.id, fit!.id));

  const [team] = await db
    .select()
    .from(schema.cmsBlocks)
    .where(eq(schema.cmsBlocks.pageId, fx.pageIds['ons-team']));
  await db
    .update(schema.cmsBlocks)
    .set({ data: { ...team.data, eyebrow: 'Concept van de redactie' } })
    .where(eq(schema.cmsBlocks.id, team.id));
  await blockedBy("an editor's unpublished draft", 'page /ons-team: has unpublished draft edits');
  await db
    .update(schema.cmsBlocks)
    .set({ data: team.data })
    .where(eq(schema.cmsBlocks.id, team.id));

  const youthBefore = await serviceRow('jeugdfit');
  await db
    .update(schema.cmsServices)
    .set({ name: 'Mijn eigen naam' })
    .where(eq(schema.cmsServices.id, youthBefore!.id));
  await blockedBy(
    'a service name of neither state',
    'service jeugdfit: name holds neither the old nor the new text',
  );

  // What the repo left (the prices patch of 20 Oct 2026) is the old text, not an edit.
  await db
    .update(schema.cmsServices)
    .set({
      name: 'Bikefit – huidige fiets – Jeugd',
      choiceLabel: 'Jeugd',
      description: fit!.summary,
    })
    .where(eq(schema.cmsServices.id, youthBefore!.id));

  // The withdrawn youth package, as the run of 27 Oct 2026 made it on staging: restore first.
  const [pakket] = await db
    .insert(schema.cmsServices)
    .values({
      locale,
      slug: 'jeugdfit-pakket',
      name: 'Jeugdfit – volledig pakket',
      durationMinutes: 120,
      requiresGuardian: true,
    })
    .returning();
  await db.insert(cmsOfferingVariants).values({
    offeringId: fit!.id,
    audience: 'youth-package',
    serviceId: pakket.id,
    priceCents: 27500,
  });
  await blockedBy(
    'a database that holds the withdrawn youth package',
    'youth package: this database holds the withdrawn "Jeugd – volledig pakket" (variant youth-package of bikefit-huidige-fiets, service jeugdfit-pakket) — restore the backup of 27 Oct 2026 first, then run again',
    true,
  );
  await db
    .delete(cmsOfferingVariants)
    .where(
      and(
        eq(cmsOfferingVariants.offeringId, fit!.id),
        eq(cmsOfferingVariants.audience, 'youth-package'),
      ),
    );
  await db.delete(schema.cmsServices).where(eq(schema.cmsServices.id, pakket.id));

  await run({ apply: false, restore: null });
  check(
    'a service the repo wrote (name "<offering> – Jeugd", the offering summary) is the old text; no package is planned',
    lines.some((line) => line.startsWith('~ service jeugdfit — name: ')) &&
      lines.some((line) => line === '~ service jeugdfit — requiresGuardian: true → false') &&
      !planLines(lines).some((line) => /-pakket|volledig pakket|^. variant /.test(line)) &&
      !lines.some((line) => line.startsWith('!')),
    planLines(lines)
      .filter((line) => /service jeugdfit|variant /.test(line))
      .join(' | '),
  );
  await run({ apply: true, restore: null });
  const final = await fingerprint(db, schema);
  check(
    'apply from this state reaches the end state of the first apply',
    final === afterApply,
    diffPrints(afterApply, final),
  );
}
