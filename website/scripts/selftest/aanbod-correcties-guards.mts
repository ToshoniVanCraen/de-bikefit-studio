/**
 * Self-test section 17d, part 5 (`aanbod-correcties.mts` calls it after the restore):
 * what must block, and what must not.
 *
 * Each guard changes one row the way an editor could, expects the named `!` line
 * and the verdict "blocked" (the apply refuses the same way, and writes nothing),
 * and puts the row back. Then two states the patch has to accept as they are, a
 * service text the repo wrote on 20 Oct 2026 and a package service the bootstrap
 * made, and the apply from there, which must reach the end state of the first
 * apply.
 */
import * as orm from 'drizzle-orm';
import { cmsOfferings } from '@/db/cms-offering-schema';
import { DEFAULT_SERVICES } from '@/lib/booking/defaults';
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
  const { schema, locale, lines, run, serviceRow, offeringRow, subscriptions } = kit;
  const defaults = DEFAULT_SERVICES.find((entry) => entry.slug === 'jeugdfit-pakket');

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

  // What the repo left (the prices patch of 20 Oct 2026) is the old text, not an edit; so is a service the bootstrap made.
  await db
    .update(schema.cmsServices)
    .set({
      name: 'Bikefit – huidige fiets – Jeugd',
      choiceLabel: 'Jeugd',
      description: fit!.summary,
    })
    .where(eq(schema.cmsServices.id, youthBefore!.id));
  // As `cms:bootstrap` makes it from the defaults.
  const [bootstrapped] = await db
    .insert(schema.cmsServices)
    .values({
      locale,
      slug: 'jeugdfit-pakket',
      name: defaults?.name ?? '',
      choiceLabel: defaults?.choiceLabel ?? '',
      description: defaults?.description ?? '',
      durationMinutes: defaults?.durationMinutes ?? 120,
      bufferAfterMinutes: 15,
      priceCents: defaults?.priceCents ?? null,
      showPrice: defaults?.showPrice ?? false,
      requiresGuardian: defaults?.requiresGuardian ?? false,
      sortOrder: defaults?.sortOrder ?? 0,
    })
    .returning();
  await run({ apply: false, restore: null });
  check(
    'a service the repo wrote (name "<offering> – Jeugd", the offering summary) is the old text, and a package service the bootstrap made is used, not made again',
    lines.some((line) => line.startsWith('~ service jeugdfit — name: ')) &&
      lines.some(
        (line) =>
          line.startsWith('~ variant bikefit-huidige-fiets — ') &&
          !line.includes('new service') &&
          line.includes('offered by 1 provider(s)'),
      ) &&
      !lines.some((line) => line.startsWith('!')),
    planLines(lines)
      .filter((line) => /service jeugdfit|variant bikefit-huidige/.test(line))
      .join(' | '),
  );
  await run({ apply: true, restore: null });
  const adopted = await serviceRow('jeugdfit-pakket');
  check(
    'apply: the existing package service is the one the variant books through, offered by Winston, and not made twice',
    adopted?.id === bootstrapped.id &&
      (
        await db
          .select()
          .from(schema.cmsServices)
          .where(eq(schema.cmsServices.slug, 'jeugdfit-pakket'))
      ).length === 1 &&
      (await subscriptions(fx.winstonId)).some((row) => row.serviceId === bootstrapped.id),
  );
  const final = await fingerprint(db, schema);
  check(
    'apply from this state reaches the end state of the first apply (the package service made by the bootstrap carries the same facts)',
    final === afterApply,
    diffPrints(afterApply, final),
  );
}
